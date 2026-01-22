use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, Mint, TokenInterface, TokenAccount, TransferChecked};
use crate::constants::{MARKET_SEED, GLOBAL_SEED};
use crate::errors::TerminatorError;
use crate::events::PositionMerged;
use crate::states::{market::Market, market::market_status, global::Global, UserPosition};

/// Merge YES and NO tokens back to USDC for binary market
/// 
/// Merge: 1 YES + 1 NO → 1 USDC
/// User must hold equal amounts of both YES and NO tokens
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MergePositionSingleParams {
    /// Amount to merge
    pub amount: u64,
}

#[derive(Accounts)]
#[instruction(params: MergePositionSingleParams)]
pub struct MergePositionSingle<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// Global state account (contains USDC mint reference)
    #[account(
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump,
    )]
    pub global: Box<Account<'info, Global>>,

    /// Market account
    #[account(
        mut,
        seeds = [
            MARKET_SEED.as_bytes(),
            market.creator.as_ref(),
            market.market_id.as_ref(),
        ],
        bump = market.bump,
        constraint = market.global == global.key() @ TerminatorError::InvalidAccountInput,
        // Allow merge only for active markets OR terminated markets (for redemption)
        // Users can merge positions in terminated markets to recover USDC
        constraint = market.is_active() || market.is_randomly_terminated @ TerminatorError::MarketNotActive,
    )]
    pub market: Box<Account<'info, Market>>,

    /// User's USDC account
    #[account(
        mut,
        constraint = user_usdc_account.owner == user.key() @ TerminatorError::Unauthorized,
        constraint = user_usdc_account.mint == global.usdc_mint @ TerminatorError::InvalidTokenMint,
    )]
    pub user_usdc_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Market's USDC vault
    #[account(
        mut,
        seeds = [b"market_vault", market.key().as_ref()],
        bump,
        constraint = market_usdc_vault.mint == global.usdc_mint @ TerminatorError::InvalidTokenMint,
        constraint = market_usdc_vault.owner == market.key() @ TerminatorError::Unauthorized,
    )]
    pub market_usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// User position PDA (tracks YES/NO balances)
    #[account(
        mut,
        seeds = [b"user_position", market.key().as_ref(), user.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.user == user.key() @ TerminatorError::Unauthorized
    )]
    pub user_position: Account<'info, UserPosition>,
    
    /// USDC mint account
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<MergePositionSingle>,
    params: MergePositionSingleParams,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;
    
    require!(params.amount > 0, TerminatorError::InvalidAmount);
    let user_position = &mut ctx.accounts.user_position;

    // Check user has sufficient balances
    require!(
        user_position.yes_balance >= params.amount,
        TerminatorError::InsufficientBalance
    );
    require!(
        user_position.no_balance >= params.amount,
        TerminatorError::InsufficientBalance
    );

    // Check vault has sufficient USDC
    require!(
        ctx.accounts.market_usdc_vault.amount >= params.amount,
        TerminatorError::InsufficientVaultBalance
    );

    // 1. Update position balances
    user_position.yes_balance = user_position.yes_balance
        .checked_sub(params.amount)
        .ok_or(TerminatorError::InsufficientBalance)?;
    user_position.no_balance = user_position.no_balance
        .checked_sub(params.amount)
        .ok_or(TerminatorError::InsufficientBalance)?;

    // Track redemption usage after settlement/termination
    let should_track_redeem = market.can_redeem || market.status == market_status::SETTLED;
    if should_track_redeem {
        let remaining = market.total_redeemable_usdc
            .checked_sub(market.total_redeemed_usdc)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
        require!(params.amount <= remaining, TerminatorError::InsufficientVaultBalance);
        market.total_redeemed_usdc = market.total_redeemed_usdc
            .checked_add(params.amount)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
    }

    market.total_position_collateral = market.total_position_collateral
        .checked_sub(params.amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    market.total_yes_supply = market.total_yes_supply
        .checked_sub(params.amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    market.total_no_supply = market.total_no_supply
        .checked_sub(params.amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;

    // 2. Transfer USDC from vault to user
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

    if market.is_active() {
        require!(
            market.total_yes_supply == market.total_no_supply,
            TerminatorError::InvalidInput
        );
        require!(
            market.total_position_collateral == market.total_yes_supply,
            TerminatorError::InvalidInput
        );
    }
    require!(
        ctx.accounts.market_usdc_vault.amount == market.total_position_collateral,
        TerminatorError::InsufficientVaultBalance
    );

    emit!(PositionMerged {
        market: market.key(),
        user: ctx.accounts.user.key(),
        amount: params.amount,
        yes_amount: params.amount,
        no_amount: params.amount,
        timestamp: clock.unix_timestamp,
    });

    msg!("Merged position for binary market");
    msg!("Amount: {} position units", params.amount);
    msg!("Redeemed: {} USDC", params.amount as f64 / 1_000_000.0);

    Ok(())
}

