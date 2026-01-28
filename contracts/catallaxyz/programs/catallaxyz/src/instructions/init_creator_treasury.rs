use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, TokenAccount, TokenInterface};
use crate::constants::{GLOBAL_SEED, CREATOR_TREASURY_SEED};
use crate::states::global::Global;

/// Initialize the creator treasury for market creator incentives
///
/// This treasury receives the creator incentive share of trading fees.
/// Funds are paid out to creators when markets are settled/terminated.
#[derive(Accounts)]
pub struct InitCreatorTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump,
        constraint = global.authority == authority.key()
    )]
    pub global: Account<'info, Global>,

    /// Creator treasury token account (USDC)
    /// Owned by global PDA, stores creator incentive pool
    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = global,
        token::token_program = token_program,
        seeds = [CREATOR_TREASURY_SEED.as_bytes()],
        bump
    )]
    pub creator_treasury: InterfaceAccount<'info, TokenAccount>,

    /// USDC mint account
    pub usdc_mint: InterfaceAccount<'info, token_interface::Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitCreatorTreasury>) -> Result<()> {
    let global = &ctx.accounts.global;

    // AUDIT FIX: Use specific error type
    require!(
        ctx.accounts.usdc_mint.key() == global.usdc_mint,
        crate::errors::TerminatorError::InvalidUsdcMint
    );

    msg!("Creator treasury initialized: {}", ctx.accounts.creator_treasury.key());
    msg!("  Purpose: Collect creator incentive fees");
    msg!("  Authority: Global PDA");

    Ok(())
}
