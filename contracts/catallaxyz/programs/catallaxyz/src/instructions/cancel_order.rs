//! Cancel Order Instruction
//! 
//! Allows order makers to cancel their orders on-chain.
//! Once cancelled, an order cannot be filled.

use anchor_lang::prelude::*;
use crate::constants::GLOBAL_SEED;
use crate::errors::TerminatorError;
use crate::events::OrderCancelled;
use crate::states::{Global, Order, OrderStatus, hash_order};

/// Parameters for cancel_order instruction
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CancelOrderParams {
    /// The order to cancel
    pub order: Order,
}

#[derive(Accounts)]
#[instruction(params: CancelOrderParams)]
pub struct CancelOrder<'info> {
    /// Maker (order creator) who wants to cancel
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump,
    )]
    pub global: Box<Account<'info, Global>>,

    /// Order status PDA
    #[account(
        init_if_needed,
        payer = maker,
        space = OrderStatus::INIT_SPACE,
        seeds = [OrderStatus::SEED_PREFIX, &hash_order(&params.order)],
        bump,
    )]
    pub order_status: Box<Account<'info, OrderStatus>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CancelOrder>, params: CancelOrderParams) -> Result<()> {
    let order = &params.order;
    let clock = Clock::get()?;
    
    // Verify caller is the order maker
    require!(
        order.maker == ctx.accounts.maker.key(),
        TerminatorError::NotOrderMaker
    );
    
    let order_hash = hash_order(order);
    let order_status = &mut ctx.accounts.order_status;
    
    // Initialize if new
    if order_status.order_hash == [0u8; 32] {
        order_status.init(order_hash, order.maker_amount, ctx.bumps.order_status);
    } else {
        // Verify hash matches
        require!(
            order_status.order_hash == order_hash,
            TerminatorError::OrderHashMismatch
        );
    }
    
    // Check not already cancelled or filled
    require!(
        !order_status.is_filled_or_cancelled,
        TerminatorError::OrderAlreadyCancelledOrFilled
    );
    
    // Cancel the order
    order_status.cancel();
    
    // Emit event
    emit!(OrderCancelled {
        order_hash,
        maker: order.maker,
        market: order.market,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Order cancelled: {:?}", order_hash);
    
    Ok(())
}
