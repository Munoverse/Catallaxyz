//! Calculator utilities for exchange operations
//! 
//! Provides functions for:
//! - Fee calculation (Polymarket-style symmetric fees)
//! - Taking amount calculation
//! - Price calculation and validation

use anchor_lang::prelude::*;
use crate::constants::PRICE_SCALE;
use crate::states::{Order, Global, MAX_FEE_RATE_BPS};

/// Basis points divisor (100% = 10000 bps)
pub const BPS_DIVISOR: u64 = 10_000;

/// Calculate the taking amount from the making amount
/// 
/// taking = making * taker_amount / maker_amount
pub fn calculate_taking_amount(
    making: u64,
    maker_amount: u64,
    taker_amount: u64,
) -> Result<u64> {
    if maker_amount == 0 {
        return Ok(0);
    }
    
    // Use u128 for intermediate calculation to avoid overflow
    let taking = (making as u128)
        .checked_mul(taker_amount as u128)
        .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)?
        .checked_div(maker_amount as u128)
        .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)?;
    
    Ok(taking as u64)
}

/// Calculate fee based on order parameters (Polymarket-style)
/// 
/// Fee is calculated on the proceeds (what the order receives)
/// Fee = feeRateBps * min(price, 1-price) * proceeds / (BPS_DIVISOR * PRICE_SCALE)
/// 
/// This creates symmetric fees where:
/// - Fees are highest at 50% price
/// - Fees decrease as price moves towards extremes (0% or 100%)
pub fn calculate_fee(
    fee_rate_bps: u16,
    proceeds: u64,
    maker_amount: u64,
    taker_amount: u64,
    side: u8,
) -> Result<u64> {
    if fee_rate_bps == 0 || proceeds == 0 {
        return Ok(0);
    }
    
    // Validate fee rate
    require!(
        fee_rate_bps <= MAX_FEE_RATE_BPS,
        crate::errors::TerminatorError::FeeTooHigh
    );
    
    // Calculate price based on side
    let price = if side == 0 {
        // BUY: price = maker_amount (USDC) / taker_amount (tokens)
        if taker_amount == 0 {
            return Ok(0);
        }
        (maker_amount as u128)
            .checked_mul(PRICE_SCALE as u128)
            .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)?
            .checked_div(taker_amount as u128)
            .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)? as u64
    } else {
        // SELL: price = taker_amount (USDC) / maker_amount (tokens)
        if maker_amount == 0 {
            return Ok(0);
        }
        (taker_amount as u128)
            .checked_mul(PRICE_SCALE as u128)
            .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)?
            .checked_div(maker_amount as u128)
            .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)? as u64
    };
    
    // Calculate min(price, 1-price) for symmetric fee
    let complement_price = PRICE_SCALE.saturating_sub(price);
    let price_factor = price.min(complement_price);
    
    // Fee = feeRateBps * priceFactor * proceeds / (BPS_DIVISOR * PRICE_SCALE)
    let fee = (fee_rate_bps as u128)
        .checked_mul(price_factor as u128)
        .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)?
        .checked_mul(proceeds as u128)
        .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)?
        .checked_div(BPS_DIVISOR as u128 * PRICE_SCALE as u128)
        .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)?;
    
    Ok(fee as u64)
}

/// Calculate fee using global fee configuration (dynamic fee curve)
/// 
/// Uses the Global account's fee configuration to calculate fees
/// based on price distance from 50%
pub fn calculate_fee_with_global(
    global: &Global,
    proceeds: u64,
    price: u64,
) -> Result<u64> {
    if proceeds == 0 {
        return Ok(0);
    }
    
    // Get dynamic fee rate based on price
    let fee_rate = global.calculate_taker_fee_rate(price);
    
    // Fee = fee_rate * proceeds / PRICE_SCALE (since fee_rate is scaled by 10^6)
    let fee = (fee_rate as u128)
        .checked_mul(proceeds as u128)
        .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)?
        .checked_div(PRICE_SCALE as u128)
        .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)?;
    
    Ok(fee as u64)
}

/// Distribute fee according to global configuration
/// 
/// Returns (platform_fee, maker_rebate, creator_incentive)
pub fn distribute_fee(
    global: &Global,
    total_fee: u64,
) -> Result<(u64, u64, u64)> {
    // Platform fee
    let platform_fee = (total_fee as u128)
        .checked_mul(global.platform_fee_rate as u128)
        .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)?
        .checked_div(PRICE_SCALE as u128)
        .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)? as u64;
    
    // Maker rebate
    let maker_rebate = (total_fee as u128)
        .checked_mul(global.maker_rebate_rate as u128)
        .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)?
        .checked_div(PRICE_SCALE as u128)
        .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)? as u64;
    
    // Creator incentive
    let creator_incentive = (total_fee as u128)
        .checked_mul(global.creator_incentive_rate as u128)
        .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)?
        .checked_div(PRICE_SCALE as u128)
        .ok_or(crate::errors::TerminatorError::ArithmeticOverflow)? as u64;
    
    Ok((platform_fee, maker_rebate, creator_incentive))
}

/// Validate order against common checks
pub fn validate_order(
    order: &Order,
    current_timestamp: i64,
    user_nonce: u64,
) -> Result<()> {
    // Check expiration
    require!(
        !order.is_expired(current_timestamp),
        crate::errors::TerminatorError::OrderExpired
    );
    
    // Check nonce
    require!(
        order.nonce >= user_nonce,
        crate::errors::TerminatorError::InvalidNonce
    );
    
    // Check fee rate
    require!(
        order.fee_rate_bps <= MAX_FEE_RATE_BPS,
        crate::errors::TerminatorError::FeeTooHigh
    );
    
    // Check token ID is valid (0=USDC, 1=YES, 2=NO)
    require!(
        order.token_id <= 2,
        crate::errors::TerminatorError::InvalidOutcome
    );
    
    // Check amounts are non-zero
    require!(
        order.maker_amount > 0 && order.taker_amount > 0,
        crate::errors::TerminatorError::InvalidAmount
    );
    
    Ok(())
}

/// Validate taker for an order
pub fn validate_taker(order: &Order, taker: &Pubkey) -> Result<()> {
    if !order.is_public() && order.taker != *taker {
        return Err(crate::errors::TerminatorError::InvalidTaker.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_calculate_taking_amount() {
        // 500 making, 1000 maker_amount, 2000 taker_amount
        // taking = 500 * 2000 / 1000 = 1000
        let taking = calculate_taking_amount(500, 1000, 2000).unwrap();
        assert_eq!(taking, 1000);
        
        // Edge case: maker_amount = 0
        let taking = calculate_taking_amount(500, 0, 2000).unwrap();
        assert_eq!(taking, 0);
    }
    
    #[test]
    fn test_calculate_fee() {
        // 100 bps fee on 1000 proceeds at 50% price
        // price_factor = min(500000, 500000) = 500000
        // fee = 100 * 500000 * 1000 / (10000 * 1000000) = 5
        let fee = calculate_fee(100, 1_000_000, 500_000, 1_000_000, 0).unwrap();
        assert!(fee > 0);
        
        // No fee when fee_rate_bps = 0
        let fee = calculate_fee(0, 1_000_000, 500_000, 1_000_000, 0).unwrap();
        assert_eq!(fee, 0);
    }
}
