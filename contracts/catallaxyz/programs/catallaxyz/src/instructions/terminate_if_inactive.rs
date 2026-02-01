use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, TokenAccount, TokenInterface, TransferChecked};
use crate::constants::{GLOBAL_SEED, CREATOR_TREASURY_SEED, PRICE_SCALE};
use crate::errors::TerminatorError;
use crate::events::MarketTerminated;
use crate::states::{global::Global, Market};

/// Terminate a market if it has been inactive for >= 7 days.
///
/// Notes:
/// - Solana programs can't run automatically; this instruction must be called by
///   the global authority or designated keeper to finalize an inactive market.
/// - Final prices are taken from the market's last observed trade/order price (best-effort).
/// - No execution reward is paid; this is an automated keeper task.
#[derive(Accounts)]
pub struct TerminateIfInactive<'info> {
    /// Global state (for keeper/authority check)
    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump
    )]
    pub global: Box<Account<'info, Global>>,

    /// Keeper or authority (either can call this instruction)
    #[account(
        constraint = global.is_keeper(&caller.key()) @ TerminatorError::Unauthorized
    )]
    pub caller: Signer<'info>,

    #[account(
        mut,
        constraint = market.is_active() @ TerminatorError::MarketNotActive,
    )]
    pub market: Box<Account<'info, Market>>,

    /// Market USDC vault (backing YES/NO positions)
    #[account(
        mut,
        seeds = [b"market_vault", market.key().as_ref()],
        bump,
        constraint = market_usdc_vault.mint == global.usdc_mint @ TerminatorError::InvalidTokenMint,
        constraint = market_usdc_vault.owner == market.key() @ TerminatorError::Unauthorized
    )]
    pub market_usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Creator treasury (holds creator incentives)
    #[account(
        mut,
        seeds = [CREATOR_TREASURY_SEED.as_bytes()],
        bump
    )]
    pub creator_treasury: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Creator USDC account (receives incentive payout)
    #[account(
        mut,
        constraint = creator_usdc_account.owner == market.creator @ TerminatorError::InvalidTokenAccountOwner,
        constraint = creator_usdc_account.mint == global.usdc_mint @ TerminatorError::InvalidTokenMint
    )]
    pub creator_usdc_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// USDC mint account
    pub usdc_mint: Box<InterfaceAccount<'info, token_interface::Mint>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<TerminateIfInactive>) -> Result<()> {
    let clock = Clock::get()?;
    
    // Extract the bump early to avoid borrow conflicts
    let global_bump = ctx.accounts.global.bump;
    
    // Get account infos before mutable borrows
    let global_info = ctx.accounts.global.to_account_info();
    let creator_treasury_info = ctx.accounts.creator_treasury.to_account_info();
    let creator_usdc_info = ctx.accounts.creator_usdc_account.to_account_info();
    let usdc_mint_info = ctx.accounts.usdc_mint.to_account_info();
    let token_program_info = ctx.accounts.token_program.to_account_info();
    let usdc_decimals = ctx.accounts.usdc_mint.decimals;
    let vault_balance = ctx.accounts.market_usdc_vault.amount;
    let creator_treasury_balance = ctx.accounts.creator_treasury.amount;
    
    let market = &mut ctx.accounts.market;

    let terminated = market.terminate_if_inactive(clock.unix_timestamp, clock.slot)?;
    if !terminated {
        return Ok(());
    }

    // Vault/position invariant checks (post-termination)
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

    // Lock total redeemable USDC for redemption tracking
    market.total_redeemable_usdc = vault_balance;
    market.total_redeemed_usdc = 0;

    let yes_price = market.final_yes_price.unwrap_or(PRICE_SCALE / 2);
    let no_price = market.final_no_price.unwrap_or(PRICE_SCALE / 2);
    let creator_accrued = market.creator_incentive_accrued;

    // Pay creator incentive on termination (best-effort)
    if creator_accrued > 0 {
        if creator_treasury_balance >= creator_accrued {
            let signer_seeds: &[&[u8]] = &[
                GLOBAL_SEED.as_bytes(),
                &[global_bump],
            ];
            let signer_seeds_array = &[signer_seeds];

            let cpi_accounts = TransferChecked {
                from: creator_treasury_info,
                to: creator_usdc_info,
                mint: usdc_mint_info,
                authority: global_info,
            };

            let cpi_ctx = CpiContext::new_with_signer(
                token_program_info,
                cpi_accounts,
                signer_seeds_array,
            );

            token_interface::transfer_checked(
                cpi_ctx,
                creator_accrued,
                usdc_decimals,
            )?;
            // AUDIT FIX: Reload accounts after CPI to ensure data consistency
            ctx.accounts.creator_treasury.reload()?;
            ctx.accounts.creator_usdc_account.reload()?;
            market.creator_incentive_accrued = 0;
        } else {
            msg!("Creator treasury balance insufficient; skipping creator payout");
        }
    }

    emit!(MarketTerminated {
        market: market.key(),
        reason: 1,
        final_yes_price: yes_price,
        final_no_price: no_price,
        termination_slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
