use anchor_lang::prelude::*;
use crate::constants::{GLOBAL_SEED, MARKET_SEED};
use crate::errors::TerminatorError;
use crate::events::MarketResumed;
use crate::states::{global::Global, market::Market};

/// Resume a paused market (admin only)
/// 
/// Re-enables trading after emergency pause
/// 
/// After resume:
/// - Trading is enabled
/// - Order placement is enabled
/// - Market operates normally
#[derive(Accounts)]
pub struct ResumeMarket<'info> {
    /// Global authority (program admin)
    #[account(
        constraint = authority.key() == global.authority @ TerminatorError::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// Global state
    #[account(
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump
    )]
    pub global: Account<'info, Global>,

    /// Market to resume
    #[account(
        mut,
        seeds = [
            MARKET_SEED.as_bytes(),
            market.creator.as_ref(),
            market.market_id.as_ref(),
        ],
        bump = market.bump,
        // AUDIT FIX: Use specific error type
        constraint = market.is_paused @ TerminatorError::MarketNotPaused,
    )]
    pub market: Account<'info, Market>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ResumeMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    // Resume the market and reset activity time to prevent immediate inactivity termination
    market.resume(clock.unix_timestamp, clock.slot);

    emit!(MarketResumed {
        market: market.key(),
        resumed_by: ctx.accounts.authority.key(),
        resumed_at: clock.unix_timestamp,
    });

    msg!("Market resumed by admin: {}", market.key());
    msg!("Resumed at: {}", clock.unix_timestamp);
    msg!("Activity timestamp reset to prevent immediate inactivity termination");
    msg!("Trading and order placement are now enabled");

    Ok(())
}
