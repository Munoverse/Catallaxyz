use anchor_lang::prelude::*;
use crate::switchboard_lite::{RandomnessAccountData, SWITCHBOARD_PROGRAM_ID};
use crate::states::Market;
use crate::errors::TerminatorError;

/// Validate Switchboard randomness account (OPTIONAL pre-check instruction)
/// 
/// # Purpose
/// This instruction validates that the market's randomness account is properly
/// configured and contains a recent VRF value. It is OPTIONAL and serves as a
/// pre-flight check before calling `settle_with_randomness`.
/// 
/// # When to Use
/// - Frontend can call this to verify VRF setup before showing "Check Termination" option
/// - Useful for debugging VRF configuration issues
/// - NOT required before `settle_with_randomness` (which does its own validation)
/// 
/// # Note on Switchboard On-Demand
/// We use Switchboard On-Demand which provides a continuously updating randomness feed.
/// Unlike traditional VRF request-response patterns, you DO NOT need to:
/// - Request randomness and wait for a callback
/// - Pay per-request fees to an oracle
/// 
/// The randomness account is updated by the Switchboard oracle network automatically.
/// You simply read the current value from the account.
#[derive(Accounts)]
pub struct RequestRandomness<'info> {
    #[account(
        constraint = market.is_active() @ TerminatorError::MarketNotActive,
    )]
    pub market: Account<'info, Market>,

    /// Switchboard randomness account
    /// CHECK: Validated by Switchboard program
    #[account(
        address = market.randomness_account @ TerminatorError::InvalidSwitchboardOracle
    )]
    pub randomness_account: AccountInfo<'info>,

    /// User requesting validation (no fees charged for this instruction)
    pub payer: Signer<'info>,

    /// Switchboard program
    /// CHECK: Switchboard program ID
    pub switchboard_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RequestRandomness>) -> Result<()> {
    let market = &ctx.accounts.market;
    let clock = Clock::get()?;

    // Validate Switchboard randomness account ownership
    require!(
        ctx.accounts.randomness_account.owner == &SWITCHBOARD_PROGRAM_ID,
        TerminatorError::InvalidSwitchboardOracle
    );
    
    // Parse randomness account data
    let randomness_data = RandomnessAccountData::parse(&ctx.accounts.randomness_account.data.borrow())
        .map_err(|_| TerminatorError::InvalidSwitchboardOracle)?;

    // Verify randomness account belongs to correct queue
    require!(
        randomness_data.queue == market.switchboard_queue,
        TerminatorError::InvalidSwitchboardOracle
    );

    // Check if VRF value is recent enough (within 150 slots ≈ 1 minute)
    let slots_since_update = clock.slot.saturating_sub(randomness_data.slot);
    let is_recent = slots_since_update <= 150;

    msg!("✅ Randomness validation for market: {}", market.key());
    msg!("   Randomness account: {}", ctx.accounts.randomness_account.key());
    msg!("   VRF slot: {}, current slot: {}, age: {} slots", 
        randomness_data.slot, clock.slot, slots_since_update);
    msg!("   VRF is recent: {} ({})", 
        if is_recent { "Yes" } else { "No - may need update" },
        if is_recent { "ready for termination check" } else { "wait for oracle update" }
    );

    // Note: We don't fail if VRF is stale - just warn. 
    // settle_with_randomness will fail with SwitchboardUpdateRequired if needed.

    Ok(())
}

