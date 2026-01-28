use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, Mint, TokenInterface, TokenAccount, TransferChecked};
use crate::constants::{MARKET_SEED, GLOBAL_SEED};
use crate::errors::TerminatorError;
use crate::events::PositionSplit;
use crate::states::{market::Market, global::Global, UserPosition};

/// Split USDC into YES and NO positions for binary market
/// 
/// Binary market: 1 USDC → 1 YES + 1 NO
/// User deposits USDC and receives equal amounts of YES and NO positions
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SplitPositionSingleParams {
    /// Amount of USDC to split
    pub amount: u64,
}

#[derive(Accounts)]
#[instruction(params: SplitPositionSingleParams)]
pub struct SplitPositionSingle<'info> {
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
        // Use can_trade() to also check pause status (not just active status)
        constraint = market.can_trade() @ TerminatorError::MarketNotActive,
        constraint = market.global == global.key() @ TerminatorError::InvalidAccountInput,
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
        init_if_needed,
        payer = user,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [b"user_position", market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,

    /// USDC mint account
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SplitPositionSingle>,
    params: SplitPositionSingleParams,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    require!(params.amount > 0, TerminatorError::InvalidAmount);

    // 1. Transfer USDC from user to market vault
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

    // 2. Update user position balances (1 USDC -> 1 YES + 1 NO)
    let user_position = &mut ctx.accounts.user_position;
    if user_position.user == Pubkey::default() {
        user_position.user = ctx.accounts.user.key();
        user_position.market = market.key();
        user_position.yes_balance = 0;
        user_position.no_balance = 0;
        user_position.bump = ctx.bumps.user_position;
    }

    user_position.yes_balance = user_position
        .yes_balance
        .checked_add(params.amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    user_position.no_balance = user_position
        .no_balance
        .checked_add(params.amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;

    // 3. Update market collateral and supply tracking
    market.total_position_collateral = market.total_position_collateral
        .checked_add(params.amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    market.total_yes_supply = market.total_yes_supply
        .checked_add(params.amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    market.total_no_supply = market.total_no_supply
        .checked_add(params.amount)
        .ok_or(TerminatorError::ArithmeticOverflow)?;

    // Enforce 1 YES + 1 NO = 1 USDC collateral
    require!(
        market.total_yes_supply == market.total_no_supply,
        TerminatorError::InvalidInput
    );
    require!(
        market.total_position_collateral == market.total_yes_supply,
        TerminatorError::InvalidInput
    );
    
    // Reload vault account after CPI to get fresh balance
    ctx.accounts.market_usdc_vault.reload()?;
    require!(
        ctx.accounts.market_usdc_vault.amount >= market.total_position_collateral,
        TerminatorError::InsufficientVaultBalance
    );

    emit!(PositionSplit {
        market: market.key(),
        user: ctx.accounts.user.key(),
        amount: params.amount,
        yes_amount: params.amount,
        no_amount: params.amount,
        timestamp: clock.unix_timestamp,
    });

    msg!("Split position for binary market");
    msg!("Amount: {} USDC", params.amount as f64 / 1_000_000.0);
    msg!("Position credited: {} YES + {} NO", params.amount, params.amount);

    Ok(())
}

