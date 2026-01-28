/**
 * Treasury Utility Macros and Functions
 * AUDIT FIX: Centralized treasury initialization patterns to reduce code duplication
 */

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::errors::TerminatorError;

/// Verify USDC mint matches global configuration
/// 
/// # Arguments
/// * `usdc_mint` - The USDC mint to verify
/// * `global_usdc_mint` - The expected USDC mint from global state
/// 
/// # Returns
/// * `Result<()>` - Ok if mints match, Error otherwise
pub fn verify_usdc_mint(usdc_mint: &Pubkey, global_usdc_mint: &Pubkey) -> Result<()> {
    require!(
        usdc_mint == global_usdc_mint,
        TerminatorError::InvalidUsdcMint
    );
    Ok(())
}

/// Common treasury token account constraints
/// 
/// This function validates common constraints for treasury token accounts:
/// - Mint matches expected USDC mint
/// - Owner is the correct PDA
/// 
/// # Arguments
/// * `treasury` - The treasury token account to validate
/// * `expected_mint` - The expected USDC mint
/// * `expected_owner` - The expected owner PDA
pub fn validate_treasury_token_account(
    treasury: &InterfaceAccount<'_, TokenAccount>,
    expected_mint: &Pubkey,
    expected_owner: &Pubkey,
) -> Result<()> {
    require!(
        treasury.mint == *expected_mint,
        TerminatorError::InvalidUsdcMint
    );
    require!(
        treasury.owner == *expected_owner,
        TerminatorError::Unauthorized
    );
    Ok(())
}

/// Log treasury initialization
/// 
/// # Arguments
/// * `treasury_type` - Type of treasury (platform, creator, reward)
/// * `treasury_key` - The treasury account public key
pub fn log_treasury_init(treasury_type: &str, treasury_key: &Pubkey) {
    msg!("{} treasury initialized: {}", treasury_type, treasury_key);
}

/// Calculate treasury PDA seeds
/// 
/// Returns the base seeds for different treasury types
pub mod seeds {
    pub const PLATFORM_TREASURY: &[u8] = b"platform_treasury";
    pub const CREATOR_TREASURY: &[u8] = b"creator_treasury";
    pub const REWARD_TREASURY: &[u8] = b"reward_treasury";
    pub const MARKET_VAULT: &[u8] = b"market_vault";
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::Pubkey;

    #[test]
    fn test_verify_usdc_mint_success() {
        let mint = Pubkey::new_unique();
        assert!(verify_usdc_mint(&mint, &mint).is_ok());
    }

    #[test]
    fn test_verify_usdc_mint_failure() {
        let mint1 = Pubkey::new_unique();
        let mint2 = Pubkey::new_unique();
        assert!(verify_usdc_mint(&mint1, &mint2).is_err());
    }
}
