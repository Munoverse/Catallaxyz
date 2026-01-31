use anchor_lang::prelude::*;

/// Order status tracking for partial fills
/// 
/// Each order has a corresponding OrderStatus PDA that tracks:
/// - Whether the order is filled or cancelled
/// - Remaining amount that can still be filled
/// 
/// This enables partial fills where an order can be matched multiple times
/// until fully filled.
#[account]
pub struct OrderStatus {
    /// Order hash (32-byte keccak256 hash)
    pub order_hash: [u8; 32],
    
    /// Whether the order is fully filled or cancelled
    pub is_filled_or_cancelled: bool,
    
    /// Remaining maker amount that can still be filled
    /// Initialized to order.maker_amount on first fill
    /// Decremented on each partial fill
    pub remaining: u64,
    
    /// PDA bump seed
    pub bump: u8,
}

impl OrderStatus {
    /// Seed prefix for OrderStatus PDA
    pub const SEED_PREFIX: &'static [u8] = b"order_status";
    
    /// Space calculation for account initialization
    /// discriminator(8) + order_hash(32) + is_filled_or_cancelled(1) + remaining(8) + bump(1)
    pub const INIT_SPACE: usize = 8 + 32 + 1 + 8 + 1;
    
    /// Initialize order status for a new order
    pub fn init(&mut self, order_hash: [u8; 32], maker_amount: u64, bump: u8) {
        self.order_hash = order_hash;
        self.is_filled_or_cancelled = false;
        self.remaining = maker_amount;
        self.bump = bump;
    }
    
    /// Check if order can be filled
    pub fn is_fillable(&self) -> bool {
        !self.is_filled_or_cancelled && self.remaining > 0
    }
    
    /// Fill a portion of the order
    /// Returns the actual amount filled (may be less if not enough remaining)
    pub fn fill(&mut self, amount: u64) -> Result<u64> {
        require!(
            self.is_fillable(),
            crate::errors::TerminatorError::OrderNotFillable
        );
        
        // Calculate actual fill amount (capped at remaining)
        let actual_fill = amount.min(self.remaining);
        
        // Update remaining
        self.remaining = self.remaining
            .checked_sub(actual_fill)
            .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)?;
        
        // Mark as filled if no remaining
        if self.remaining == 0 {
            self.is_filled_or_cancelled = true;
        }
        
        Ok(actual_fill)
    }
    
    /// Cancel the order
    pub fn cancel(&mut self) {
        self.is_filled_or_cancelled = true;
    }
    
    /// Check if order is cancelled (filled_or_cancelled but has remaining)
    pub fn is_cancelled(&self) -> bool {
        self.is_filled_or_cancelled && self.remaining > 0
    }
    
    /// Check if order is fully filled
    pub fn is_fully_filled(&self) -> bool {
        self.is_filled_or_cancelled && self.remaining == 0
    }
    
    /// Get filled amount
    pub fn get_filled_amount(&self, original_amount: u64) -> u64 {
        original_amount.saturating_sub(self.remaining)
    }
}

/// Find OrderStatus PDA address
pub fn find_order_status_pda(order_hash: &[u8; 32], program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[OrderStatus::SEED_PREFIX, order_hash],
        program_id,
    )
}
