use crate::constants::{PRICE_SCALE, PRICE_TOLERANCE};
use crate::errors::TerminatorError;
use anchor_lang::prelude::*;

/// Result of fee computation for a trade
#[derive(Debug, Clone, Copy)]
pub struct TradeFeesResult {
    pub taker_fee: u64,
    pub maker_rebate: u64,
    pub platform_fee: u64,
    pub creator_incentive: u64,
}

/// Calculate trading fees for a given trade size and price.
///
/// # Arguments
/// * `size` - Trade size in lamports (6 decimals)
/// * `price` - Trade price in lamports (6 decimals, 0-1_000_000)
/// * `base_fee_rate` - Base fee rate (scaled by 10^6)
/// * `platform_fee_rate` - Platform's share of fees (scaled by 10^6)
/// * `maker_rebate_rate` - Maker rebate rate (scaled by 10^6)
/// * `creator_incentive_rate` - Creator incentive rate (scaled by 10^6)
///
/// # Returns
/// `TradeFeesResult` containing all computed fee components
pub fn compute_trade_fees(
    size: u64,
    price: u64,
    base_fee_rate: u32,
    platform_fee_rate: u32,
    maker_rebate_rate: u32,
    creator_incentive_rate: u32,
) -> Result<TradeFeesResult> {
    // Trade value = size * price / 1_000_000
    let trade_value = (size as u128)
        .checked_mul(price as u128)
        .and_then(|x| x.checked_div(PRICE_SCALE as u128))
        .ok_or(TerminatorError::ArithmeticOverflow)? as u64;

    // Taker fee = trade_value * base_fee_rate / 1_000_000
    let taker_fee = (trade_value as u128)
        .checked_mul(base_fee_rate as u128)
        .and_then(|x| x.checked_div(PRICE_SCALE as u128))
        .ok_or(TerminatorError::ArithmeticOverflow)? as u64;

    // Maker rebate = trade_value * maker_rebate_rate / 1_000_000
    let maker_rebate = (trade_value as u128)
        .checked_mul(maker_rebate_rate as u128)
        .and_then(|x| x.checked_div(PRICE_SCALE as u128))
        .ok_or(TerminatorError::ArithmeticOverflow)? as u64;

    // Platform fee = taker_fee * platform_fee_rate / 1_000_000
    let platform_fee = (taker_fee as u128)
        .checked_mul(platform_fee_rate as u128)
        .and_then(|x| x.checked_div(PRICE_SCALE as u128))
        .ok_or(TerminatorError::ArithmeticOverflow)? as u64;

    // Creator incentive = taker_fee * creator_incentive_rate / 1_000_000
    let creator_incentive = (taker_fee as u128)
        .checked_mul(creator_incentive_rate as u128)
        .and_then(|x| x.checked_div(PRICE_SCALE as u128))
        .ok_or(TerminatorError::ArithmeticOverflow)? as u64;

    Ok(TradeFeesResult {
        taker_fee,
        maker_rebate,
        platform_fee,
        creator_incentive,
    })
}

/// Validate that a price is within the valid range [0, PRICE_SCALE].
///
/// Use this for market trading (settle_trade) where prices are set freely by users.
/// In trading, YES and NO prices are independently determined by market orders
/// and do NOT need to sum to 1.0.
pub fn validate_price(price: u64) -> Result<()> {
    require!(price <= PRICE_SCALE, TerminatorError::InvalidInput);
    Ok(())
}

/// Validate that YES + NO prices sum to approximately 1.0 (within tolerance).
///
/// Use this ONLY for settlement/termination/redemption scenarios where the
/// final prices must sum to 1.0 for proper USDC distribution.
/// Do NOT use for regular trading - market prices are user-driven.
pub fn validate_price_sum(yes_price: u64, no_price: u64) -> Result<()> {
    let price_sum = yes_price
        .checked_add(no_price)
        .ok_or(TerminatorError::ArithmeticOverflow)?;

    require!(
        price_sum >= PRICE_SCALE.saturating_sub(PRICE_TOLERANCE)
            && price_sum <= PRICE_SCALE.saturating_add(PRICE_TOLERANCE),
        TerminatorError::InvalidInput
    );
    Ok(())
}

/// Derive final prices from market state with fallbacks.
///
/// Returns (yes_price, no_price) ensuring they sum to PRICE_SCALE.
///
/// Use this for market termination/settlement scenarios where we need
/// to determine redemption prices. The YES+NO=1 constraint is enforced
/// because these prices will be used for USDC distribution to position holders.
pub fn derive_final_prices(
    last_yes_price: Option<u64>,
    last_no_price: Option<u64>,
) -> (u64, u64) {
    let yes_price = match (last_yes_price, last_no_price) {
        (Some(yes), _) => yes.min(PRICE_SCALE),
        (None, Some(no)) => PRICE_SCALE.saturating_sub(no.min(PRICE_SCALE)),
        (None, None) => PRICE_SCALE / 2,
    };
    let no_price = PRICE_SCALE.saturating_sub(yes_price);
    (yes_price, no_price)
}

/// Scale a value by a rate with proper precision.
///
/// Computes: value * rate / PRICE_SCALE
pub fn scale_by_rate(value: u64, rate: u32) -> Result<u64> {
    (value as u128)
        .checked_mul(rate as u128)
        .and_then(|x| x.checked_div(PRICE_SCALE as u128))
        .map(|x| x as u64)
        .ok_or_else(|| TerminatorError::ArithmeticOverflow.into())
}
