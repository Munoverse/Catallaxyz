//! Global Pause Instructions
//! 
//! Admin-only instructions to pause/unpause trading globally.
//! When paused, fill_order and match_orders are blocked.

use anchor_lang::prelude::*;
use crate::constants::GLOBAL_SEED;
use crate::errors::TerminatorError;
use crate::events::{GlobalTradingPaused, GlobalTradingUnpaused};
use crate::states::Global;

// ============================================
// Pause Trading
// ============================================

#[derive(Accounts)]
pub struct PauseTrading<'info> {
    /// Admin (authority)
    #[account(
        constraint = admin.key() == global.authority @ TerminatorError::NotAdmin
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump,
    )]
    pub global: Account<'info, Global>,
}

pub fn handler_pause_trading(ctx: Context<PauseTrading>) -> Result<()> {
    let clock = Clock::get()?;
    let global = &mut ctx.accounts.global;
    
    // Already paused check
    require!(
        !global.trading_paused,
        TerminatorError::TradingPaused
    );
    
    // Pause trading
    global.pause_trading();
    
    // Emit event
    emit!(GlobalTradingPaused {
        paused_by: ctx.accounts.admin.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Global trading paused");
    
    Ok(())
}

// ============================================
// Unpause Trading
// ============================================

#[derive(Accounts)]
pub struct UnpauseTrading<'info> {
    /// Admin (authority)
    #[account(
        constraint = admin.key() == global.authority @ TerminatorError::NotAdmin
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump,
    )]
    pub global: Account<'info, Global>,
}

pub fn handler_unpause_trading(ctx: Context<UnpauseTrading>) -> Result<()> {
    let clock = Clock::get()?;
    let global = &mut ctx.accounts.global;
    
    // Not paused check
    require!(
        global.trading_paused,
        TerminatorError::MarketNotPaused
    );
    
    // Unpause trading
    global.unpause_trading();
    
    // Emit event
    emit!(GlobalTradingUnpaused {
        unpaused_by: ctx.accounts.admin.key(),
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Global trading unpaused");
    
    Ok(())
}
