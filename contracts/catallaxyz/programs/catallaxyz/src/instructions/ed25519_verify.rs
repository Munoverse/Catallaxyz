//! Ed25519 Signature Verification Utilities
//! 
//! Shared module for Ed25519 signature verification used by fill_order and match_orders.
//! Extracts common verification logic to avoid code duplication.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};
use core::str::FromStr;
use crate::errors::TerminatorError;

/// Ed25519 program ID
const ED25519_PROGRAM_ID: &str = "Ed25519SigVerify111111111111111111111111111";

/// Read u16 from instruction data at offset
pub fn read_u16(data: &[u8], offset: &mut usize) -> Result<u16> {
    let end = offset.saturating_add(2);
    require!(end <= data.len(), TerminatorError::InvalidSignature);
    let value = u16::from_le_bytes([data[*offset], data[*offset + 1]]);
    *offset = end;
    Ok(value)
}

/// Verify Ed25519 signature at a specific instruction index
/// 
/// # Arguments
/// * `instructions` - Instructions sysvar account
/// * `ix_index` - Index of the Ed25519 instruction to verify
/// * `expected_pubkey` - Expected signer public key
/// * `expected_msg` - Expected message that was signed
/// * `expected_sig` - Expected signature (64 bytes)
pub fn verify_ed25519_at_index(
    instructions: &AccountInfo,
    ix_index: usize,
    expected_pubkey: &Pubkey,
    expected_msg: &[u8],
    expected_sig: &[u8; 64],
) -> Result<()> {
    let ed25519_ix = load_instruction_at_checked(ix_index, instructions)?;
    let ed25519_program_id =
        Pubkey::from_str(ED25519_PROGRAM_ID)
            .map_err(|_| TerminatorError::InvalidSignature)?;
    require!(
        ed25519_ix.program_id == ed25519_program_id,
        TerminatorError::InvalidSignature
    );

    let data = ed25519_ix.data.as_slice();
    require!(data.len() >= 2, TerminatorError::InvalidSignature);
    let num_signatures = data[0];
    require!(num_signatures == 1, TerminatorError::InvalidSignature);

    let mut offset = 2;
    let sig_offset = read_u16(data, &mut offset)?;
    let sig_ix_index = read_u16(data, &mut offset)?;
    let pubkey_offset = read_u16(data, &mut offset)?;
    let pubkey_ix_index = read_u16(data, &mut offset)?;
    let msg_offset = read_u16(data, &mut offset)?;
    let msg_size = read_u16(data, &mut offset)?;
    let msg_ix_index = read_u16(data, &mut offset)?;

    const INSTRUCTION_DATA_INDEX: u16 = u16::MAX;
    require!(
        sig_ix_index == INSTRUCTION_DATA_INDEX
            && pubkey_ix_index == INSTRUCTION_DATA_INDEX
            && msg_ix_index == INSTRUCTION_DATA_INDEX,
        TerminatorError::InvalidSignature
    );

    let sig_start = sig_offset as usize;
    let sig_end = sig_start.saturating_add(64);
    let pk_start = pubkey_offset as usize;
    let pk_end = pk_start.saturating_add(32);
    let msg_start = msg_offset as usize;
    let msg_end = msg_start.saturating_add(msg_size as usize);

    require!(
        sig_end <= data.len() && pk_end <= data.len() && msg_end <= data.len(),
        TerminatorError::InvalidSignature
    );
    require!(msg_size as usize == expected_msg.len(), TerminatorError::InvalidSignature);
    require!(
        data[sig_start..sig_end] == expected_sig[..],
        TerminatorError::InvalidSignature
    );
    require!(
        data[pk_start..pk_end] == expected_pubkey.to_bytes(),
        TerminatorError::InvalidSignature
    );
    require!(
        &data[msg_start..msg_end] == expected_msg,
        TerminatorError::InvalidSignature
    );

    Ok(())
}

/// Verify Ed25519 signature from the preceding instruction
/// 
/// # Arguments
/// * `instructions` - Instructions sysvar account
/// * `expected_pubkey` - Expected signer public key
/// * `expected_msg` - Expected message that was signed
/// * `expected_sig` - Expected signature (64 bytes)
pub fn verify_ed25519_preceding(
    instructions: &AccountInfo,
    expected_pubkey: &Pubkey,
    expected_msg: &[u8],
    expected_sig: &[u8; 64],
) -> Result<()> {
    let current_index = load_current_index_checked(instructions)?;
    require!(current_index > 0, TerminatorError::InvalidSignature);
    
    verify_ed25519_at_index(
        instructions,
        (current_index - 1) as usize,
        expected_pubkey,
        expected_msg,
        expected_sig,
    )
}

/// Get the current instruction index
pub fn get_current_instruction_index(instructions: &AccountInfo) -> Result<u16> {
    load_current_index_checked(instructions).map_err(|e| e.into())
}
