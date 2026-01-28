use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, Mint, TokenAccount, TokenInterface, TransferChecked};
use crate::constants::{GLOBAL_SEED, MARKET_SEED};
use crate::errors::TerminatorError;
use crate::states::{global::Global, market::Market, UserBalance, UserPosition};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct DepositUsdcParams {
    pub amount: u64,
}

#[derive(Accounts)]
pub struct DepositUsdc<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump
    )]
    pub global: Box<Account<'info, Global>>,

    #[account(
        seeds = [
            MARKET_SEED.as_bytes(),
            market.creator.as_ref(),
            market.market_id.as_ref(),
        ],
        bump = market.bump,
        constraint = market.global == global.key() @ TerminatorError::InvalidAccountInput,
        // Prevent deposits to terminated/settled/paused markets
        constraint = market.can_trade() @ TerminatorError::MarketNotActive,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserBalance::INIT_SPACE,
        seeds = [b"user_balance", market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_balance: Box<Account<'info, UserBalance>>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [b"user_position", market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_position: Box<Account<'info, UserPosition>>,

    #[account(
        mut,
        seeds = [b"market_vault", market.key().as_ref()],
        bump,
        constraint = market_usdc_vault.mint == global.usdc_mint @ TerminatorError::InvalidTokenMint,
        constraint = market_usdc_vault.owner == market.key() @ TerminatorError::Unauthorized
    )]
    pub market_usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        // Validate user owns this token account and it's the correct mint
        constraint = user_usdc_account.owner == user.key() @ TerminatorError::Unauthorized,
        constraint = user_usdc_account.mint == global.usdc_mint @ TerminatorError::InvalidTokenMint,
    )]
    pub user_usdc_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositUsdc>, params: DepositUsdcParams) -> Result<()> {
    require!(params.amount > 0, TerminatorError::InvalidAmount);

    // Initialize user_balance if newly created (Pubkey::default means uninitialized)
    if ctx.accounts.user_balance.user == Pubkey::default() {
        ctx.accounts.user_balance.user = ctx.accounts.user.key();
        ctx.accounts.user_balance.market = ctx.accounts.market.key();
        ctx.accounts.user_balance.usdc_balance = 0;
        ctx.accounts.user_balance.bump = ctx.bumps.user_balance;
    }

    // Initialize user_position if newly created
    if ctx.accounts.user_position.user == Pubkey::default() {
        ctx.accounts.user_position.user = ctx.accounts.user.key();
        ctx.accounts.user_position.market = ctx.accounts.market.key();
        ctx.accounts.user_position.yes_balance = 0;
        ctx.accounts.user_position.no_balance = 0;
        ctx.accounts.user_position.bump = ctx.bumps.user_position;
    }

    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.user_usdc_account.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
            to: ctx.accounts.market_usdc_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    token_interface::transfer_checked(transfer_ctx, params.amount, 6)?;
    // AUDIT FIX v1.2.0: Reload vault after CPI to ensure data consistency
    ctx.accounts.market_usdc_vault.reload()?;

    ctx.accounts.user_balance.usdc_balance = ctx.accounts.user_balance.usdc_balance
        .checked_add(params.amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;

    Ok(())
}
