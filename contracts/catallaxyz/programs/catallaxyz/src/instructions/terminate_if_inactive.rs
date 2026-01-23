use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, TokenAccount, TokenInterface, TransferChecked};
use crate::constants::{GLOBAL_SEED, PLATFORM_TREASURY_SEED, CREATOR_TREASURY_SEED, PRICE_SCALE, TERMINATION_EXECUTION_REWARD_USDC};
use crate::errors::TerminatorError;
use crate::events::MarketTerminated;
use crate::states::{global::Global, Market};

/// Terminate a market if it has been inactive for >= 7 days.
///
/// Notes:
/// - Solana programs can't run automatically; this instruction is admin-only and must be
///   called by the global authority (backend/ops) to finalize an inactive market.
/// - Final prices are taken from the market's last observed trade/order price (best-effort).
#[derive(Accounts)]
pub struct TerminateIfInactive<'info> {
    /// Global state (for treasury authority)
    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump
    )]
    pub global: Account<'info, Global>,

    /// Global authority (admin)
    #[account(
        constraint = authority.key() == global.authority @ TerminatorError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = market.is_active() @ TerminatorError::MarketNotActive,
    )]
    pub market: Account<'info, Market>,

    /// Market USDC vault (backing YES/NO positions)
    #[account(
        mut,
        seeds = [b"market_vault", market.key().as_ref()],
        bump,
        constraint = market_usdc_vault.mint == global.usdc_mint @ TerminatorError::InvalidTokenMint,
        constraint = market_usdc_vault.owner == market.key() @ TerminatorError::Unauthorized
    )]
    pub market_usdc_vault: InterfaceAccount<'info, TokenAccount>,

    /// Platform treasury (USDC) - used to reimburse termination execution
    #[account(
        mut,
        seeds = [PLATFORM_TREASURY_SEED.as_bytes()],
        bump = global.platform_treasury_bump
    )]
    pub platform_treasury: InterfaceAccount<'info, TokenAccount>,

    /// Creator treasury (holds creator incentives)
    #[account(
        mut,
        seeds = [CREATOR_TREASURY_SEED.as_bytes()],
        bump
    )]
    pub creator_treasury: InterfaceAccount<'info, TokenAccount>,

    /// Creator USDC account (receives incentive payout)
    #[account(
        mut,
        constraint = creator_usdc_account.owner == market.creator @ TerminatorError::InvalidTokenAccountOwner,
        constraint = creator_usdc_account.mint == global.usdc_mint @ TerminatorError::InvalidMint
    )]
    pub creator_usdc_account: InterfaceAccount<'info, TokenAccount>,

    /// Admin USDC token account (receives reward)
    #[account(
        mut,
        constraint = caller_usdc_account.owner == authority.key(),
        constraint = caller_usdc_account.mint == global.usdc_mint
    )]
    pub caller_usdc_account: InterfaceAccount<'info, TokenAccount>,

    /// USDC mint account
    pub usdc_mint: InterfaceAccount<'info, token_interface::Mint>,

    pub token_program: Interface<'info, TokenInterface>,

}

pub fn handler(ctx: Context<TerminateIfInactive>) -> Result<()> {
    let clock = Clock::get()?;
    
    // Extract the bump early to avoid borrow conflicts
    let global_bump = ctx.accounts.global.bump;
    
    // Get account infos before mutable borrows
    let global_info = ctx.accounts.global.to_account_info();
    let platform_treasury_info = ctx.accounts.platform_treasury.to_account_info();
    let creator_treasury_info = ctx.accounts.creator_treasury.to_account_info();
    let caller_usdc_info = ctx.accounts.caller_usdc_account.to_account_info();
    let creator_usdc_info = ctx.accounts.creator_usdc_account.to_account_info();
    let usdc_mint_info = ctx.accounts.usdc_mint.to_account_info();
    let token_program_info = ctx.accounts.token_program.to_account_info();
    let usdc_decimals = ctx.accounts.usdc_mint.decimals;
    let treasury_balance = ctx.accounts.platform_treasury.amount;
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

    // Reimburse caller for termination execution from platform treasury (USDC)
    if TERMINATION_EXECUTION_REWARD_USDC > 0 {
        if treasury_balance < TERMINATION_EXECUTION_REWARD_USDC {
            msg!("Platform treasury balance insufficient; skipping termination reward");
        } else {
            let signer_seeds: &[&[u8]] = &[
                GLOBAL_SEED.as_bytes(),
                &[global_bump],
            ];
            let signer_seeds_array = &[signer_seeds];

            let cpi_accounts = TransferChecked {
                from: platform_treasury_info.clone(),
                to: caller_usdc_info,
                mint: usdc_mint_info.clone(),
                authority: global_info.clone(),
            };

            let cpi_ctx = CpiContext::new_with_signer(
                token_program_info.clone(),
                cpi_accounts,
                signer_seeds_array,
            );

            token_interface::transfer_checked(
                cpi_ctx,
                TERMINATION_EXECUTION_REWARD_USDC,
                usdc_decimals,
            )?;
        }
    }

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

