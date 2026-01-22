use anchor_lang::prelude::*;
use crate::constants::{GLOBAL_SEED, MARKET_SEED};
use crate::errors::TerminatorError;
use crate::events::MarketPaused;
use crate::states::{global::Global, market::Market};

/// Pause a market (admin only)
/// 
/// Emergency stop mechanism to halt trading in case of:
/// - Security issues discovered
/// - Oracle manipulation
/// - Extreme market conditions
/// - Protocol upgrade maintenance
/// 
/// When paused:
/// - No new trades can be executed
/// - No new orders can be placed
/// - Users can still cancel existing orders
/// - Users can still merge positions
#[derive(Accounts)]
pub struct PauseMarket<'info> {
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

    /// Market to pause
    #[account(
        mut,
        seeds = [
            MARKET_SEED.as_bytes(),
            market.creator.as_ref(),
            market.market_id.as_ref(),
        ],
        bump = market.bump,
        constraint = !market.is_paused @ TerminatorError::InvalidMarketType,
    )]
    pub market: Account<'info, Market>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<PauseMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    // Pause the market
    market.pause(clock.unix_timestamp);

    emit!(MarketPaused {
        market: market.key(),
        paused_by: ctx.accounts.authority.key(),
        paused_at: clock.unix_timestamp,
    });

    msg!("Market paused by admin: {}", market.key());
    msg!("Paused at: {}", clock.unix_timestamp);
    msg!("Trading and order placement are now disabled");

    Ok(())
}
