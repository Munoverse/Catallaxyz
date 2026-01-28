use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, TokenAccount, TokenInterface, TransferChecked, Mint};
use crate::constants::{GLOBAL_SEED, PLATFORM_TREASURY_SEED};
use crate::errors::TerminatorError;
use crate::events::PlatformFeesWithdrawn;
use crate::states::global::Global;

/// Withdraw platform fees (admin only)
/// 
/// Allows admin to withdraw accumulated trading fees and market creation fees
/// from the platform treasury to a specified recipient address.
/// 
/// Safety:
/// - Only program authority can call this
/// - Transfers USDC from platform treasury to recipient
/// - Updates global fee tracking stats
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WithdrawPlatformFeesParams {
    /// Amount to withdraw (in USDC lamports)
    pub amount: u64,
}

#[derive(Accounts)]
pub struct WithdrawPlatformFees<'info> {
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

    /// Platform treasury (holds accumulated fees)
    #[account(
        mut,
        seeds = [PLATFORM_TREASURY_SEED.as_bytes()],
        bump = global.platform_treasury_bump
    )]
    pub platform_treasury: InterfaceAccount<'info, TokenAccount>,

    /// Recipient USDC account (where fees will be sent)
    #[account(mut)]
    pub recipient_usdc_account: InterfaceAccount<'info, TokenAccount>,

    /// USDC mint
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<WithdrawPlatformFees>, params: WithdrawPlatformFeesParams) -> Result<()> {
    let global = &ctx.accounts.global;
    let clock = Clock::get()?;

    require!(params.amount > 0, TerminatorError::InvalidAmount);

    // Verify sufficient balance in treasury
    require!(
        ctx.accounts.platform_treasury.amount >= params.amount,
        TerminatorError::InsufficientVaultBalance
    );

    // Verify recipient account is for correct mint
    require!(
        ctx.accounts.recipient_usdc_account.mint == global.usdc_mint,
        TerminatorError::InvalidTokenMint
    );

    // Transfer fees from platform treasury to recipient
    let global_seeds = &[
        GLOBAL_SEED.as_bytes(),
        &[global.bump],
    ];
    let signer_seeds = &[&global_seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.platform_treasury.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
            to: ctx.accounts.recipient_usdc_account.to_account_info(),
            authority: global.to_account_info(),
        },
        signer_seeds,
    );
    token_interface::transfer_checked(transfer_ctx, params.amount, 6)?;
    // AUDIT FIX: Reload accounts after CPI to ensure data consistency for logging
    ctx.accounts.platform_treasury.reload()?;
    ctx.accounts.recipient_usdc_account.reload()?;

    emit!(PlatformFeesWithdrawn {
        recipient: ctx.accounts.recipient_usdc_account.owner,
        withdrawn_by: ctx.accounts.authority.key(),
        amount: params.amount,
        withdrawn_at: clock.unix_timestamp,
    });

    msg!("Platform fees withdrawn successfully");
    msg!("Amount: {} USDC", params.amount as f64 / 1_000_000.0);
    msg!("Recipient: {}", ctx.accounts.recipient_usdc_account.owner);
    msg!("Remaining treasury balance: {} USDC", 
        ctx.accounts.platform_treasury.amount as f64 / 1_000_000.0);

    Ok(())
}
