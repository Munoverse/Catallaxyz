use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, TokenAccount, TokenInterface, TransferChecked};
use crate::constants::{GLOBAL_SEED, OUTCOME_YES, OUTCOME_NO, CREATOR_TREASURY_SEED};
use crate::errors::TerminatorError;
use crate::events::MarketSettled;
use crate::states::{global::Global, market::Market};

/// Settle market based on last trade outcome
/// Winning positions can be redeemed 1:1 for USDC
/// Losing positions become worthless
#[derive(Accounts)]
pub struct SettleMarket<'info> {
    #[account(
        mut,
        constraint = authority.key() == global.authority @ TerminatorError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump
    )]
    pub global: Box<Account<'info, Global>>,

    #[account(
        mut,
        constraint = market.is_active() @ TerminatorError::MarketAlreadySettled,
        // AUDIT FIX: Use specific error types
        constraint = market.reference_agent.is_some() @ TerminatorError::MissingReferenceAgent,
        constraint = market.last_trade_outcome.is_some() @ TerminatorError::MissingLastTradeOutcome
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        // AUDIT FIX: Use specific error type for USDC mint validation
        constraint = market_usdc_vault.mint == global.usdc_mint @ TerminatorError::InvalidUsdcMint,
        constraint = market_usdc_vault.owner == market.key() @ TerminatorError::Unauthorized
    )]
    pub market_usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,

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
    pub usdc_mint: InterfaceAccount<'info, token_interface::Mint>,

    /// CHECK: Switchboard oracle account (for verification, but outcome is determined by last trade)
    pub switchboard_oracle: UncheckedAccount<'info>,

    /// CHECK: Switchboard program
    pub switchboard_program: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SettleMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    // Determine outcome based on last trade
    // If reference agent sold NO (outcome = OUTCOME_NO), then YES wins
    // If reference agent sold YES (outcome = OUTCOME_YES), then NO wins
    // AUDIT FIX: Use specific error type
    let last_trade_outcome = market.last_trade_outcome
        .ok_or(TerminatorError::MissingLastTradeOutcome)?;
    let winning_outcome = if last_trade_outcome == OUTCOME_NO {
        OUTCOME_YES // Reference agent sold NO, so YES wins
    } else {
        OUTCOME_NO // Reference agent sold YES, so NO wins
    };

    // Get vault balance for reward distribution
    let vault_balance = ctx.accounts.market_usdc_vault.amount;

    // Vault/position invariant checks (pre-settlement)
    require!(
        market.total_yes_supply == market.total_no_supply,
        TerminatorError::InvalidInput
    );
    require!(
        market.total_position_collateral == market.total_yes_supply,
        TerminatorError::InvalidInput
    );
    require!(
        vault_balance == market.total_position_collateral,
        TerminatorError::InsufficientVaultBalance
    );

    // Set final prices based on last observed trade prices (fallback to 0.5)
    let (yes_price, no_price) = crate::utils::derive_final_prices(
        market.last_trade_yes_price,
        market.last_trade_no_price,
    );
    market.final_yes_price = Some(yes_price);
    market.final_no_price = Some(no_price);
    market.can_redeem = true;

    // AUDIT FIX v1.2.2: Use method instead of direct assignment
    // Mark market as settled (status change from Active to Settled)
    market.set_settled();
    market.total_redeemable_usdc = vault_balance;
    market.total_redeemed_usdc = 0;

    // Pay creator incentive on settlement (best-effort)
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

            token_interface::transfer_checked(transfer_ctx, accrued, 6)?;
            // AUDIT FIX: Reload accounts after CPI to ensure data consistency
            ctx.accounts.creator_treasury.reload()?;
            ctx.accounts.creator_usdc_account.reload()?;
            market.creator_incentive_accrued = 0;
        } else {
            msg!("Creator treasury balance insufficient; skipping creator payout");
        }
    }

    // Note: Actual reward distribution to position holders is handled by redemption.
    // When market is settled:
    // - All open orders should be cancelled
    // - Positions are redeemed at final prices via redeem_single_outcome

    emit!(MarketSettled {
        market: market.key(),
        settlement_index: 0, // All markets settle once at index 0
        winning_outcome,
        // AUDIT FIX: Use specific error type
        reference_agent: market.reference_agent
            .ok_or(TerminatorError::MissingReferenceAgent)?,
        vault_balance,
        total_rewards: vault_balance, // All vault balance goes to winners
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
