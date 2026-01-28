use anchor_lang::prelude::*;
use crate::constants::GLOBAL_SEED;
use crate::errors::TerminatorError;
use crate::events::GlobalFeeRatesUpdated;
use crate::states::global::Global;

/// Update global fee rates (admin only)
/// 
/// Allows admin to adjust the platform-wide fee configuration:
/// - center_taker_fee_rate: Fee at 50% probability (maximum)
/// - extreme_taker_fee_rate: Fee at 0%/100% probability (minimum)
/// - platform_fee_rate: Platform's share of fees
/// - maker_rebate_rate: Maker's rebate share
/// - creator_incentive_rate: Creator's incentive share
/// 
/// All markets read from the Global account, so changes take effect immediately.
/// 
/// Constraints:
/// - Fee rates must be between 0 and 10% (0-100,000 scaled by 10^6)
/// - center_rate must be >= extreme_rate
/// - platform + maker + creator rates must equal 100% (1,000,000)
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateFeeRatesParams {
    /// New center fee rate (at 50% probability, scaled by 10^6)
    /// Example: 32000 = 3.2%
    pub center_taker_fee_rate: u32,
    
    /// New extreme fee rate (at 0%/100% probability, scaled by 10^6)
    /// Example: 2000 = 0.2%
    pub extreme_taker_fee_rate: u32,
    
    /// Platform fee share (scaled by 10^6)
    /// Example: 750000 = 75%
    pub platform_fee_rate: u32,
    
    /// Maker rebate rate (scaled by 10^6)
    /// Example: 200000 = 20%
    pub maker_rebate_rate: u32,
    
    /// Creator incentive rate (scaled by 10^6)
    /// Example: 50000 = 5%
    pub creator_incentive_rate: u32,
}

#[derive(Accounts)]
pub struct UpdateFeeRates<'info> {
    /// Global authority (program admin)
    #[account(
        constraint = authority.key() == global.authority @ TerminatorError::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// Global state - now stores all fee configuration
    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump
    )]
    pub global: Account<'info, Global>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UpdateFeeRates>, params: UpdateFeeRatesParams) -> Result<()> {
    let global = &mut ctx.accounts.global;
    let clock = Clock::get()?;

    // Validate taker fee rates (maximum 10%)
    const MAX_TAKER_FEE_RATE: u32 = 100_000;
    
    require!(
        params.center_taker_fee_rate <= MAX_TAKER_FEE_RATE,
        TerminatorError::InvalidFeeRate
    );
    
    require!(
        params.extreme_taker_fee_rate <= MAX_TAKER_FEE_RATE,
        TerminatorError::InvalidFeeRate
    );
    
    // Center rate must be >= extreme rate (fee curve logic)
    require!(
        params.center_taker_fee_rate >= params.extreme_taker_fee_rate,
        TerminatorError::InvalidFeeConfiguration
    );
    
    // Validate fee distribution (must sum to 100%)
    // AUDIT FIX v1.1.0: Use checked_add instead of saturating_add for clarity
    const RATE_SCALE: u32 = 1_000_000;
    let total_distribution = params.platform_fee_rate
        .checked_add(params.maker_rebate_rate)
        .and_then(|sum| sum.checked_add(params.creator_incentive_rate))
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    
    require!(
        total_distribution == RATE_SCALE,
        TerminatorError::InvalidFeeConfiguration
    );

    // Update global fee rates
    global.center_taker_fee_rate = params.center_taker_fee_rate;
    global.extreme_taker_fee_rate = params.extreme_taker_fee_rate;
    global.platform_fee_rate = params.platform_fee_rate;
    global.maker_rebate_rate = params.maker_rebate_rate;
    global.creator_incentive_rate = params.creator_incentive_rate;

    emit!(GlobalFeeRatesUpdated {
        updated_by: ctx.accounts.authority.key(),
        center_taker_fee_rate: params.center_taker_fee_rate,
        extreme_taker_fee_rate: params.extreme_taker_fee_rate,
        platform_fee_rate: params.platform_fee_rate,
        maker_rebate_rate: params.maker_rebate_rate,
        creator_incentive_rate: params.creator_incentive_rate,
        updated_at: clock.unix_timestamp,
    });

    msg!("Global fee rates updated");
    msg!("Center taker rate: {}%", params.center_taker_fee_rate as f64 / 10_000.0);
    msg!("Extreme taker rate: {}%", params.extreme_taker_fee_rate as f64 / 10_000.0);
    msg!("Platform share: {}%", params.platform_fee_rate as f64 / 10_000.0);
    msg!("Maker rebate: {}%", params.maker_rebate_rate as f64 / 10_000.0);
    msg!("Creator incentive: {}%", params.creator_incentive_rate as f64 / 10_000.0);

    Ok(())
}
