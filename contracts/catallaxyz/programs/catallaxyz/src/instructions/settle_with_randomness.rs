use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, TokenAccount, TokenInterface, TransferChecked};
use crate::constants::{GLOBAL_SEED, CREATOR_TREASURY_SEED};
use crate::switchboard_lite::{RandomnessAccountData, SWITCHBOARD_PROGRAM_ID};
use crate::states::{global::Global, Market};
use crate::errors::TerminatorError;
use crate::events::{MarketSettled, MarketTerminated, TerminationCheckResult};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SettleWithRandomnessParams {
    /// Random termination threshold (scaled by 10^8, 0-100000000 represents 0%-100%)
    /// Example: 10000000 = 10% probability of triggering termination
    pub settlement_threshold: u64,
    /// Last trade YES price (scaled by 10^6, 0-1000000)
    pub last_trade_yes_price: u64,
    /// Last trade NO price (scaled by 10^6, 0-1000000)
    pub last_trade_no_price: u64,
    /// Last trade slot
    pub last_trade_slot: u64,
    /// Whether user opted to check termination (and paid VRF fee)
    pub user_opted_termination_check: bool,
}

/// Check and settle market using Switchboard randomness
/// Implements random termination mechanism from the paper:
/// - After each trade, market termination is triggered with probability p
/// - Uses VRF to generate random number, if random < threshold, terminate market
/// - When terminated, the last trade price becomes the final price
#[derive(Accounts)]
#[instruction(params: SettleWithRandomnessParams)]
pub struct SettleWithRandomness<'info> {
    /// Global state (for treasury authority)
    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump
    )]
    pub global: Box<Account<'info, Global>>,

    #[account(
        mut,
        constraint = market.is_active() @ TerminatorError::MarketNotActive,
        // AUDIT FIX: Use specific error type
        constraint = market.reference_agent.is_some() @ TerminatorError::MissingReferenceAgent,
    )]
    pub market: Box<Account<'info, Market>>,

    /// Creator treasury (holds creator incentives)
    #[account(
        mut,
        seeds = [CREATOR_TREASURY_SEED.as_bytes()],
        bump,
        constraint = creator_treasury.owner == global.key() @ TerminatorError::InvalidTokenAccountOwner
    )]
    pub creator_treasury: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Creator USDC account (receives incentive payout)
    #[account(
        mut,
        constraint = creator_usdc_account.owner == market.creator @ TerminatorError::InvalidTokenAccountOwner,
        constraint = creator_usdc_account.mint == global.usdc_mint @ TerminatorError::InvalidMint
    )]
    pub creator_usdc_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// USDC mint account
    pub usdc_mint: Box<InterfaceAccount<'info, token_interface::Mint>>,

    /// Market USDC vault (backing YES/NO positions)
    #[account(
        mut,
        seeds = [b"market_vault", market.key().as_ref()],
        bump,
        constraint = market_usdc_vault.mint == global.usdc_mint @ TerminatorError::InvalidTokenMint,
        constraint = market_usdc_vault.owner == market.key() @ TerminatorError::Unauthorized
    )]
    pub market_usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Switchboard randomness account
    /// CHECK: Validated by Switchboard program
    #[account(
        mut,
        address = market.randomness_account @ TerminatorError::InvalidSwitchboardOracle
    )]
    pub randomness_account: AccountInfo<'info>,

    /// Caller
    #[account(mut)]
    pub caller: Signer<'info>,

    /// Switchboard program
    /// CHECK: Switchboard program ID
    pub switchboard_program: AccountInfo<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SettleWithRandomness>, params: SettleWithRandomnessParams) -> Result<()> {
    let market_key = ctx.accounts.market.key();
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    // User opt-in mechanism: only execute if user checked "check termination"
    // If user did not opt-in, return early without calling VRF
    if !params.user_opted_termination_check {
        msg!("User did not opt for termination check - skipping VRF");
        return Ok(());
    }

    if !market.random_termination_enabled {
        msg!("Random termination disabled - skipping VRF");
        return Ok(());
    }

    // ============================================
    // CRITICAL: Concurrent Termination Protection
    // ============================================
    // 
    // If market is already terminated, return early with specific error.
    // This ensures "first come, first served" - only the first successful
    // termination takes effect. All subsequent attempts fail gracefully.
    //
    // Solana executes transactions sequentially within a slot, so:
    // - If User A and User B both try to terminate in the same slot
    // - User A's transaction runs first and succeeds
    // - User B's transaction runs second and fails with MarketTerminated
    //
    // The frontend should handle this error gracefully and inform the user.
    require!(
        !market.is_randomly_terminated,
        TerminatorError::MarketTerminated
    );

    // Validate threshold against on-chain market settings (0-100,000,000 scale)
    // AUDIT FIX v1.1.0: Use checked_mul instead of saturating_mul for safety
    let expected_threshold = (market.termination_probability as u64)
        .checked_mul(100)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    require!(
        expected_threshold <= 100_000_000,
        TerminatorError::InvalidInput
    );
    require!(
        params.settlement_threshold == expected_threshold,
        TerminatorError::InvalidInput
    );

    // Validate prices (YES + NO should equal 1.0)
    crate::utils::validate_price_sum(params.last_trade_yes_price, params.last_trade_no_price)?;

    // Best-effort sanity: if we have recorded last prices, require params to match closely
    if let (Some(yes), Some(no)) = (market.last_trade_yes_price, market.last_trade_no_price) {
        let yes_diff = if yes > params.last_trade_yes_price {
            yes - params.last_trade_yes_price
        } else {
            params.last_trade_yes_price - yes
        };
        let no_diff = if no > params.last_trade_no_price {
            no - params.last_trade_no_price
        } else {
            params.last_trade_no_price - no
        };
        // Allow up to 0.01% drift (100 / 1e6) to tolerate rounding
        require!(yes_diff <= 100 && no_diff <= 100, TerminatorError::InvalidInput);
    } else {
        // If missing, persist as the last observed prices for inactivity termination/redemption.
        market.last_trade_yes_price = Some(params.last_trade_yes_price);
        market.last_trade_no_price = Some(params.last_trade_no_price);
    }

    if market.last_trade_slot.is_none() {
        market.last_trade_slot = Some(params.last_trade_slot);
    }

    // Vault/position invariant checks (pre-termination)
    require!(
        market.total_yes_supply == market.total_no_supply,
        TerminatorError::InvalidInput
    );
    require!(
        market.total_position_collateral == market.total_yes_supply,
        TerminatorError::InvalidInput
    );
    require!(
        ctx.accounts.market_usdc_vault.amount == market.total_position_collateral,
        TerminatorError::InsufficientVaultBalance
    );

    // Parse Switchboard randomness account
    require!(
        ctx.accounts.randomness_account.owner == &SWITCHBOARD_PROGRAM_ID,
        TerminatorError::InvalidSwitchboardOracle
    );
    let randomness_data = RandomnessAccountData::parse(&ctx.accounts.randomness_account.data.borrow())
        .map_err(|_| TerminatorError::InvalidSwitchboardOracle)?;

    // Enforce fixed randomness account per market
    require!(
        ctx.accounts.randomness_account.key() == market.randomness_account,
        TerminatorError::InvalidSwitchboardOracle
    );

    // Verify randomness account belongs to correct queue
    require!(
        randomness_data.queue == market.switchboard_queue,
        TerminatorError::InvalidSwitchboardOracle
    );

    // Validate randomness value validity
    let vrf_value = randomness_data
        .get_value(clock.slot)
        .map_err(|_| TerminatorError::SwitchboardUpdateRequired)?;

    // ============================================
    // Per-trade Unique Randomness Generation
    // ============================================
    // 
    // Problem: Multiple users reading same VRF slot get identical randomness
    // Solution: Derive unique randomness per trade using:
    //   unique_random = keccak256(vrf_value || market || user || trade_nonce || slot)
    //
    // This ensures each trade gets truly unique randomness even if:
    // 1. Multiple users call settle_with_randomness in same slot
    // 2. VRF hasn't updated yet (stale value)
    // 3. Users trade in rapid succession
    
    // Increment trade nonce to ensure uniqueness
    // AUDIT FIX v1.2.0: Handle Result from increment_trade_nonce
    let nonce = market.increment_trade_nonce()?;
    
    // Derive unique randomness for this specific trade
    let unique_randomness = market.derive_unique_randomness(
        &vrf_value,
        &market_key,
        &ctx.accounts.caller.key(),
        clock.slot,
    );
    
    // Convert to 0-100000000 range
    let normalized_random = crate::states::Market::get_unique_random_u64(&unique_randomness, 100_000_001);

    msg!("Unique randomness check:");
    msg!("  VRF value (first 8 bytes): {:?}", &vrf_value[0..8]);
    msg!("  Trade nonce: {}", nonce);
    msg!("  Derived random: {}", normalized_random);
    msg!("  Threshold: {}", params.settlement_threshold);

    // Determine if termination is triggered
    let was_terminated = normalized_random < params.settlement_threshold;

    // ============================================
    // ALWAYS emit TerminationCheckResult event
    // ============================================
    // 
    // This event is crucial for frontend to parse the actual result.
    // Frontend should NOT use Math.random() to simulate - parse this event!
    emit!(TerminationCheckResult {
        market: market.key(),
        user: ctx.accounts.caller.key(),
        trade_nonce: nonce,
        random_value: normalized_random,
        threshold: params.settlement_threshold,
        was_terminated,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });

    // Check if termination is triggered
    if was_terminated {
        // Trigger market termination
        // Use last trade price as final price
        
        msg!(
            "🎯 Market termination triggered! Final prices - YES: {}, NO: {}",
            params.last_trade_yes_price,
            params.last_trade_no_price
        );
        
        // Set market termination state
        market.terminate_market(
            params.last_trade_yes_price,
            params.last_trade_no_price,
            params.last_trade_slot,
        )?;

        // Reload vault account to get fresh balance before setting redeemable amount
        ctx.accounts.market_usdc_vault.reload()?;
        
        // Lock total redeemable USDC for redemption tracking
        market.total_redeemable_usdc = ctx.accounts.market_usdc_vault.amount;
        market.total_redeemed_usdc = 0;

        // Pay creator incentive on termination (best-effort)
        if market.creator_incentive_accrued > 0 {
            let accrued = market.creator_incentive_accrued;
            if ctx.accounts.creator_treasury.amount >= accrued {
                let bump = ctx.accounts.global.bump;
                let signer_seeds: &[&[u8]] = &[
                    GLOBAL_SEED.as_bytes(),
                    &[bump],
                ];
                let signer_seeds_array = &[signer_seeds];

                let transfer_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.creator_treasury.to_account_info(),
                        mint: ctx.accounts.usdc_mint.to_account_info(),
                        to: ctx.accounts.creator_usdc_account.to_account_info(),
                        authority: ctx.accounts.global.to_account_info(),
                    },
                    signer_seeds_array,
                );

                let decimals = ctx.accounts.usdc_mint.decimals;
                token_interface::transfer_checked(transfer_ctx, accrued, decimals)?;
                // AUDIT FIX: Reload accounts after CPI to ensure data consistency
                ctx.accounts.creator_treasury.reload()?;
                ctx.accounts.creator_usdc_account.reload()?;
                market.creator_incentive_accrued = 0;
            } else {
                msg!("Creator treasury balance insufficient; skipping creator payout");
            }
        }

        // Determine winning outcome for event (based on last trade)
        // AUDIT FIX: Use specific error type
        let winning_outcome = market.last_trade_outcome
            .ok_or(TerminatorError::MissingLastTradeOutcome)?;

        // Emit settlement event
        let vault_balance = ctx.accounts.market_usdc_vault.amount;
        emit!(MarketSettled {
            market: market.key(),
            settlement_index: 0, // All markets settle once at index 0
            winning_outcome,
            // AUDIT FIX: Use specific error type
            reference_agent: market.reference_agent
                .ok_or(TerminatorError::MissingReferenceAgent)?,
            vault_balance,
            total_rewards: vault_balance,
            timestamp: clock.unix_timestamp,
        });

        emit!(MarketTerminated {
            market: market.key(),
            reason: 0, // 0 = VRF termination
            final_yes_price: params.last_trade_yes_price,
            final_no_price: params.last_trade_no_price,
            termination_slot: params.last_trade_slot,
            timestamp: clock.unix_timestamp,
        });

        msg!("✅ Market randomly terminated! Users can now redeem positions at final prices");
    } else {
        msg!("📈 Market continues trading (random: {} >= threshold: {})", 
            normalized_random, params.settlement_threshold);
    }

    Ok(())
}

