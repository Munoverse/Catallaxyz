use anchor_lang::prelude::*;

#[account]
pub struct UserPosition {
    pub user: Pubkey,
    pub market: Pubkey,
    pub yes_balance: u64,
    pub no_balance: u64,
    pub bump: u8,
}

impl UserPosition {
    pub const INIT_SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1;
}
