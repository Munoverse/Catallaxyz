use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, Mint, TokenAccount, TokenInterface, TransferChecked};
use crate::constants::{GLOBAL_SEED, REWARD_TREASURY_SEED};
use crate::errors::TerminatorError;
use crate::events::LiquidityRewardDistributed;
use crate::states::global::Global;

/// Distribute liquidity reward to a recipient (admin only)
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DistributeLiquidityRewardParams {
    /// Amount to distribute (in USDC lamports)
    pub amount: u64,
}

#[derive(Accounts)]
pub struct DistributeLiquidityReward<'info> {
    /// Global authority (program admin)
    #[account(
        mut,
        constraint = authority.key() == global.authority @ TerminatorError::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// Global state
    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump
    )]
    pub global: Account<'info, Global>,

    /// Reward treasury (holds liquidity rewards)
    #[account(
        mut,
        seeds = [REWARD_TREASURY_SEED.as_bytes()],
        bump
    )]
    pub reward_treasury: InterfaceAccount<'info, TokenAccount>,

    /// Recipient USDC account
    #[account(mut)]
    pub recipient_usdc_account: InterfaceAccount<'info, TokenAccount>,

    /// USDC mint
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<DistributeLiquidityReward>,
    params: DistributeLiquidityRewardParams,
) -> Result<()> {
    let global = &ctx.accounts.global;
    let clock = Clock::get()?;

    require!(params.amount > 0, TerminatorError::InvalidAmount);

    require!(
        ctx.accounts.reward_treasury.amount >= params.amount,
        TerminatorError::InsufficientVaultBalance
    );

    require!(
        ctx.accounts.recipient_usdc_account.mint == global.usdc_mint,
        TerminatorError::InvalidTokenMint
    );

    let global_seeds = &[GLOBAL_SEED.as_bytes(), &[global.bump]];
    let signer_seeds = &[&global_seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.reward_treasury.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
            to: ctx.accounts.recipient_usdc_account.to_account_info(),
            authority: global.to_account_info(),
        },
        signer_seeds,
    );
    token_interface::transfer_checked(transfer_ctx, params.amount, 6)?;
    // AUDIT FIX: Reload accounts after CPI to ensure data consistency
    ctx.accounts.reward_treasury.reload()?;
    ctx.accounts.recipient_usdc_account.reload()?;

    emit!(LiquidityRewardDistributed {
        recipient: ctx.accounts.recipient_usdc_account.owner,
        distributed_by: ctx.accounts.authority.key(),
        amount: params.amount,
        distributed_at: clock.unix_timestamp,
    });

    msg!("Liquidity reward distributed");
    msg!("Amount: {} USDC", params.amount as f64 / 1_000_000.0);
    msg!("Recipient: {}", ctx.accounts.recipient_usdc_account.owner);
    msg!("Remaining reward treasury balance: {} USDC",
        ctx.accounts.reward_treasury.amount as f64 / 1_000_000.0);

    Ok(())
}
