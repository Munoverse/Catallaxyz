use anchor_lang::prelude::*;

#[account]
pub struct UserBalance {
    pub user: Pubkey,
    pub market: Pubkey,
    pub usdc_balance: u64,
    pub bump: u8,
}

impl UserBalance {
    pub const INIT_SPACE: usize = 8 + 32 + 32 + 8 + 1;
}
