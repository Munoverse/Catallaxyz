use anchor_lang::prelude::*;
use ed25519_dalek::{Signature, VerifyingKey, Verifier};
use crate::constants::{GLOBAL_SEED, MARKET_SEED};
use crate::errors::TerminatorError;
use crate::events::TradingFeeCollected;
use crate::states::{global::Global, market::Market, UserBalance, UserPosition};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct FillInput {
    pub maker: Pubkey,
    pub taker: Pubkey,
    pub outcome_type: u8, // 0 = YES, 1 = NO
    pub side: u8, // 0 = BUY, 1 = SELL (taker side)
    pub size: u64, // outcome token size (1e6)
    pub price: u64, // price in 1e6
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SettleTradeParams {
    pub fill: FillInput,
    pub signature: [u8; 64],
}

#[derive(Accounts)]
pub struct SettleTrade<'info> {
    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump
    )]
    pub global: Account<'info, Global>,

    #[account(
        mut,
        seeds = [
            MARKET_SEED.as_bytes(),
            market.creator.as_ref(),
            market.market_id.as_ref(),
        ],
        bump = market.bump,
        constraint = market.global == global.key() @ TerminatorError::InvalidAccountInput,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [b"user_balance", market.key().as_ref(), maker.key().as_ref()],
        bump = maker_balance.bump
    )]
    pub maker_balance: Account<'info, UserBalance>,

    #[account(
        mut,
        seeds = [b"user_balance", market.key().as_ref(), taker.key().as_ref()],
        bump = taker_balance.bump
    )]
    pub taker_balance: Account<'info, UserBalance>,

    #[account(
        mut,
        seeds = [b"user_position", market.key().as_ref(), maker.key().as_ref()],
        bump = maker_position.bump
    )]
    pub maker_position: Account<'info, UserPosition>,

    #[account(
        mut,
        seeds = [b"user_position", market.key().as_ref(), taker.key().as_ref()],
        bump = taker_position.bump
    )]
    pub taker_position: Account<'info, UserPosition>,

    /// CHECK: maker wallet
    pub maker: UncheckedAccount<'info>,
    /// CHECK: taker wallet
    pub taker: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<SettleTrade>, params: SettleTradeParams) -> Result<()> {
    let fill = params.fill;
    let market = &ctx.accounts.market;

    // ============================================
    // SECURITY FIX: Check market status before settling trades
    // Ensures no trades are settled when market is paused or terminated
    // ============================================
    require!(
        market.can_trade(),
        TerminatorError::MarketNotActive
    );

    require!(ctx.accounts.maker_balance.user == ctx.accounts.maker.key(), TerminatorError::Unauthorized);
    require!(ctx.accounts.taker_balance.user == ctx.accounts.taker.key(), TerminatorError::Unauthorized);
    require!(ctx.accounts.maker_position.user == ctx.accounts.maker.key(), TerminatorError::Unauthorized);
    require!(ctx.accounts.taker_position.user == ctx.accounts.taker.key(), TerminatorError::Unauthorized);

    require!(fill.size > 0, TerminatorError::InvalidAmount);
    require!(fill.price <= 1_000_000, TerminatorError::InvalidInput);
    require!(fill.outcome_type <= 1, TerminatorError::InvalidOutcome);

    // Verify signature
    let payload = fill.try_to_vec().map_err(|_| TerminatorError::InvalidInput)?;
    let pubkey_bytes = ctx.accounts.global.settlement_signer.to_bytes();
    let verifying_key = VerifyingKey::from_bytes(&pubkey_bytes)
        .map_err(|_| TerminatorError::InvalidSignature)?;
    let signature = Signature::from_bytes(&params.signature);
    verifying_key
        .verify(&payload, &signature)
        .map_err(|_| TerminatorError::InvalidSignature)?;

    let total_cost = (fill.size as u128)
        .checked_mul(fill.price as u128)
        .and_then(|x| x.checked_div(1_000_000))
        .ok_or(TerminatorError::ArithmeticOverflow)? as u64;

    let global = &mut ctx.accounts.global;
    let maker_balance = &mut ctx.accounts.maker_balance;
    let taker_balance = &mut ctx.accounts.taker_balance;
    let maker_position = &mut ctx.accounts.maker_position;
    let taker_position = &mut ctx.accounts.taker_position;
    let market = &mut ctx.accounts.market;

    // Calculate dynamic taker fee from Global account
    let taker_fee_rate = global.calculate_taker_fee_rate(fill.price);
    let taker_fee = (total_cost as u128)
        .checked_mul(taker_fee_rate as u128)
        .and_then(|x| x.checked_div(1_000_000))
        .ok_or(TerminatorError::ArithmeticOverflow)? as u64;

    // Calculate fee distribution from Global rates
    let platform_fee = (taker_fee as u128)
        .checked_mul(global.platform_fee_rate as u128)
        .and_then(|x| x.checked_div(1_000_000))
        .ok_or(TerminatorError::ArithmeticOverflow)? as u64;
    
    let maker_rebate = (taker_fee as u128)
        .checked_mul(global.maker_rebate_rate as u128)
        .and_then(|x| x.checked_div(1_000_000))
        .ok_or(TerminatorError::ArithmeticOverflow)? as u64;
    
    let creator_incentive = (taker_fee as u128)
        .checked_mul(global.creator_incentive_rate as u128)
        .and_then(|x| x.checked_div(1_000_000))
        .ok_or(TerminatorError::ArithmeticOverflow)? as u64;

    // 0 = BUY, 1 = SELL (taker side)
    if fill.side == 0 {
        // taker buys, maker sells
        // Taker pays: total_cost + taker_fee
        let total_taker_cost = total_cost
            .checked_add(taker_fee)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
        require!(taker_balance.usdc_balance >= total_taker_cost, TerminatorError::InsufficientBalance);
        
        if fill.outcome_type == 0 {
            require!(maker_position.yes_balance >= fill.size, TerminatorError::InsufficientOutcomeTokens);
        } else {
            require!(maker_position.no_balance >= fill.size, TerminatorError::InsufficientOutcomeTokens);
        }
        
        // Taker pays total cost + fee
        taker_balance.usdc_balance = taker_balance.usdc_balance
            .checked_sub(total_taker_cost)
            .ok_or(TerminatorError::InsufficientBalance)?;
        // Maker receives total cost + maker rebate
        maker_balance.usdc_balance = maker_balance.usdc_balance
            .checked_add(total_cost)
            .and_then(|value| value.checked_add(maker_rebate))
            .ok_or(TerminatorError::ArithmeticOverflow)?;

        if fill.outcome_type == 0 {
            taker_position.yes_balance = taker_position.yes_balance
                .checked_add(fill.size)
                .ok_or(TerminatorError::ArithmeticOverflow)?;
            maker_position.yes_balance = maker_position.yes_balance
                .checked_sub(fill.size)
                .ok_or(TerminatorError::InsufficientOutcomeTokens)?;
        } else {
            taker_position.no_balance = taker_position.no_balance
                .checked_add(fill.size)
                .ok_or(TerminatorError::ArithmeticOverflow)?;
            maker_position.no_balance = maker_position.no_balance
                .checked_sub(fill.size)
                .ok_or(TerminatorError::InsufficientOutcomeTokens)?;
        }
    } else {
        // taker sells, maker buys
        // Maker receives rebate as a cost reduction
        let maker_cost = total_cost
            .checked_sub(maker_rebate)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
        require!(maker_balance.usdc_balance >= maker_cost, TerminatorError::InsufficientBalance);
        
        if fill.outcome_type == 0 {
            require!(taker_position.yes_balance >= fill.size, TerminatorError::InsufficientOutcomeTokens);
        } else {
            require!(taker_position.no_balance >= fill.size, TerminatorError::InsufficientOutcomeTokens);
        }
        
        // Maker pays net cost (after rebate)
        maker_balance.usdc_balance = maker_balance.usdc_balance
            .checked_sub(maker_cost)
            .ok_or(TerminatorError::InsufficientBalance)?;
        // Taker receives total cost minus taker fee
        let taker_receives = total_cost
            .checked_sub(taker_fee)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
        taker_balance.usdc_balance = taker_balance.usdc_balance
            .checked_add(taker_receives)
            .ok_or(TerminatorError::ArithmeticOverflow)?;

        if fill.outcome_type == 0 {
            taker_position.yes_balance = taker_position.yes_balance
                .checked_sub(fill.size)
                .ok_or(TerminatorError::InsufficientOutcomeTokens)?;
            maker_position.yes_balance = maker_position.yes_balance
                .checked_add(fill.size)
                .ok_or(TerminatorError::ArithmeticOverflow)?;
        } else {
            taker_position.no_balance = taker_position.no_balance
                .checked_sub(fill.size)
                .ok_or(TerminatorError::InsufficientOutcomeTokens)?;
            maker_position.no_balance = maker_position.no_balance
                .checked_add(fill.size)
                .ok_or(TerminatorError::ArithmeticOverflow)?;
        }
    }

    // Track fees in global state
    global.total_trading_fees_collected = global.total_trading_fees_collected.saturating_add(platform_fee);
    
    // Accrue creator incentive on market
    market.creator_incentive_accrued = market.creator_incentive_accrued.saturating_add(creator_incentive);

    let clock = Clock::get()?;
    market.record_activity(clock.unix_timestamp, clock.slot);
    market.record_binary_last_price(fill.outcome_type, fill.price)?;

    // Emit fee collection event
    if taker_fee > 0 {
        emit!(TradingFeeCollected {
            market: market.key(),
            user: ctx.accounts.taker.key(),
            fee_amount: taker_fee,
            fee_rate: taker_fee_rate,
            price: fill.price,
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
        });
    }

    msg!("Trade settled: {} tokens at price {}", fill.size, fill.price);
    msg!("Taker fee: {} (rate: {}%)", taker_fee, taker_fee_rate as f64 / 10_000.0);

    Ok(())
}
