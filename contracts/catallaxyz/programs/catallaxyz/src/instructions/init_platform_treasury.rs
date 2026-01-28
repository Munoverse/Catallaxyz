use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, TokenAccount, TokenInterface};
use crate::constants::{GLOBAL_SEED, PLATFORM_TREASURY_SEED};
use crate::states::global::Global;

/// Initialize the platform treasury for collecting trading fees and market creation fees
/// 
/// This treasury is separate from the VRF treasury and serves as the protocol's revenue account.
/// It collects:
/// - Trading fees from market orders (swaps) based on dynamic fee curve
/// - Market creation fees (10 USDC per market)
#[derive(Accounts)]
pub struct InitPlatformTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump,
        constraint = global.authority == authority.key()
    )]
    pub global: Account<'info, Global>,

    /// Platform treasury token account (USDC)
    /// Owned by global PDA, stores all platform fees
    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = global,
        token::token_program = token_program,
        seeds = [PLATFORM_TREASURY_SEED.as_bytes()],
        bump
    )]
    pub platform_treasury: InterfaceAccount<'info, TokenAccount>,

    /// USDC mint account
    pub usdc_mint: InterfaceAccount<'info, token_interface::Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitPlatformTreasury>) -> Result<()> {
    let global = &mut ctx.accounts.global;
    
    // Verify USDC mint matches global
    // AUDIT FIX: Use specific error type
    require!(
        ctx.accounts.usdc_mint.key() == global.usdc_mint,
        crate::errors::TerminatorError::InvalidUsdcMint
    );
    
    // Store platform treasury bump
    global.platform_treasury_bump = ctx.bumps.platform_treasury;
    
    msg!("Platform treasury initialized: {}", ctx.accounts.platform_treasury.key());
    msg!("  Purpose: Collect trading fees and market creation fees");
    msg!("  Authority: Global PDA");
    
    Ok(())
}
