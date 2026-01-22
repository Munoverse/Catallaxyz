use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, TokenAccount, TokenInterface};
use crate::constants::{GLOBAL_SEED, TREASURY_SEED};
use crate::states::global::Global;

#[derive(Accounts)]
pub struct InitTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump,
        constraint = global.authority == authority.key()
    )]
    pub global: Account<'info, Global>,

    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = global,
        token::token_program = token_program,
        seeds = [TREASURY_SEED.as_bytes()],
        bump
    )]
    pub treasury: InterfaceAccount<'info, TokenAccount>,

    /// USDC mint account
    pub usdc_mint: InterfaceAccount<'info, token_interface::Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitTreasury>) -> Result<()> {
    let global = &mut ctx.accounts.global;
    
    // Verify USDC mint matches global
    require!(
        ctx.accounts.usdc_mint.key() == global.usdc_mint,
        crate::errors::TerminatorError::InvalidMarketType
    );
    
    // Store treasury bump
    global.treasury_bump = ctx.bumps.treasury;
    
    msg!("Official treasury initialized: {}", ctx.accounts.treasury.key());
    
    Ok(())
}
