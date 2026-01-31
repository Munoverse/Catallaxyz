//! Increment Nonce Instruction
//! 
//! Allows users to increment their nonce, which effectively cancels
//! all orders with nonce < new_nonce.
//! 
//! This is a batch cancellation mechanism similar to Polymarket's.

use anchor_lang::prelude::*;
use crate::errors::TerminatorError;
use crate::events::NonceIncremented;
use crate::states::UserNonce;

#[derive(Accounts)]
pub struct IncrementNonce<'info> {
    /// User who wants to increment their nonce
    #[account(mut)]
    pub user: Signer<'info>,

    /// User's nonce account
    #[account(
        init_if_needed,
        payer = user,
        space = UserNonce::INIT_SPACE,
        seeds = [UserNonce::SEED_PREFIX, user.key().as_ref()],
        bump,
    )]
    pub user_nonce: Account<'info, UserNonce>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<IncrementNonce>) -> Result<()> {
    let clock = Clock::get()?;
    let user_nonce = &mut ctx.accounts.user_nonce;
    
    // Initialize if new account
    if user_nonce.user == Pubkey::default() {
        user_nonce.user = ctx.accounts.user.key();
        user_nonce.current_nonce = 0;
        user_nonce.bump = ctx.bumps.user_nonce;
    }
    
    // Verify user matches
    require!(
        user_nonce.user == ctx.accounts.user.key(),
        TerminatorError::Unauthorized
    );
    
    // Increment nonce
    let new_nonce = user_nonce.increment()?;
    
    // Emit event
    emit!(NonceIncremented {
        user: ctx.accounts.user.key(),
        new_nonce,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Nonce incremented to {}", new_nonce);
    
    Ok(())
}
