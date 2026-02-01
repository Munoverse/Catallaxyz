//! Utility functions for price validation and common operations
//!
//! This module provides shared utility functions used across the program.
//! 
//! Note: Fee calculation functions are consolidated in instructions/calculator.rs
//! to avoid duplication.

use crate::constants::{PRICE_SCALE, PRICE_TOLERANCE};
use crate::errors::TerminatorError;
use anchor_lang::prelude::*;

/// Validate that a price is within the valid range [0, PRICE_SCALE].
///
/// Use this for market trading where prices are set freely by users.
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
