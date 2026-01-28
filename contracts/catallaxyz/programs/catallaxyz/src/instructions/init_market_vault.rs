use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, TokenAccount, TokenInterface};
use crate::constants::{GLOBAL_SEED, MARKET_SEED};
use crate::states::global::Global;

#[derive(Accounts)]
pub struct InitMarketVault<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: Global PDA - validated in handler
    #[account(
        seeds = [GLOBAL_SEED.as_bytes()],
        bump
    )]
    pub global: UncheckedAccount<'info>,

    #[account(
        seeds = [
            MARKET_SEED.as_bytes(),
            creator.key().as_ref(),
            market.market_id.as_ref(),
        ],
        bump = market.bump,
        constraint = market.creator == creator.key()
    )]
    pub market: Account<'info, crate::states::market::Market>,

    #[account(
        init,
        payer = creator,
        seeds = [b"market_vault", market.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = market,
        token::token_program = token_program
    )]
    pub market_usdc_vault: InterfaceAccount<'info, TokenAccount>,

    /// USDC mint account - validated in handler
    pub usdc_mint: InterfaceAccount<'info, token_interface::Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitMarketVault>) -> Result<()> {
    // Deserialize and validate global account
    let global_data = ctx.accounts.global.try_borrow_data()?;
    let global = Global::try_deserialize(&mut &global_data[8..])?;
    
    // Verify USDC mint matches global
    // AUDIT FIX: Use specific error type
    require!(
        ctx.accounts.usdc_mint.key() == global.usdc_mint,
        crate::errors::TerminatorError::InvalidUsdcMint
    );
    
    // Vault is initialized by Anchor's token constraint
    Ok(())
}
