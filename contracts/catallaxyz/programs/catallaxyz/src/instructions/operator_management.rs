//! Operator Management Instructions
//! 
//! Admin-only instructions to manage operators who can execute trades.

use anchor_lang::prelude::*;
use crate::constants::GLOBAL_SEED;
use crate::errors::TerminatorError;
use crate::events::{OperatorAdded, OperatorRemoved};
use crate::states::Global;

// ============================================
// Add Operator
// ============================================

#[derive(Accounts)]
pub struct AddOperator<'info> {
    /// Admin (authority)
    #[account(
        constraint = admin.key() == global.authority @ TerminatorError::NotAdmin
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump,
    )]
    pub global: Account<'info, Global>,
}

/// Parameters for add_operator instruction
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct AddOperatorParams {
    pub operator: Pubkey,
}

pub fn handler_add_operator(ctx: Context<AddOperator>, params: AddOperatorParams) -> Result<()> {
    let clock = Clock::get()?;
    let global = &mut ctx.accounts.global;
    
    // Add operator
    global.add_operator(params.operator)?;
    
    // Emit event
    emit!(OperatorAdded {
        operator: params.operator,
        added_by: ctx.accounts.admin.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Operator added: {}", params.operator);
    
    Ok(())
}

// ============================================
// Remove Operator
// ============================================

#[derive(Accounts)]
pub struct RemoveOperator<'info> {
    /// Admin (authority)
    #[account(
        constraint = admin.key() == global.authority @ TerminatorError::NotAdmin
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump,
    )]
    pub global: Account<'info, Global>,
}

/// Parameters for remove_operator instruction
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RemoveOperatorParams {
    pub operator: Pubkey,
}

pub fn handler_remove_operator(ctx: Context<RemoveOperator>, params: RemoveOperatorParams) -> Result<()> {
    let clock = Clock::get()?;
    let global = &mut ctx.accounts.global;
    
    // Remove operator
    global.remove_operator(params.operator)?;
    
    // Emit event
    emit!(OperatorRemoved {
        operator: params.operator,
        removed_by: ctx.accounts.admin.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Operator removed: {}", params.operator);
    
    Ok(())
}
