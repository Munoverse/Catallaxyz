use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, TokenAccount, TokenInterface};
use crate::constants::{GLOBAL_SEED, REWARD_TREASURY_SEED};
use crate::states::global::Global;

/// Initialize the reward treasury for liquidity rewards
///
/// This treasury receives the liquidity rewards share of trading fees.
/// Funds are later distributed to LPs off-chain (or via a claim program).
#[derive(Accounts)]
pub struct InitRewardTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump,
        constraint = global.authority == authority.key()
    )]
    pub global: Account<'info, Global>,

    /// Rewards treasury token account (USDC)
    /// Owned by global PDA, stores liquidity rewards pool
    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = global,
        token::token_program = token_program,
        seeds = [REWARD_TREASURY_SEED.as_bytes()],
        bump
    )]
    pub reward_treasury: InterfaceAccount<'info, TokenAccount>,

    /// USDC mint account
    pub usdc_mint: InterfaceAccount<'info, token_interface::Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitRewardTreasury>) -> Result<()> {
    let global = &ctx.accounts.global;

    // Verify USDC mint matches global
    // AUDIT FIX: Use specific error type
    require!(
        ctx.accounts.usdc_mint.key() == global.usdc_mint,
        crate::errors::TerminatorError::InvalidUsdcMint
    );

    msg!("Reward treasury initialized: {}", ctx.accounts.reward_treasury.key());
    msg!("  Purpose: Collect liquidity reward fees");
    msg!("  Authority: Global PDA");

    Ok(())
}
