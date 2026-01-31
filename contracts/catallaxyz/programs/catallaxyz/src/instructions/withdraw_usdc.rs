use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, Mint, TokenAccount, TokenInterface, TransferChecked};
use crate::constants::{GLOBAL_SEED, MARKET_SEED};
use crate::errors::TerminatorError;
use crate::states::{global::Global, market::Market, UserBalance};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct WithdrawUsdcParams {
    pub amount: u64,
}

#[derive(Accounts)]
pub struct WithdrawUsdc<'info> {
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
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [b"user_balance", market.key().as_ref(), user.key().as_ref()],
        bump = user_balance.bump,
        constraint = user_balance.user == user.key() @ TerminatorError::Unauthorized,
    )]
    pub user_balance: Account<'info, UserBalance>,

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
    pub user_usdc_account: InterfaceAccount<'info, TokenAccount>,

    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<WithdrawUsdc>, params: WithdrawUsdcParams) -> Result<()> {
    require!(params.amount > 0, TerminatorError::InvalidAmount);
    require!(ctx.accounts.user_balance.usdc_balance >= params.amount, TerminatorError::InsufficientBalance);

    let market = &ctx.accounts.market;
    
    // AUDIT FIX v1.2.5: Check market status - allow withdrawal in active or redeemable markets only
    // This prevents withdrawals from paused markets (admin intervention)
    require!(
        market.can_trade() || market.can_redeem,
        TerminatorError::MarketNotActive
    );
    let market_seeds = &[
        MARKET_SEED.as_bytes(),
        market.creator.as_ref(),
        market.market_id.as_ref(),
        &[market.bump],
    ];
    let signer_seeds = &[&market_seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.market_usdc_vault.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
            to: ctx.accounts.user_usdc_account.to_account_info(),
            authority: market.to_account_info(),
        },
        signer_seeds,
    );
    token_interface::transfer_checked(transfer_ctx, params.amount, 6)?;
    // AUDIT FIX v1.2.0: Reload vault after CPI to ensure data consistency
    ctx.accounts.market_usdc_vault.reload()?;

    ctx.accounts.user_balance.usdc_balance = ctx.accounts.user_balance.usdc_balance
        .checked_sub(params.amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;

    Ok(())
}
