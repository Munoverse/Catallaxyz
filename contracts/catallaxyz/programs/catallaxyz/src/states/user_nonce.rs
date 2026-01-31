use anchor_lang::prelude::*;

/// User nonce account for order cancellation
/// 
/// Nonce-based cancellation mechanism (Polymarket-style):
/// - Each user has a single nonce value
/// - Orders with nonce < current_nonce are considered cancelled
/// - User can increment nonce to cancel all pending orders at once
/// - Individual orders can also be cancelled via cancel_order instruction
#[account]
pub struct UserNonce {
    /// User's public key
    pub user: Pubkey,
    
    /// Current valid nonce
    /// Orders with nonce < this value are automatically invalid/cancelled
    pub current_nonce: u64,
    
    /// PDA bump seed
    pub bump: u8,
}

impl UserNonce {
    /// Seed prefix for UserNonce PDA
    pub const SEED_PREFIX: &'static [u8] = b"user_nonce";
    
    /// Space calculation for account initialization
    /// discriminator(8) + user(32) + current_nonce(8) + bump(1)
    pub const INIT_SPACE: usize = 8 + 32 + 8 + 1;
    
    /// Check if a nonce is valid (not yet used/cancelled)
    pub fn is_valid_nonce(&self, nonce: u64) -> bool {
        nonce >= self.current_nonce
    }
    
    /// Increment nonce to cancel all orders with nonce < new_nonce
    pub fn increment(&mut self) -> Result<u64> {
        self.current_nonce = self.current_nonce
            .checked_add(1)
            .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)?;
        Ok(self.current_nonce)
    }
    
    /// Set nonce to a specific value (must be >= current)
    pub fn set_nonce(&mut self, new_nonce: u64) -> Result<()> {
        require!(
            new_nonce >= self.current_nonce,
            crate::errors::TerminatorError::InvalidInput
        );
        self.current_nonce = new_nonce;
        Ok(())
    }
}

/// Find UserNonce PDA address
pub fn find_user_nonce_pda(user: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[UserNonce::SEED_PREFIX, user.as_ref()],
        program_id,
    )
}
