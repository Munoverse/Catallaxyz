use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, Mint, TokenAccount, TokenInterface, TransferChecked};
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_ID,
};
use core::str::FromStr;
use crate::constants::{CREATOR_TREASURY_SEED, GLOBAL_SEED, MARKET_SEED, PLATFORM_TREASURY_SEED};
use crate::errors::TerminatorError;
use crate::events::TradingFeeCollected;
use crate::states::{global::Global, market::Market, UserBalance, UserPosition};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct FillInput {
    pub maker: Pubkey,
    pub taker: Pubkey,
    pub outcome_type: u8, // 0 = YES, 1 = NO
    pub side: u8, // 0 = BUY, 1 = SELL (taker side)
    pub size: u64, // outcome position size (1e6)
    pub price: u64, // price in 1e6
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SettleTradeParams {
    pub fill: FillInput,
    pub nonce: u64,
    pub signature: [u8; 64],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SettleTradeMessage {
    pub market: Pubkey,
    pub nonce: u64,
    pub fill: FillInput,
}

#[derive(Accounts)]
pub struct SettleTrade<'info> {
    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump
    )]
    pub global: Box<Account<'info, Global>>,

    #[account(
        mut,
        seeds = [
            MARKET_SEED.as_bytes(),
            market.creator.as_ref(),
            market.market_id.as_ref(),
        ],
        bump = market.bump,
        constraint = market.global == global.key() @ TerminatorError::InvalidAccountInput,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [b"user_balance", market.key().as_ref(), maker.key().as_ref()],
        bump = maker_balance.bump
    )]
    pub maker_balance: Box<Account<'info, UserBalance>>,

    #[account(
        mut,
        seeds = [b"user_balance", market.key().as_ref(), taker.key().as_ref()],
        bump = taker_balance.bump
    )]
    pub taker_balance: Box<Account<'info, UserBalance>>,

    #[account(
        mut,
        seeds = [b"user_position", market.key().as_ref(), maker.key().as_ref()],
        bump = maker_position.bump
    )]
    pub maker_position: Box<Account<'info, UserPosition>>,

    #[account(
        mut,
        seeds = [b"user_position", market.key().as_ref(), taker.key().as_ref()],
        bump = taker_position.bump
    )]
    pub taker_position: Box<Account<'info, UserPosition>>,

    /// CHECK: maker wallet
    pub maker: UncheckedAccount<'info>,
    /// CHECK: taker wallet
    pub taker: UncheckedAccount<'info>,

    /// Market USDC vault (backs balances & positions)
    #[account(
        mut,
        seeds = [b"market_vault", market.key().as_ref()],
        bump,
        constraint = market_usdc_vault.mint == global.usdc_mint @ TerminatorError::InvalidTokenMint,
        constraint = market_usdc_vault.owner == market.key() @ TerminatorError::Unauthorized
    )]
    pub market_usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Platform treasury (collects platform fee share)
    #[account(
        mut,
        seeds = [PLATFORM_TREASURY_SEED.as_bytes()],
        bump = global.platform_treasury_bump
    )]
    pub platform_treasury: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Creator treasury (collects creator incentives)
    #[account(
        mut,
        seeds = [CREATOR_TREASURY_SEED.as_bytes()],
        bump,
        constraint = creator_treasury.owner == global.key() @ TerminatorError::InvalidTokenAccountOwner
    )]
    pub creator_treasury: Box<InterfaceAccount<'info, TokenAccount>>,

    /// USDC mint
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: instructions sysvar used for ed25519 verification
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: AccountInfo<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

fn read_u16(data: &[u8], offset: &mut usize) -> Result<u16> {
    let end = offset.saturating_add(2);
    require!(end <= data.len(), TerminatorError::InvalidSignature);
    let value = u16::from_le_bytes([data[*offset], data[*offset + 1]]);
    *offset = end;
    Ok(value)
}

fn verify_ed25519_ix(
    instructions: &AccountInfo,
    expected_pubkey: &Pubkey,
    expected_msg: &[u8],
    expected_sig: &[u8; 64],
) -> Result<()> {
    let current_index = load_current_index_checked(instructions)?;
    require!(current_index > 0, TerminatorError::InvalidSignature);

    let ed25519_ix = load_instruction_at_checked((current_index - 1) as usize, instructions)?;
    let ed25519_program_id =
        Pubkey::from_str("Ed25519SigVerify111111111111111111111111111")
            .map_err(|_| TerminatorError::InvalidSignature)?;
    require!(
        ed25519_ix.program_id == ed25519_program_id,
        TerminatorError::InvalidSignature
    );

    let data = ed25519_ix.data.as_slice();
    require!(data.len() >= 2, TerminatorError::InvalidSignature);
    let num_signatures = data[0];
    require!(num_signatures == 1, TerminatorError::InvalidSignature);

    let mut offset = 2; // skip num_signatures + padding
    let sig_offset = read_u16(data, &mut offset)?;
    let sig_ix_index = read_u16(data, &mut offset)?;
    let pubkey_offset = read_u16(data, &mut offset)?;
    let pubkey_ix_index = read_u16(data, &mut offset)?;
    let msg_offset = read_u16(data, &mut offset)?;
    let msg_size = read_u16(data, &mut offset)?;
    let msg_ix_index = read_u16(data, &mut offset)?;

    const INSTRUCTION_DATA_INDEX: u16 = u16::MAX;
    require!(
        sig_ix_index == INSTRUCTION_DATA_INDEX
            && pubkey_ix_index == INSTRUCTION_DATA_INDEX
            && msg_ix_index == INSTRUCTION_DATA_INDEX,
        TerminatorError::InvalidSignature
    );

    let sig_start = sig_offset as usize;
    let sig_end = sig_start.saturating_add(64);
    let pk_start = pubkey_offset as usize;
    let pk_end = pk_start.saturating_add(32);
    let msg_start = msg_offset as usize;
    let msg_end = msg_start.saturating_add(msg_size as usize);

    require!(
        sig_end <= data.len() && pk_end <= data.len() && msg_end <= data.len(),
        TerminatorError::InvalidSignature
    );
    require!(msg_size as usize == expected_msg.len(), TerminatorError::InvalidSignature);
    require!(
        data[sig_start..sig_end] == expected_sig[..],
        TerminatorError::InvalidSignature
    );
    require!(
        data[pk_start..pk_end] == expected_pubkey.to_bytes(),
        TerminatorError::InvalidSignature
    );
    require!(
        &data[msg_start..msg_end] == expected_msg,
        TerminatorError::InvalidSignature
    );

    Ok(())
}

pub fn handler(ctx: Context<SettleTrade>, params: SettleTradeParams) -> Result<()> {
    let fill = params.fill;
    let market = &ctx.accounts.market;

    // ============================================
    // SECURITY FIX: Check market status before settling trades
    // Ensures no trades are settled when market is paused or terminated
    // ============================================
    require!(
        market.can_trade(),
        TerminatorError::MarketNotActive
    );

    require!(
        fill.maker == ctx.accounts.maker.key(),
        TerminatorError::InvalidAccountInput
    );
    require!(
        fill.taker == ctx.accounts.taker.key(),
        TerminatorError::InvalidAccountInput
    );

    require!(ctx.accounts.maker_balance.user == ctx.accounts.maker.key(), TerminatorError::Unauthorized);
    require!(ctx.accounts.taker_balance.user == ctx.accounts.taker.key(), TerminatorError::Unauthorized);
    require!(ctx.accounts.maker_position.user == ctx.accounts.maker.key(), TerminatorError::Unauthorized);
    require!(ctx.accounts.taker_position.user == ctx.accounts.taker.key(), TerminatorError::Unauthorized);

    require!(fill.size > 0, TerminatorError::InvalidAmount);
    crate::utils::validate_price(fill.price)?;
    require!(fill.outcome_type <= 1, TerminatorError::InvalidOutcome);
    require!(fill.side <= 1, TerminatorError::InvalidInput);

    // Prevent signature replay by enforcing sequential nonce
    // AUDIT FIX v1.1.0: Use checked_add instead of saturating_add for safety
    let expected_nonce = market.settle_trade_nonce
        .checked_add(1)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    require!(params.nonce == expected_nonce, TerminatorError::InvalidInput);

    // Verify signature via ed25519 program instruction
    let payload = SettleTradeMessage {
        market: market.key(),
        nonce: params.nonce,
        fill: fill.clone(),
    }
    .try_to_vec()
    .map_err(|_| TerminatorError::InvalidInput)?;
    verify_ed25519_ix(
        &ctx.accounts.instructions,
        &ctx.accounts.global.settlement_signer,
        &payload,
        &params.signature,
    )?;

    use crate::utils::scale_by_rate;

    let total_cost = scale_by_rate(fill.size, fill.price as u32)?;

    let global = &mut ctx.accounts.global;
    let maker_balance = &mut ctx.accounts.maker_balance;
    let taker_balance = &mut ctx.accounts.taker_balance;
    let maker_position = &mut ctx.accounts.maker_position;
    let taker_position = &mut ctx.accounts.taker_position;
    let market = &mut ctx.accounts.market;

    // Calculate dynamic taker fee from Global account
    let taker_fee_rate = global.calculate_taker_fee_rate(fill.price);
    let taker_fee = scale_by_rate(total_cost, taker_fee_rate)?;

    // AUDIT FIX v1.2.6: Validate fee distribution rates sum to 1_000_000 (100%)
    // This ensures no funds are lost or created during fee distribution
    let fee_rate_sum = global.platform_fee_rate
        .checked_add(global.maker_rebate_rate)
        .and_then(|sum| sum.checked_add(global.creator_incentive_rate))
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    require!(fee_rate_sum == 1_000_000, TerminatorError::InvalidFeeConfiguration);

    // Calculate fee distribution from Global rates
    let platform_fee = scale_by_rate(taker_fee, global.platform_fee_rate)?;
    let maker_rebate = scale_by_rate(taker_fee, global.maker_rebate_rate)?;
    let creator_incentive = scale_by_rate(taker_fee, global.creator_incentive_rate)?;

    // AUDIT FIX v2.1 (CRIT-8): Verify maker_rebate calculation is correct
    // Ensure the sum of all fee components equals the total taker_fee
    let fee_components_sum = platform_fee
        .checked_add(maker_rebate)
        .and_then(|sum| sum.checked_add(creator_incentive))
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    // Allow for rounding differences of up to 3 lamports (one per component)
    require!(
        fee_components_sum <= taker_fee && taker_fee.saturating_sub(fee_components_sum) <= 3,
        TerminatorError::InvalidFeeConfiguration
    );

    // 0 = BUY, 1 = SELL (taker side)
    if fill.side == 0 {
        // taker buys, maker sells
        // Taker pays: total_cost + taker_fee
        let total_taker_cost = total_cost
            .checked_add(taker_fee)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
        require!(taker_balance.usdc_balance >= total_taker_cost, TerminatorError::InsufficientBalance);
        
        if fill.outcome_type == 0 {
            require!(maker_position.yes_balance >= fill.size, TerminatorError::InsufficientOutcomeTokens);
        } else {
            require!(maker_position.no_balance >= fill.size, TerminatorError::InsufficientOutcomeTokens);
        }
        
        // Taker pays total cost + fee
        taker_balance.usdc_balance = taker_balance.usdc_balance
            .checked_sub(total_taker_cost)
            .ok_or(TerminatorError::InsufficientBalance)?;
        // Maker receives total cost + maker rebate
        maker_balance.usdc_balance = maker_balance.usdc_balance
            .checked_add(total_cost)
            .and_then(|value| value.checked_add(maker_rebate))
            .ok_or(TerminatorError::ArithmeticOverflow)?;

        if fill.outcome_type == 0 {
            taker_position.yes_balance = taker_position.yes_balance
                .checked_add(fill.size)
                .ok_or(TerminatorError::ArithmeticOverflow)?;
            maker_position.yes_balance = maker_position.yes_balance
                .checked_sub(fill.size)
                .ok_or(TerminatorError::InsufficientOutcomeTokens)?;
        } else {
            taker_position.no_balance = taker_position.no_balance
                .checked_add(fill.size)
                .ok_or(TerminatorError::ArithmeticOverflow)?;
            maker_position.no_balance = maker_position.no_balance
                .checked_sub(fill.size)
                .ok_or(TerminatorError::InsufficientOutcomeTokens)?;
        }
    } else {
        // taker sells, maker buys
        // AUDIT FIX v1.2.6: Verify maker_rebate doesn't exceed total_cost to prevent underflow
        require!(maker_rebate <= total_cost, TerminatorError::InvalidFeeConfiguration);
        
        // Maker receives rebate as a cost reduction
        let maker_cost = total_cost
            .checked_sub(maker_rebate)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
        require!(maker_balance.usdc_balance >= maker_cost, TerminatorError::InsufficientBalance);
        
        if fill.outcome_type == 0 {
            require!(taker_position.yes_balance >= fill.size, TerminatorError::InsufficientOutcomeTokens);
        } else {
            require!(taker_position.no_balance >= fill.size, TerminatorError::InsufficientOutcomeTokens);
        }
        
        // Maker pays net cost (after rebate)
        maker_balance.usdc_balance = maker_balance.usdc_balance
            .checked_sub(maker_cost)
            .ok_or(TerminatorError::InsufficientBalance)?;
        // Taker receives total cost minus taker fee
        let taker_receives = total_cost
            .checked_sub(taker_fee)
            .ok_or(TerminatorError::ArithmeticOverflow)?;
        taker_balance.usdc_balance = taker_balance.usdc_balance
            .checked_add(taker_receives)
            .ok_or(TerminatorError::ArithmeticOverflow)?;

        if fill.outcome_type == 0 {
            taker_position.yes_balance = taker_position.yes_balance
                .checked_sub(fill.size)
                .ok_or(TerminatorError::InsufficientOutcomeTokens)?;
            maker_position.yes_balance = maker_position.yes_balance
                .checked_add(fill.size)
                .ok_or(TerminatorError::ArithmeticOverflow)?;
        } else {
            taker_position.no_balance = taker_position.no_balance
                .checked_sub(fill.size)
                .ok_or(TerminatorError::InsufficientOutcomeTokens)?;
            maker_position.no_balance = maker_position.no_balance
                .checked_add(fill.size)
                .ok_or(TerminatorError::ArithmeticOverflow)?;
        }
    }

    // Track fees in global state (use checked_add for accurate accounting)
    global.total_trading_fees_collected = global.total_trading_fees_collected
        .checked_add(platform_fee)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    
    // Accrue creator incentive on market
    market.creator_incentive_accrued = market.creator_incentive_accrued
        .checked_add(creator_incentive)
        .ok_or(TerminatorError::ArithmeticOverflow)?;

    // Advance settlement nonce after successful checks
    market.settle_trade_nonce = params.nonce;

    // Transfer fee proceeds from market vault to treasuries
    let fee_total = platform_fee
        .checked_add(creator_incentive)
        .ok_or(TerminatorError::ArithmeticOverflow)?;
    if fee_total > 0 {
        require!(
            ctx.accounts.market_usdc_vault.amount >= fee_total,
            TerminatorError::InsufficientVaultBalance
        );

        let market_seeds = &[
            MARKET_SEED.as_bytes(),
            market.creator.as_ref(),
            market.market_id.as_ref(),
            &[market.bump],
        ];
        let signer_seeds = &[&market_seeds[..]];

        if platform_fee > 0 {
            let transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.market_usdc_vault.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.platform_treasury.to_account_info(),
                    authority: market.to_account_info(),
                },
                signer_seeds,
            );
            token_interface::transfer_checked(transfer_ctx, platform_fee, 6)?;
            // AUDIT FIX: Reload account after CPI to ensure data consistency
            ctx.accounts.market_usdc_vault.reload()?;
            ctx.accounts.platform_treasury.reload()?;
        }

        if creator_incentive > 0 {
            let transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.market_usdc_vault.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.creator_treasury.to_account_info(),
                    authority: market.to_account_info(),
                },
                signer_seeds,
            );
            token_interface::transfer_checked(transfer_ctx, creator_incentive, 6)?;
            // AUDIT FIX: Reload account after CPI to ensure data consistency
            ctx.accounts.market_usdc_vault.reload()?;
            ctx.accounts.creator_treasury.reload()?;
        }
    }

    let clock = Clock::get()?;
    market.record_activity(clock.unix_timestamp, clock.slot);
    market.record_binary_last_price(fill.outcome_type, fill.price)?;
    
    // Set fields required for market settlement
    // These are needed by settle_market instruction
    market.last_trade_outcome = Some(fill.outcome_type);
    market.reference_agent = Some(fill.taker);
    // AUDIT FIX v1.2.0: Use checked_add for arithmetic safety
    market.total_trades = market.total_trades
        .checked_add(1)
        .ok_or(TerminatorError::ArithmeticOverflow)?;

    // Post-trade invariants (supply/collateral should stay consistent)
    require!(
        market.total_yes_supply == market.total_no_supply,
        TerminatorError::InvalidInput
    );
    require!(
        market.total_position_collateral == market.total_yes_supply,
        TerminatorError::InvalidInput
    );

    // Emit fee collection event
    // AUDIT FIX v1.2.5: Added maker, taker, outcome_type, side, size fields
    if taker_fee > 0 {
        emit!(TradingFeeCollected {
            market: market.key(),
            maker: fill.maker,
            taker: fill.taker,
            user: ctx.accounts.taker.key(),
            outcome_type: fill.outcome_type,
            side: fill.side,
            size: fill.size,
            fee_amount: taker_fee,
            fee_rate: taker_fee_rate,
            price: fill.price,
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
        });
    }

    msg!("Trade settled: {} tokens at price {}", fill.size, fill.price);
    msg!("Taker fee: {} (rate: {}%)", taker_fee, taker_fee_rate as f64 / 10_000.0);

    Ok(())
}
