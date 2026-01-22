use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, Mint, TokenAccount, TokenInterface, TransferChecked};
use crate::constants::{GLOBAL_SEED, MARKET_SEED, PLATFORM_TREASURY_SEED, MARKET_CREATION_FEE, DEFAULT_TERMINATION_PROBABILITY};
use crate::errors::TerminatorError;
use crate::switchboard_lite::{RandomnessAccountData, SWITCHBOARD_PROGRAM_ID};
use crate::events::{MarketCreated, MarketCreationFeeCollected};
use crate::states::{global::Global, market::Market};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateMarketParams {
    pub question: String,
    /// Unique market identifier (per creator)
    pub market_id: [u8; 32],
}

#[derive(Accounts)]
#[instruction(params: CreateMarketParams)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump
    )]
    pub global: Account<'info, Global>,

    /// CHECK: Market account will be created with unique identifier
    #[account(
        init,
        payer = creator,
        space = 8 + Market::INIT_SPACE,
        seeds = [
            MARKET_SEED.as_bytes(),
            creator.key().as_ref(),
            params.market_id.as_ref(),
        ],
        bump
    )]
    pub market: Account<'info, Market>,

    /// CHECK: Switchboard queue account
    pub switchboard_queue: UncheckedAccount<'info>,

    /// Switchboard randomness account (fixed per market)
    /// CHECK: Validated in handler
    pub randomness_account: UncheckedAccount<'info>,

    /// Platform treasury (collects market creation fee)
    #[account(
        mut,
        seeds = [PLATFORM_TREASURY_SEED.as_bytes()],
        bump = global.platform_treasury_bump
    )]
    pub platform_treasury: InterfaceAccount<'info, TokenAccount>,

    /// Creator's USDC account (for paying creation fee)
    #[account(mut)]
    pub creator_usdc_account: InterfaceAccount<'info, TokenAccount>,

    /// USDC mint account
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
    let clock = Clock::get()?;

    let market = &mut ctx.accounts.market;
    let global = &mut ctx.accounts.global;

    // Transfer creation fee from creator to platform treasury
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.creator_usdc_account.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
            to: ctx.accounts.platform_treasury.to_account_info(),
            authority: ctx.accounts.creator.to_account_info(),
        },
    );
    token_interface::transfer_checked(transfer_ctx, MARKET_CREATION_FEE, 6)?;

    // Update global stats
    global.total_creation_fees_collected = global.total_creation_fees_collected
        .checked_add(MARKET_CREATION_FEE)
        .ok_or(TerminatorError::ArithmeticOverflow)?;

    // Validate randomness account belongs to Switchboard and correct queue
    require!(
        ctx.accounts.randomness_account.owner == &SWITCHBOARD_PROGRAM_ID,
        TerminatorError::InvalidSwitchboardOracle
    );
    let randomness_data = RandomnessAccountData::parse(&ctx.accounts.randomness_account.data.borrow())
        .map_err(|_| TerminatorError::InvalidSwitchboardOracle)?;
    require!(
        randomness_data.queue == ctx.accounts.switchboard_queue.key(),
        TerminatorError::InvalidSwitchboardOracle
    );

    // Initialize market (binary only)
    market.creator = ctx.accounts.creator.key();
    market.global = ctx.accounts.global.key();
    market.market_id = params.market_id;
    market.created_at = clock.unix_timestamp;
    market.last_activity_ts = clock.unix_timestamp;
    market.status = 0; // Active
    market.total_trades = 0;
    market.switchboard_queue = ctx.accounts.switchboard_queue.key();
    market.randomness_account = ctx.accounts.randomness_account.key();
    
    // Initialize outcome token mints array (binary: YES/NO)
    market.outcome_token_mints = [Pubkey::default(); crate::constants::MAX_OUTCOME_TOKENS];
    market.total_position_collateral = 0;
    market.total_yes_supply = 0;
    market.total_no_supply = 0;
    market.total_redeemable_usdc = 0;
    market.total_redeemed_usdc = 0;
    market.last_trade_outcome = None;
    market.reference_agent = None;
    market.last_trade_slot = None;
    market.last_trade_yes_price = None;
    market.last_trade_no_price = None;
    
    // Random termination settings (Updated 2026-01-10: User opt-in)
    // User decides whether to opt-in "check termination" when trading
    // Removed: every 5 trades check, 40s cooldown
    market.random_termination_enabled = true;
    market.termination_probability = DEFAULT_TERMINATION_PROBABILITY; // 0.1% per trade
    market.is_randomly_terminated = false;
    market.final_yes_price = None;
    market.final_no_price = None;
    market.can_redeem = false;
    market.termination_trade_slot = None;
    
    // Creator incentive tracking
    // Fee rates are read from Global account (see Global.calculate_taker_fee_rate())
    // Distribution: 75% platform, 20% rewards, 5% creator
    market.creator_incentive_accrued = 0;
    
    market.bump = ctx.bumps.market;

    // Note: YES/NO token mints will be initialized in init_market_tokens

    emit!(MarketCreated {
        market: market.key(),
        creator: ctx.accounts.creator.key(),
        question: params.question,
        market_id: market.market_id,
        timestamp: clock.unix_timestamp,
    });

    emit!(MarketCreationFeeCollected {
        market: market.key(),
        creator: ctx.accounts.creator.key(),
        fee_amount: MARKET_CREATION_FEE,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });

    msg!("Market creation fee collected: {} USDC", MARKET_CREATION_FEE as f64 / 1_000_000.0);
    msg!("Platform treasury balance updated");

    Ok(())
}
