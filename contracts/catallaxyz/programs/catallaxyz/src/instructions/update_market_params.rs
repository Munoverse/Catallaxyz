use anchor_lang::prelude::*;
use crate::constants::GLOBAL_SEED;
use crate::errors::TerminatorError;
use crate::events::MarketParamsUpdated;
use crate::states::{global::Global, market::Market};

/// Update market parameters (admin only)
///
/// Allows admin to adjust per-market settings:
/// - termination_probability: probability per trade (scaled by 10^6, 1000 = 0.1%)
///
/// Note: Fee rates (platform/maker/creator) are now managed globally via update_fee_rates.
/// See Global.calculate_taker_fee_rate() for fee calculation.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateMarketParamsInput {
    /// New termination probability (scaled by 10^6, optional)
    /// Example: 1000 = 0.1% per trade
    pub termination_probability: Option<u32>,
}

#[derive(Accounts)]
pub struct UpdateMarketParamsAccounts<'info> {
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

    /// Market to update
    #[account(mut)]
    pub market: Account<'info, Market>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UpdateMarketParamsAccounts>, params: UpdateMarketParamsInput) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    if let Some(probability) = params.termination_probability {
        // 0% - 100% (scaled by 10^6)
        require!(probability <= 1_000_000, TerminatorError::InvalidInput);
        market.termination_probability = probability;
    }

    emit!(MarketParamsUpdated {
        market: market.key(),
        updated_by: ctx.accounts.authority.key(),
        termination_probability: market.termination_probability,
        updated_at: clock.unix_timestamp,
    });

    msg!("Market parameters updated: {}", market.key());
    msg!(
        "  Termination probability: {} (scaled by 10^6, {} %)",
        market.termination_probability,
        market.termination_probability as f64 / 10_000.0
    );

    Ok(())
}
