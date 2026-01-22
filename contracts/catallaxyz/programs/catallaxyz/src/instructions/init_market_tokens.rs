use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};
use crate::constants::{GLOBAL_SEED, MARKET_SEED, YES_TOKEN_SEED, NO_TOKEN_SEED, USDC_DECIMALS};
use crate::errors::TerminatorError;
use crate::states::{market::Market, global::Global};

/// Initialize YES and NO token mints for a binary market.
#[derive(Accounts)]
pub struct InitMarketTokens<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump
    )]
    pub global: Account<'info, Global>,

    #[account(
        mut,
        seeds = [
            MARKET_SEED.as_bytes(),
            creator.key().as_ref(),
            market.market_id.as_ref(),
        ],
        bump = market.bump,
        constraint = market.creator == creator.key() @ TerminatorError::Unauthorized,
        constraint = market.global == global.key() @ TerminatorError::InvalidAccountInput,
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = creator,
        seeds = [YES_TOKEN_SEED.as_bytes(), market.key().as_ref()],
        bump,
        mint::decimals = USDC_DECIMALS,
        mint::authority = market,
        mint::freeze_authority = market,
        mint::token_program = token_program
    )]
    pub yes_token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = creator,
        seeds = [NO_TOKEN_SEED.as_bytes(), market.key().as_ref()],
        bump,
        mint::decimals = USDC_DECIMALS,
        mint::authority = market,
        mint::freeze_authority = market,
        mint::token_program = token_program
    )]
    pub no_token_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitMarketTokens>) -> Result<()> {
    let _ = ctx;
    err!(TerminatorError::DeprecatedInstruction)
}
