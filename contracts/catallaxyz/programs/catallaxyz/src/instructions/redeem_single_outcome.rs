use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, TokenInterface, TokenAccount, Mint, TransferChecked};
use crate::constants::{MARKET_SEED, PRICE_SCALE};
use crate::states::{Market, UserPosition};
use crate::states::market::market_status;
use crate::errors::TerminatorError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RedeemSingleOutcomeParams {
    /// Question index (always 0 for binary markets)
    pub question_index: u8,
    /// Outcome type: 0 = YES, 1 = NO
    pub outcome_type: u8,
    /// Amount of outcome tokens to redeem
    pub token_amount: u64,
}

/// Redeem single outcome tokens after market settlement/termination
/// After market settlement or termination, users can redeem single outcome tokens at final price
/// Example: If NO price is 0.2 at termination, YES price is 0.8
///          User can redeem 1 YES token for 0.8 USDC
///          User can redeem 1 NO token for 0.2 USDC
#[derive(Accounts)]
#[instruction(params: RedeemSingleOutcomeParams)]
pub struct RedeemSingleOutcome<'info> {
    #[account(
        mut,
        constraint = market.can_redeem @ TerminatorError::RedemptionNotAllowed,
    )]
    pub market: Account<'info, Market>,

    /// User position account (PDA)
    #[account(
        mut,
        seeds = [b"user_position", market.key().as_ref(), user.key().as_ref()],
        bump = user_outcome_token.bump,
        constraint = user_outcome_token.user == user.key() @ TerminatorError::Unauthorized,
    )]
    pub user_outcome_token: Account<'info, UserPosition>,

    /// Market USDC vault
    #[account(
        mut,
        seeds = [
            b"market_vault",
            market.key().as_ref(),
        ],
        bump,
    )]
    pub market_vault: InterfaceAccount<'info, TokenAccount>,

    /// User's USDC account to receive redemption
    #[account(mut)]
    pub user_usdc_account: InterfaceAccount<'info, TokenAccount>,
    
    /// USDC mint account
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    /// User (signer)
    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RedeemSingleOutcome>, params: RedeemSingleOutcomeParams) -> Result<()> {
    let market = &mut ctx.accounts.market;

    require!(
        market.is_randomly_terminated || market.status == market_status::SETTLED || market.status == market_status::TERMINATED,
        TerminatorError::MarketNotTerminated
    );

    // Validate outcome_type
    require!(
        params.outcome_type <= 1,
        TerminatorError::InvalidOutcome
    );

    // Get final price
    let final_price = if params.outcome_type == 0 {
        market.final_yes_price.ok_or(TerminatorError::MarketNotTerminated)?
    } else {
        market.final_no_price.ok_or(TerminatorError::MarketNotTerminated)?
    };

    let user_position = &mut ctx.accounts.user_outcome_token;
    let position_balance = if params.outcome_type == 0 {
        user_position.yes_balance
    } else {
        user_position.no_balance
    };

    require!(
        position_balance >= params.token_amount,
        TerminatorError::InsufficientOutcomeTokensForRedemption
    );

    // Calculate redemption amount: token_amount * final_price / 1_000_000
    // final_price is in 10^6 units representing 0.0-1.0 range
    let usdc_amount = (params.token_amount as u128)
        .checked_mul(final_price as u128)
        .and_then(|x| x.checked_div(PRICE_SCALE as u128))
        .ok_or(TerminatorError::ArithmeticOverflow)? as u64;

    require!(
        usdc_amount > 0,
        TerminatorError::InvalidAmount
    );

    require!(
        ctx.accounts.market_vault.amount >= usdc_amount,
        TerminatorError::InsufficientVaultBalance
    );

    if params.outcome_type == 0 {
        user_position.yes_balance = user_position.yes_balance
            .checked_sub(params.token_amount)
            .ok_or(TerminatorError::InsufficientOutcomeTokensForRedemption)?;
        market.total_yes_supply = market.total_yes_supply
            .checked_sub(params.token_amount)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
    } else {
        user_position.no_balance = user_position.no_balance
            .checked_sub(params.token_amount)
            .ok_or(TerminatorError::InsufficientOutcomeTokensForRedemption)?;
        market.total_no_supply = market.total_no_supply
            .checked_sub(params.token_amount)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
    }

    // Enforce global redeemable limit
    let remaining = market.total_redeemable_usdc
        .checked_sub(market.total_redeemed_usdc)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    require!(usdc_amount <= remaining, TerminatorError::InsufficientVaultBalance);
    market.total_redeemed_usdc = market.total_redeemed_usdc
        .checked_add(usdc_amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    market.total_position_collateral = market.total_position_collateral
        .checked_sub(usdc_amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;

    // 2. Transfer USDC from market vault to user
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
            from: ctx.accounts.market_vault.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
            to: ctx.accounts.user_usdc_account.to_account_info(),
            authority: market.to_account_info(),
        },
        signer_seeds,
    );
    token_interface::transfer_checked(transfer_ctx, usdc_amount, 6)?;

    require!(
        ctx.accounts.market_vault.amount == market.total_position_collateral,
        TerminatorError::InsufficientVaultBalance
    );

    msg!(
        "Redeemed {} {} tokens for {} USDC (price: {})",
        params.token_amount,
        if params.outcome_type == 0 { "YES" } else { "NO" },
        usdc_amount,
        final_price
    );

    Ok(())
}
