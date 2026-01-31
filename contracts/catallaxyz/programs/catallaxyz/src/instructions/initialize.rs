use anchor_lang::prelude::*;
use crate::constants::GLOBAL_SEED;
use crate::states::global::{Global, default_fees};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub usdc_mint: Pubkey,
    /// Optional keeper wallet for automated tasks. If None, defaults to authority.
    pub keeper: Option<Pubkey>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Global::INIT_SPACE,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump
    )]
    pub global: Account<'info, Global>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    let global = &mut ctx.accounts.global;
    global.authority = ctx.accounts.authority.key();
    global.usdc_mint = params.usdc_mint;
    // Set keeper to provided value or default to authority
    global.keeper = params.keeper.unwrap_or(ctx.accounts.authority.key());
    global.bump = ctx.bumps.global;
    global.platform_treasury_bump = 0; // Will be set by init_platform_treasury
    global.total_trading_fees_collected = 0;
    global.total_creation_fees_collected = 0;
    
    // Initialize global fee rates with defaults
    global.center_taker_fee_rate = default_fees::CENTER_TAKER_FEE_RATE;
    global.extreme_taker_fee_rate = default_fees::EXTREME_TAKER_FEE_RATE;
    global.platform_fee_rate = default_fees::PLATFORM_FEE_RATE;
    global.maker_rebate_rate = default_fees::MAKER_REBATE_RATE;
    global.creator_incentive_rate = default_fees::CREATOR_INCENTIVE_RATE;
    
    // ============================================
    // Exchange (Polymarket-style) Initialization
    // ============================================
    
    // Trading is enabled by default
    global.trading_paused = false;
    
    // No operators initially (authority is always an implicit operator)
    global.operator_count = 0;
    global.operators = [Pubkey::default(); 10];

    Ok(())
}
