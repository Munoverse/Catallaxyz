//! Match Orders Instruction (Polymarket-style)
//! 
//! Matches a taker order against one or more maker orders atomically.
//! This is the core atomic swap mechanism.
//! 
//! Supports three match types:
//! - COMPLEMENTARY: Buy vs Sell (direct swap)
//! - MINT: Buy YES vs Buy NO (mint new tokens from USDC)
//! - MERGE: Sell YES vs Sell NO (merge tokens back to USDC)

use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::ID as INSTRUCTIONS_ID;
use crate::constants::{GLOBAL_SEED, MARKET_SEED, PRICE_SCALE};
use crate::errors::TerminatorError;
use crate::events::{OrderFilled, OrdersMatched};
use crate::states::{
    Global, Market, UserBalance, UserPosition,
    Order, SignedOrder, OrderStatus, UserNonce, MatchType,
    hash_order, is_crossing, token_id,
};
use crate::instructions::calculator::{calculate_taking_amount, calculate_fee, validate_order, validate_taker};
use crate::instructions::ed25519_verify::{verify_ed25519_at_index, get_current_instruction_index};

/// Maximum number of maker orders that can be matched in a single instruction
pub const MAX_MAKER_ORDERS: usize = 5;

/// Parameters for match_orders instruction
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MatchOrdersParams {
    /// Signed taker order
    pub taker_order: SignedOrder,
    /// Fill amount for taker order (in maker_amount units)
    pub taker_fill_amount: u64,
    /// Signed maker orders
    pub maker_orders: Vec<SignedOrder>,
    /// Fill amounts for each maker order
    pub maker_fill_amounts: Vec<u64>,
}

/// Core accounts for match_orders (fixed accounts)
#[derive(Accounts)]
#[instruction(params: MatchOrdersParams)]
pub struct MatchOrders<'info> {
    /// Operator executing the match
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

    /// Taker order status
    #[account(
        init_if_needed,
        payer = operator,
        space = OrderStatus::INIT_SPACE,
        seeds = [OrderStatus::SEED_PREFIX, &hash_order(&params.taker_order.order)],
        bump,
    )]
    pub taker_order_status: Box<Account<'info, OrderStatus>>,

    /// Taker's nonce account
    #[account(
        seeds = [UserNonce::SEED_PREFIX, taker.key().as_ref()],
        bump = taker_nonce.bump,
    )]
    pub taker_nonce: Box<Account<'info, UserNonce>>,

    /// Taker's USDC balance
    #[account(
        mut,
        seeds = [b"user_balance", market.key().as_ref(), taker.key().as_ref()],
        bump = taker_balance.bump,
        constraint = taker_balance.user == taker.key() @ TerminatorError::Unauthorized,
    )]
    pub taker_balance: Box<Account<'info, UserBalance>>,

    /// Taker's position
    #[account(
        mut,
        seeds = [b"user_position", market.key().as_ref(), taker.key().as_ref()],
        bump = taker_position.bump,
        constraint = taker_position.user == taker.key() @ TerminatorError::Unauthorized,
    )]
    pub taker_position: Box<Account<'info, UserPosition>>,

    /// CHECK: taker wallet
    #[account(constraint = taker.key() == params.taker_order.order.maker @ TerminatorError::InvalidAccountInput)]
    pub taker: UncheckedAccount<'info>,

    /// CHECK: instructions sysvar
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    // Remaining accounts:
    // For each maker order (up to MAX_MAKER_ORDERS):
    // - maker (UncheckedAccount)
    // - maker_nonce (UserNonce)
    // - maker_balance (UserBalance)
    // - maker_position (UserPosition)
    // - maker_order_status (OrderStatus)
}

pub fn handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, MatchOrders<'info>>,
    params: MatchOrdersParams,
) -> Result<()> {
    let clock = Clock::get()?;
    let taker_order = &params.taker_order.order;
    let maker_orders_count = params.maker_orders.len();
    
    // Validate counts
    require!(maker_orders_count > 0, TerminatorError::InvalidInput);
    require!(maker_orders_count <= MAX_MAKER_ORDERS, TerminatorError::InvalidInput);
    require!(
        params.maker_fill_amounts.len() == maker_orders_count,
        TerminatorError::InvalidInput
    );
    
    // ============================================
    // Validate Taker Order
    // ============================================
    
    validate_order(taker_order, clock.unix_timestamp, ctx.accounts.taker_nonce.current_nonce)?;
    
    require!(
        taker_order.market == ctx.accounts.market.key(),
        TerminatorError::InvalidMarket
    );
    
    // Taker can be public or restricted
    if !taker_order.is_public() {
        // If restricted, operator must be the designated taker
        validate_taker(taker_order, &ctx.accounts.operator.key())?;
    }
    
    // Get current instruction index for signature verification
    let current_index = get_current_instruction_index(&ctx.accounts.instructions)?;
    
    // Verify taker signature (should be at index current_index - (maker_count + 1))
    let taker_sig_index = current_index
        .checked_sub((maker_orders_count + 1) as u16)
        .ok_or(TerminatorError::InvalidSignature)?;
    
    let taker_order_hash = hash_order(taker_order);
    verify_ed25519_at_index(
        &ctx.accounts.instructions,
        taker_sig_index as usize,
        &taker_order.signer,
        &taker_order_hash,
        &params.taker_order.signature,
    )?;
    
    // Initialize/check taker order status
    let taker_order_status = &mut ctx.accounts.taker_order_status;
    if taker_order_status.order_hash == [0u8; 32] {
        taker_order_status.init(taker_order_hash, taker_order.maker_amount, ctx.bumps.taker_order_status);
    } else {
        require!(
            taker_order_status.order_hash == taker_order_hash,
            TerminatorError::OrderHashMismatch
        );
    }
    require!(taker_order_status.is_fillable(), TerminatorError::OrderNotFillable);
    
    // ============================================
    // Process Maker Orders via Remaining Accounts
    // ============================================
    
    // Each maker requires 5 accounts:
    // maker, maker_nonce, maker_balance, maker_position, maker_order_status
    let accounts_per_maker = 5;
    require!(
        ctx.remaining_accounts.len() == maker_orders_count * accounts_per_maker,
        TerminatorError::InvalidAccountInput
    );
    
    let mut total_taker_taking = 0u64;
    let taker_balance = &mut ctx.accounts.taker_balance;
    let taker_position = &mut ctx.accounts.taker_position;
    
    for (i, (maker_order, maker_fill_amount)) in params.maker_orders.iter()
        .zip(params.maker_fill_amounts.iter())
        .enumerate()
    {
        let order = &maker_order.order;
        let base_idx = i * accounts_per_maker;
        
        // Extract maker accounts from remaining_accounts
        let maker_info = &ctx.remaining_accounts[base_idx];
        let maker_nonce_info = &ctx.remaining_accounts[base_idx + 1];
        let maker_balance_info = &ctx.remaining_accounts[base_idx + 2];
        let maker_position_info = &ctx.remaining_accounts[base_idx + 3];
        let maker_order_status_info = &ctx.remaining_accounts[base_idx + 4];
        
        // Verify maker pubkey matches order
        require!(
            maker_info.key() == order.maker,
            TerminatorError::InvalidAccountInput
        );
        
        // Load accounts
        let maker_nonce: Account<UserNonce> = Account::try_from(maker_nonce_info)?;
        let mut maker_balance: Account<UserBalance> = Account::try_from(maker_balance_info)?;
        let mut maker_position: Account<UserPosition> = Account::try_from(maker_position_info)?;
        let mut maker_order_status: Account<OrderStatus> = Account::try_from(maker_order_status_info)?;
        
        // AUDIT FIX C-C2: Validate maker accounts belong to correct market and user
        require!(
            maker_balance.market == ctx.accounts.market.key(),
            TerminatorError::InvalidAccountInput
        );
        require!(
            maker_position.market == ctx.accounts.market.key(),
            TerminatorError::InvalidAccountInput
        );
        require!(
            maker_balance.user == order.maker,
            TerminatorError::Unauthorized
        );
        require!(
            maker_position.user == order.maker,
            TerminatorError::Unauthorized
        );
        
        // Validate maker order
        validate_order(order, clock.unix_timestamp, maker_nonce.current_nonce)?;
        require!(order.market == ctx.accounts.market.key(), TerminatorError::InvalidMarket);
        
        // Verify maker signature
        let maker_sig_index = current_index
            .checked_sub((maker_orders_count - i) as u16)
            .ok_or(TerminatorError::InvalidSignature)?;
        
        let maker_order_hash = hash_order(order);
        verify_ed25519_at_index(
            &ctx.accounts.instructions,
            maker_sig_index as usize,
            &order.signer,
            &maker_order_hash,
            &maker_order.signature,
        )?;
        
        // Initialize/check maker order status
        if maker_order_status.order_hash == [0u8; 32] {
            maker_order_status.order_hash = maker_order_hash;
            maker_order_status.remaining = order.maker_amount;
            maker_order_status.is_filled_or_cancelled = false;
        } else {
            require!(
                maker_order_status.order_hash == maker_order_hash,
                TerminatorError::OrderHashMismatch
            );
        }
        require!(maker_order_status.is_fillable(), TerminatorError::OrderNotFillable);
        
        // Determine match type
        let match_type = MatchType::from_orders(taker_order, order)
            .ok_or(TerminatorError::InvalidInput)?;
        
        // Validate crossing prices
        require!(
            is_crossing(taker_order, order, match_type),
            TerminatorError::NotCrossing
        );
        
        // Calculate fill amounts
        let actual_maker_fill = (*maker_fill_amount).min(maker_order_status.remaining);
        let taking_amount = calculate_taking_amount(actual_maker_fill, order.maker_amount, order.taker_amount)?;
        let fee = calculate_fee(order.fee_rate_bps, taking_amount, order.maker_amount, order.taker_amount, order.side)?;
        
        // Execute transfer based on match type
        match match_type {
            MatchType::Complementary => {
                execute_complementary_match(
                    taker_order,
                    order,
                    actual_maker_fill,
                    taking_amount,
                    fee,
                    taker_balance,
                    taker_position,
                    &mut maker_balance,
                    &mut maker_position,
                )?;
            }
            MatchType::Mint => {
                execute_mint_match(
                    taker_order,
                    order,
                    actual_maker_fill,
                    taking_amount,
                    fee,
                    taker_balance,
                    taker_position,
                    &mut maker_balance,
                    &mut maker_position,
                    &mut ctx.accounts.market,
                )?;
            }
            MatchType::Merge => {
                execute_merge_match(
                    taker_order,
                    order,
                    actual_maker_fill,
                    taking_amount,
                    fee,
                    taker_balance,
                    taker_position,
                    &mut maker_balance,
                    &mut maker_position,
                    &mut ctx.accounts.market,
                )?;
            }
        }
        
        // Update maker order status
        maker_order_status.remaining = maker_order_status.remaining.saturating_sub(actual_maker_fill);
        if maker_order_status.remaining == 0 {
            maker_order_status.is_filled_or_cancelled = true;
        }
        
        total_taker_taking = total_taker_taking
            .checked_add(taking_amount)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
        
        // Save maker accounts back
        maker_balance.exit(&crate::ID)?;
        maker_position.exit(&crate::ID)?;
        maker_order_status.exit(&crate::ID)?;
        
        // Emit individual fill event
        emit!(OrderFilled {
            order_hash: maker_order_hash,
            maker: order.maker,
            taker: taker_order.maker,
            maker_asset_id: if order.is_buy() { token_id::USDC } else { order.token_id },
            taker_asset_id: if order.is_buy() { order.token_id } else { token_id::USDC },
            maker_amount_filled: actual_maker_fill,
            taker_amount_filled: taking_amount,
            fee,
            market: ctx.accounts.market.key(),
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
        });
    }
    
    // Update taker order status
    let actual_taker_fill = params.taker_fill_amount.min(taker_order_status.remaining);
    taker_order_status.remaining = taker_order_status.remaining.saturating_sub(actual_taker_fill);
    if taker_order_status.remaining == 0 {
        taker_order_status.is_filled_or_cancelled = true;
    }
    
    // Update market stats
    let market = &mut ctx.accounts.market;
    market.record_activity(clock.unix_timestamp, clock.slot);
    market.total_trades = market.total_trades
        .checked_add(maker_orders_count as u64)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    
    // Emit match event
    emit!(OrdersMatched {
        taker_order_hash,
        taker_maker: taker_order.maker,
        maker_asset_id: if taker_order.is_buy() { token_id::USDC } else { taker_order.token_id },
        taker_asset_id: if taker_order.is_buy() { taker_order.token_id } else { token_id::USDC },
        maker_amount_filled: actual_taker_fill,
        taker_amount_filled: total_taker_taking,
        maker_orders_count: maker_orders_count as u8,
        market: market.key(),
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Matched {} orders, total taking: {}", maker_orders_count, total_taker_taking);
    
    Ok(())
}

/// Execute a complementary match (Buy vs Sell)
fn execute_complementary_match(
    taker_order: &Order,
    maker_order: &Order,
    maker_fill: u64,
    taking_amount: u64,
    fee: u64,
    taker_balance: &mut Account<UserBalance>,
    taker_position: &mut Account<UserPosition>,
    maker_balance: &mut Account<UserBalance>,
    maker_position: &mut Account<UserPosition>,
) -> Result<()> {
    if taker_order.is_buy() {
        // Taker buys tokens from maker who sells
        // Taker gives USDC, receives tokens
        // Maker gives tokens, receives USDC
        
        let taker_pays = taking_amount;
        // AUDIT FIX C-C3: Use checked_sub with explicit error handling
        let maker_receives = taking_amount.checked_sub(fee).ok_or(TerminatorError::ArithmeticOverflow)?;
        
        require!(taker_balance.usdc_balance >= taker_pays, TerminatorError::InsufficientBalance);
        
        if maker_order.token_id == token_id::YES {
            require!(maker_position.yes_balance >= maker_fill, TerminatorError::InsufficientOutcomeTokens);
            
            taker_balance.usdc_balance = taker_balance.usdc_balance.checked_sub(taker_pays).ok_or(TerminatorError::ArithmeticOverflow)?;
            maker_balance.usdc_balance = maker_balance.usdc_balance.checked_add(maker_receives).ok_or(TerminatorError::ArithmeticOverflow)?;
            
            taker_position.yes_balance = taker_position.yes_balance.checked_add(maker_fill).ok_or(TerminatorError::ArithmeticOverflow)?;
            maker_position.yes_balance = maker_position.yes_balance.checked_sub(maker_fill).ok_or(TerminatorError::ArithmeticOverflow)?;
        } else {
            require!(maker_position.no_balance >= maker_fill, TerminatorError::InsufficientOutcomeTokens);
            
            taker_balance.usdc_balance = taker_balance.usdc_balance.checked_sub(taker_pays).ok_or(TerminatorError::ArithmeticOverflow)?;
            maker_balance.usdc_balance = maker_balance.usdc_balance.checked_add(maker_receives).ok_or(TerminatorError::ArithmeticOverflow)?;
            
            taker_position.no_balance = taker_position.no_balance.checked_add(maker_fill).ok_or(TerminatorError::ArithmeticOverflow)?;
            maker_position.no_balance = maker_position.no_balance.checked_sub(maker_fill).ok_or(TerminatorError::ArithmeticOverflow)?;
        }
    } else {
        // Taker sells tokens to maker who buys
        // Taker gives tokens, receives USDC
        // Maker gives USDC, receives tokens
        
        let maker_pays = taking_amount;
        // AUDIT FIX C-C3: Use checked_sub with explicit error handling
        let taker_receives = taking_amount.checked_sub(fee).ok_or(TerminatorError::ArithmeticOverflow)?;
        
        require!(maker_balance.usdc_balance >= maker_pays, TerminatorError::InsufficientBalance);
        
        if taker_order.token_id == token_id::YES {
            require!(taker_position.yes_balance >= maker_fill, TerminatorError::InsufficientOutcomeTokens);
            
            maker_balance.usdc_balance = maker_balance.usdc_balance.checked_sub(maker_pays).ok_or(TerminatorError::ArithmeticOverflow)?;
            taker_balance.usdc_balance = taker_balance.usdc_balance.checked_add(taker_receives).ok_or(TerminatorError::ArithmeticOverflow)?;
            
            taker_position.yes_balance = taker_position.yes_balance.checked_sub(maker_fill).ok_or(TerminatorError::ArithmeticOverflow)?;
            maker_position.yes_balance = maker_position.yes_balance.checked_add(maker_fill).ok_or(TerminatorError::ArithmeticOverflow)?;
        } else {
            require!(taker_position.no_balance >= maker_fill, TerminatorError::InsufficientOutcomeTokens);
            
            maker_balance.usdc_balance = maker_balance.usdc_balance.checked_sub(maker_pays).ok_or(TerminatorError::ArithmeticOverflow)?;
            taker_balance.usdc_balance = taker_balance.usdc_balance.checked_add(taker_receives).ok_or(TerminatorError::ArithmeticOverflow)?;
            
            taker_position.no_balance = taker_position.no_balance.checked_sub(maker_fill).ok_or(TerminatorError::ArithmeticOverflow)?;
            maker_position.no_balance = maker_position.no_balance.checked_add(maker_fill).ok_or(TerminatorError::ArithmeticOverflow)?;
        }
    }
    
    Ok(())
}

/// Execute a mint match (Buy YES vs Buy NO)
/// Both parties want to buy tokens, so we mint new YES+NO from their USDC
fn execute_mint_match(
    taker_order: &Order,
    maker_order: &Order,
    maker_fill: u64,
    _taking_amount: u64,
    _fee: u64,
    taker_balance: &mut Account<UserBalance>,
    taker_position: &mut Account<UserPosition>,
    maker_balance: &mut Account<UserBalance>,
    maker_position: &mut Account<UserPosition>,
    market: &mut Account<Market>,
) -> Result<()> {
    // In a mint match, both orders are BUY orders for complementary tokens
    // We take USDC from both and mint YES+NO
    
    let mint_amount = maker_fill; // Amount of tokens to mint
    
    // Calculate USDC needed from each party based on their prices
    let taker_usdc_needed = (mint_amount as u128)
        .checked_mul(taker_order.calculate_price() as u128)
        .ok_or(TerminatorError::ArithmeticOverflow)?
        .checked_div(PRICE_SCALE as u128)
        .ok_or(TerminatorError::ArithmeticOverflow)? as u64;
    
    let maker_usdc_needed = (mint_amount as u128)
        .checked_mul(maker_order.calculate_price() as u128)
        .ok_or(TerminatorError::ArithmeticOverflow)?
        .checked_div(PRICE_SCALE as u128)
        .ok_or(TerminatorError::ArithmeticOverflow)? as u64;
    
    // Verify balances
    require!(taker_balance.usdc_balance >= taker_usdc_needed, TerminatorError::InsufficientBalance);
    require!(maker_balance.usdc_balance >= maker_usdc_needed, TerminatorError::InsufficientBalance);
    
    // Deduct USDC
    taker_balance.usdc_balance = taker_balance.usdc_balance
        .checked_sub(taker_usdc_needed)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    maker_balance.usdc_balance = maker_balance.usdc_balance
        .checked_sub(maker_usdc_needed)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    
    // Mint tokens to each party based on their order's token_id
    if taker_order.token_id == token_id::YES {
        taker_position.yes_balance = taker_position.yes_balance
            .checked_add(mint_amount)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
        maker_position.no_balance = maker_position.no_balance
            .checked_add(mint_amount)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
    } else {
        taker_position.no_balance = taker_position.no_balance
            .checked_add(mint_amount)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
        maker_position.yes_balance = maker_position.yes_balance
            .checked_add(mint_amount)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
    }
    
    // Update market supply tracking
    market.total_yes_supply = market.total_yes_supply
        .checked_add(mint_amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    market.total_no_supply = market.total_no_supply
        .checked_add(mint_amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    market.total_position_collateral = market.total_position_collateral
        .checked_add(mint_amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    
    Ok(())
}

/// Execute a merge match (Sell YES vs Sell NO)
/// Both parties want to sell tokens, so we merge YES+NO back to USDC
fn execute_merge_match(
    taker_order: &Order,
    maker_order: &Order,
    maker_fill: u64,
    _taking_amount: u64,
    _fee: u64,
    taker_balance: &mut Account<UserBalance>,
    taker_position: &mut Account<UserPosition>,
    maker_balance: &mut Account<UserBalance>,
    maker_position: &mut Account<UserPosition>,
    market: &mut Account<Market>,
) -> Result<()> {
    // In a merge match, both orders are SELL orders for complementary tokens
    // We take tokens from both and return USDC
    
    let merge_amount = maker_fill;
    
    // Calculate USDC to return to each party based on their prices
    let taker_usdc_returned = (merge_amount as u128)
        .checked_mul(taker_order.calculate_price() as u128)
        .ok_or(TerminatorError::ArithmeticOverflow)?
        .checked_div(PRICE_SCALE as u128)
        .ok_or(TerminatorError::ArithmeticOverflow)? as u64;
    
    let maker_usdc_returned = (merge_amount as u128)
        .checked_mul(maker_order.calculate_price() as u128)
        .ok_or(TerminatorError::ArithmeticOverflow)?
        .checked_div(PRICE_SCALE as u128)
        .ok_or(TerminatorError::ArithmeticOverflow)? as u64;
    
    // Verify token balances
    if taker_order.token_id == token_id::YES {
        require!(taker_position.yes_balance >= merge_amount, TerminatorError::InsufficientOutcomeTokens);
        require!(maker_position.no_balance >= merge_amount, TerminatorError::InsufficientOutcomeTokens);
        
        // Deduct tokens
        taker_position.yes_balance = taker_position.yes_balance
            .checked_sub(merge_amount)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
        maker_position.no_balance = maker_position.no_balance
            .checked_sub(merge_amount)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
    } else {
        require!(taker_position.no_balance >= merge_amount, TerminatorError::InsufficientOutcomeTokens);
        require!(maker_position.yes_balance >= merge_amount, TerminatorError::InsufficientOutcomeTokens);
        
        // Deduct tokens
        taker_position.no_balance = taker_position.no_balance
            .checked_sub(merge_amount)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
        maker_position.yes_balance = maker_position.yes_balance
            .checked_sub(merge_amount)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
    }
    
    // Return USDC
    taker_balance.usdc_balance = taker_balance.usdc_balance
        .checked_add(taker_usdc_returned)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    maker_balance.usdc_balance = maker_balance.usdc_balance
        .checked_add(maker_usdc_returned)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    
    // Update market supply tracking
    market.total_yes_supply = market.total_yes_supply
        .checked_sub(merge_amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    market.total_no_supply = market.total_no_supply
        .checked_sub(merge_amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    market.total_position_collateral = market.total_position_collateral
        .checked_sub(merge_amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    
    Ok(())
}
