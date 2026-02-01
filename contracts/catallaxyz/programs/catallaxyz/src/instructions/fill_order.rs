//! Fill Order Instruction (Polymarket-style)
//! 
//! Fills a single signed order against the operator (msg.sender).
//! The operator acts as the counterparty, providing liquidity.
//! 
//! This is similar to Polymarket's `fillOrder` where:
//! - Order is signed by the maker
//! - Operator validates and executes the fill
//! - Assets are transferred atomically

use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::ID as INSTRUCTIONS_ID;
use crate::constants::{GLOBAL_SEED, MARKET_SEED};
use crate::errors::TerminatorError;
use crate::events::OrderFilled;
use crate::states::{
    Global, Market, UserBalance, UserPosition, 
    SignedOrder, OrderStatus, UserNonce,
    hash_order, token_id,
};
use crate::instructions::calculator::{calculate_taking_amount, calculate_fee, validate_order, validate_taker};
use crate::instructions::ed25519_verify::verify_ed25519_preceding;

/// Parameters for fill_order instruction
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct FillOrderParams {
    /// Signed order from maker
    pub signed_order: SignedOrder,
    /// Amount to fill (in maker_amount units)
    pub fill_amount: u64,
}

#[derive(Accounts)]
#[instruction(params: FillOrderParams)]
pub struct FillOrder<'info> {
    /// Operator executing the fill (must be in global.operators)
    #[account(mut)]
    pub operator: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump,
        constraint = global.is_trading_allowed() @ TerminatorError::TradingPaused,
        constraint = global.is_operator(&operator.key()) @ TerminatorError::NotOperator,
    )]
    pub global: Box<Account<'info, Global>>,

    #[account(
        mut,
        seeds = [
            MARKET_SEED.as_bytes(),
            market.creator.as_ref(),
            market.market_id.as_ref(),
        ],
        bump = market.bump,
        constraint = market.global == global.key() @ TerminatorError::InvalidAccountInput,
        constraint = market.can_trade() @ TerminatorError::MarketNotActive,
    )]
    pub market: Box<Account<'info, Market>>,

    /// Order status PDA - tracks fill state
    #[account(
        init_if_needed,
        payer = operator,
        space = OrderStatus::INIT_SPACE,
        seeds = [OrderStatus::SEED_PREFIX, &hash_order(&params.signed_order.order)],
        bump,
    )]
    pub order_status: Box<Account<'info, OrderStatus>>,

    /// User nonce for maker
    #[account(
        seeds = [UserNonce::SEED_PREFIX, maker.key().as_ref()],
        bump = maker_nonce.bump,
    )]
    pub maker_nonce: Box<Account<'info, UserNonce>>,

    /// Maker's USDC balance
    #[account(
        mut,
        seeds = [b"user_balance", market.key().as_ref(), maker.key().as_ref()],
        bump = maker_balance.bump,
        constraint = maker_balance.user == maker.key() @ TerminatorError::Unauthorized,
    )]
    pub maker_balance: Box<Account<'info, UserBalance>>,

    /// Maker's position (YES/NO balances)
    #[account(
        mut,
        seeds = [b"user_position", market.key().as_ref(), maker.key().as_ref()],
        bump = maker_position.bump,
        constraint = maker_position.user == maker.key() @ TerminatorError::Unauthorized,
    )]
    pub maker_position: Box<Account<'info, UserPosition>>,

    /// Operator's USDC balance (as counterparty)
    #[account(
        mut,
        seeds = [b"user_balance", market.key().as_ref(), operator.key().as_ref()],
        bump = operator_balance.bump,
        constraint = operator_balance.user == operator.key() @ TerminatorError::Unauthorized,
    )]
    pub operator_balance: Box<Account<'info, UserBalance>>,

    /// Operator's position (as counterparty)
    #[account(
        mut,
        seeds = [b"user_position", market.key().as_ref(), operator.key().as_ref()],
        bump = operator_position.bump,
        constraint = operator_position.user == operator.key() @ TerminatorError::Unauthorized,
    )]
    pub operator_position: Box<Account<'info, UserPosition>>,

    /// CHECK: maker wallet (verified against order)
    #[account(constraint = maker.key() == params.signed_order.order.maker @ TerminatorError::InvalidAccountInput)]
    pub maker: UncheckedAccount<'info>,

    /// CHECK: instructions sysvar for Ed25519 verification
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<FillOrder>, params: FillOrderParams) -> Result<()> {
    let order = &params.signed_order.order;
    let fill_amount = params.fill_amount;
    let clock = Clock::get()?;
    
    // ============================================
    // Order Validation
    // ============================================
    
    // Validate order fields
    validate_order(order, clock.unix_timestamp, ctx.accounts.maker_nonce.current_nonce)?;
    
    // Validate order is for this market
    require!(
        order.market == ctx.accounts.market.key(),
        TerminatorError::InvalidMarket
    );
    
    // Validate taker (operator is the taker in fill_order)
    validate_taker(order, &ctx.accounts.operator.key())?;
    
    // Verify maker's signature on the order
    let order_hash = hash_order(order);
    verify_ed25519_preceding(
        &ctx.accounts.instructions,
        &order.signer, // signer signs the order (can be maker or delegate)
        &order_hash,
        &params.signed_order.signature,
    )?;
    
    // ============================================
    // Order Status Management
    // ============================================
    
    let order_status = &mut ctx.accounts.order_status;
    
    // Initialize if new order
    if order_status.order_hash == [0u8; 32] {
        order_status.init(order_hash, order.maker_amount, ctx.bumps.order_status);
    } else {
        // Verify order hash matches
        require!(
            order_status.order_hash == order_hash,
            TerminatorError::OrderHashMismatch
        );
    }
    
    // Check order is fillable
    require!(
        order_status.is_fillable(),
        TerminatorError::OrderNotFillable
    );
    
    // Calculate actual fill amount (capped at remaining)
    let actual_fill = order_status.fill(fill_amount)?;
    require!(actual_fill > 0, TerminatorError::InvalidAmount);
    
    // ============================================
    // Calculate Amounts
    // ============================================
    
    // Calculate taking amount from fill amount
    let taking_amount = calculate_taking_amount(actual_fill, order.maker_amount, order.taker_amount)?;
    
    // Calculate fee (charged on proceeds)
    let fee = calculate_fee(
        order.fee_rate_bps,
        taking_amount,
        order.maker_amount,
        order.taker_amount,
        order.side,
    )?;
    
    // ============================================
    // Execute Transfer
    // ============================================
    
    let maker_balance = &mut ctx.accounts.maker_balance;
    let maker_position = &mut ctx.accounts.maker_position;
    let operator_balance = &mut ctx.accounts.operator_balance;
    let operator_position = &mut ctx.accounts.operator_position;
    
    // Determine asset IDs for the trade
    let (maker_asset_id, taker_asset_id) = if order.is_buy() {
        // Maker BUY: maker gives USDC (0), receives tokens (1 or 2)
        (token_id::USDC, order.token_id)
    } else {
        // Maker SELL: maker gives tokens (1 or 2), receives USDC (0)
        (order.token_id, token_id::USDC)
    };
    
    if order.is_buy() {
        // Maker is buying tokens
        // - Maker pays USDC (actual_fill)
        // - Maker receives tokens (taking_amount - fee)
        // - Operator receives USDC (actual_fill)
        // - Operator pays tokens (taking_amount)
        
        require!(
            maker_balance.usdc_balance >= actual_fill,
            TerminatorError::InsufficientBalance
        );
        
        // Check operator has tokens
        if order.token_id == token_id::YES {
            require!(
                operator_position.yes_balance >= taking_amount,
                TerminatorError::InsufficientOutcomeTokens
            );
        } else {
            require!(
                operator_position.no_balance >= taking_amount,
                TerminatorError::InsufficientOutcomeTokens
            );
        }
        
        // Execute transfers
        maker_balance.usdc_balance = maker_balance.usdc_balance
            .checked_sub(actual_fill)
            .ok_or(TerminatorError::InsufficientBalance)?;
        
        operator_balance.usdc_balance = operator_balance.usdc_balance
            .checked_add(actual_fill)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
        
        let tokens_to_maker = taking_amount.saturating_sub(fee);
        if order.token_id == token_id::YES {
            maker_position.yes_balance = maker_position.yes_balance
                .checked_add(tokens_to_maker)
                .ok_or(TerminatorError::ArithmeticOverflow)?;
            operator_position.yes_balance = operator_position.yes_balance
                .checked_sub(taking_amount)
                .ok_or(TerminatorError::InsufficientOutcomeTokens)?;
        } else {
            maker_position.no_balance = maker_position.no_balance
                .checked_add(tokens_to_maker)
                .ok_or(TerminatorError::ArithmeticOverflow)?;
            operator_position.no_balance = operator_position.no_balance
                .checked_sub(taking_amount)
                .ok_or(TerminatorError::InsufficientOutcomeTokens)?;
        }
        
    } else {
        // Maker is selling tokens
        // - Maker pays tokens (actual_fill)
        // - Maker receives USDC (taking_amount - fee)
        // - Operator receives tokens (actual_fill)
        // - Operator pays USDC (taking_amount)
        
        // Check maker has tokens
        if order.token_id == token_id::YES {
            require!(
                maker_position.yes_balance >= actual_fill,
                TerminatorError::InsufficientOutcomeTokens
            );
        } else {
            require!(
                maker_position.no_balance >= actual_fill,
                TerminatorError::InsufficientOutcomeTokens
            );
        }
        
        require!(
            operator_balance.usdc_balance >= taking_amount,
            TerminatorError::InsufficientBalance
        );
        
        // Execute transfers
        let usdc_to_maker = taking_amount.saturating_sub(fee);
        maker_balance.usdc_balance = maker_balance.usdc_balance
            .checked_add(usdc_to_maker)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
        
        operator_balance.usdc_balance = operator_balance.usdc_balance
            .checked_sub(taking_amount)
            .ok_or(TerminatorError::InsufficientBalance)?;
        
        if order.token_id == token_id::YES {
            maker_position.yes_balance = maker_position.yes_balance
                .checked_sub(actual_fill)
                .ok_or(TerminatorError::InsufficientOutcomeTokens)?;
            operator_position.yes_balance = operator_position.yes_balance
                .checked_add(actual_fill)
                .ok_or(TerminatorError::ArithmeticOverflow)?;
        } else {
            maker_position.no_balance = maker_position.no_balance
                .checked_sub(actual_fill)
                .ok_or(TerminatorError::InsufficientOutcomeTokens)?;
            operator_position.no_balance = operator_position.no_balance
                .checked_add(actual_fill)
                .ok_or(TerminatorError::ArithmeticOverflow)?;
        }
    }
    
    // ============================================
    // Update Market Stats
    // ============================================
    
    let market = &mut ctx.accounts.market;
    market.record_activity(clock.unix_timestamp, clock.slot);
    
    // Calculate price for stats
    let price = order.calculate_price();
    if order.token_id == token_id::YES {
        market.record_binary_last_price(0, price)?;
    } else if order.token_id == token_id::NO {
        market.record_binary_last_price(1, price)?;
    }
    
    market.total_trades = market.total_trades
        .checked_add(1)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    
    // ============================================
    // Emit Event
    // ============================================
    
    emit!(OrderFilled {
        order_hash,
        maker: order.maker,
        taker: ctx.accounts.operator.key(),
        maker_asset_id,
        taker_asset_id,
        maker_amount_filled: actual_fill,
        taker_amount_filled: taking_amount,
        fee,
        market: market.key(),
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Order filled: {} maker_amount, {} taker_amount, {} fee", actual_fill, taking_amount, fee);
    
    Ok(())
}
