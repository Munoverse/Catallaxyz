use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, Mint, TokenAccount, TokenInterface, TransferChecked};
use crate::constants::{
    DEFAULT_TERMINATION_PROBABILITY, GLOBAL_SEED, MARKET_CREATION_FEE, MARKET_SEED,
    MAX_DESCRIPTION_LEN, MAX_OUTCOME_DESCRIPTION_LEN, MAX_QUESTION_LEN, PLATFORM_TREASURY_SEED,
};
use crate::errors::TerminatorError;
use crate::switchboard_lite::{RandomnessAccountData, SWITCHBOARD_PROGRAM_ID};
use crate::events::{MarketCreated, MarketCreationFeeCollected};
use crate::states::{global::Global, market::Market};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateMarketParams {
    pub question: String,
    pub description: String,
    pub yes_description: String,
    pub no_description: String,
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

    require!(
        params.question.len() <= MAX_QUESTION_LEN,
        TerminatorError::InvalidInput
    );
    require!(
        params.description.len() <= MAX_DESCRIPTION_LEN,
        TerminatorError::InvalidInput
    );
    require!(
        params.yes_description.len() <= MAX_OUTCOME_DESCRIPTION_LEN,
        TerminatorError::InvalidInput
    );
    require!(
        params.no_description.len() <= MAX_OUTCOME_DESCRIPTION_LEN,
        TerminatorError::InvalidInput
    );

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
    market.question = params.question.clone();
    market.description = params.description.clone();
    market.yes_description = params.yes_description.clone();
    market.no_description = params.no_description.clone();
    market.created_at = clock.unix_timestamp;
    market.last_activity_ts = clock.unix_timestamp;
    // AUDIT FIX v1.2.2: Use market_status constant
    market.status = crate::states::market::market_status::ACTIVE;
    market.total_trades = 0;
    market.switchboard_queue = ctx.accounts.switchboard_queue.key();
    market.randomness_account = ctx.accounts.randomness_account.key();
    
    // Reserved for optional tokenized positions (unused for position-based markets).
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
    market.trade_nonce = 0;
    
    // Creator incentive tracking
    // Fee rates are read from Global account (see Global.calculate_taker_fee_rate())
    // Distribution: 75% platform, 20% rewards, 5% creator
    market.creator_incentive_accrued = 0;
    
    market.bump = ctx.bumps.market;

    // Note: YES/NO positions are tracked in UserPosition, not SPL tokens.

    emit!(MarketCreated {
        market: market.key(),
        creator: ctx.accounts.creator.key(),
        question: params.question,
        description: params.description,
        yes_description: params.yes_description,
        no_description: params.no_description,
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
