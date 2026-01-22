use anchor_lang::prelude::*;

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub creator: Pubkey,
    pub question: String,
    pub market_id: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct MarketSettled {
    pub market: Pubkey,
    pub settlement_index: u32,
    pub winning_outcome: u8, // 0: YES, 1: NO
    pub reference_agent: Pubkey, // Last trader who determined the outcome
    pub vault_balance: u64,
    pub total_rewards: u64,
    pub timestamp: i64,
}

#[event]
pub struct PositionSplit {
    pub market: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub yes_amount: u64,
    pub no_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct PositionMerged {
    pub market: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub yes_amount: u64,
    pub no_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct CtfTokensRedeemed {
    pub market: Pubkey,
    pub user: Pubkey,
    pub winning_outcome: u8, // 0: YES, 1: NO
    pub token_amount: u64,
    pub reward_amount: u64,
    pub timestamp: i64,
}

// ============================================
// Manifest Orderbook Events
// ============================================

#[event]
pub struct OrderPlaced {
    pub market: Pubkey,
    pub user: Pubkey,
    pub outcome_index: u8,
    pub side: u8, // 0: Bid (buy), 1: Ask (sell)
    pub price: u64,
    pub size: u64,
    pub client_order_id: u64,
    pub timestamp: i64,
}

#[event]
pub struct OrderCancelled {
    pub market: Pubkey,
    pub user: Pubkey,
    pub order_sequence_number: u64,
    pub timestamp: i64,
}

#[event]
pub struct SwapExecuted {
    pub market: Pubkey,
    pub user: Pubkey,
    pub outcome_index: u8,
    pub side: u8, // 0: Bid (buy), 1: Ask (sell)
    pub in_amount: u64,
    pub min_out_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct ManifestMarketCreated {
    pub market: Pubkey,
    pub manifest_market_yes: Pubkey,
    pub manifest_market_no: Pubkey,
    pub outcome_count: u8,
    pub timestamp: i64,
}


// ============================================
// Termination Events
// ============================================

#[event]
pub struct MarketTerminated {
    pub market: Pubkey,
    /// 0 = VRF, 1 = inactivity
    pub reason: u8,
    /// Final YES price (scaled by 10^6)
    pub final_yes_price: u64,
    /// Final NO price (scaled by 10^6)
    pub final_no_price: u64,
    /// Slot when termination was executed
    pub termination_slot: u64,
    /// Timestamp when termination was executed
    pub timestamp: i64,
}

/// VRF termination check result event
/// 
/// Emitted EVERY time a user attempts VRF termination check.
/// Frontend should parse this event to determine if termination was triggered.
/// 
/// Key fields for frontend:
/// - `was_terminated`: true if market was terminated, false if continues trading
/// - `random_value`: the derived unique random value (for verification)
/// - `threshold`: the termination probability threshold
#[event]
pub struct TerminationCheckResult {
    /// Market address
    pub market: Pubkey,
    /// User who triggered the check
    pub user: Pubkey,
    /// Trade nonce at the time of check (ensures uniqueness)
    pub trade_nonce: u64,
    /// The derived unique random value (0 to 100_000_000)
    pub random_value: u64,
    /// Termination threshold (0 to 100_000_000, e.g., 100_000 = 0.1%)
    pub threshold: u64,
    /// Whether termination was triggered (random_value < threshold)
    pub was_terminated: bool,
    /// Slot when check was performed
    pub slot: u64,
    /// Timestamp when check was performed
    pub timestamp: i64,
}

/// VRF fee collection event
/// 
/// Triggered when user opts for termination check
/// Records VRF fee payment for tracking and auditing
#[event]
pub struct VrfFeeCollected {
    /// Market address
    pub market: Pubkey,
    /// User who paid the VRF fee
    pub user: Pubkey,
    /// VRF fee amount (lamports)
    pub fee_amount: u64,
    /// Transaction slot
    pub slot: u64,
}

// ============================================
// Platform Fee Events
// ============================================

/// Trading fee collection event
/// 
/// Triggered when user executes market order (swap) on Manifest
/// Records trading fee based on dynamic fee curve
#[event]
pub struct TradingFeeCollected {
    /// Market address
    pub market: Pubkey,
    /// User who paid the trading fee
    pub user: Pubkey,
    /// Trading fee amount (USDC, scaled by 10^6)
    pub fee_amount: u64,
    /// Fee rate applied (scaled by 10^6, e.g., 32000 = 3.2%)
    pub fee_rate: u32,
    /// Price at execution (scaled by 10^6, e.g., 500000 = 50%)
    pub price: u64,
    /// Transaction slot
    pub slot: u64,
    /// Transaction timestamp
    pub timestamp: i64,
}

/// Market parameters updated (admin)
/// 
/// Note: Fee rates are now managed globally via GlobalFeeRatesUpdated event.
/// This event only tracks per-market parameters like termination probability.
#[event]
pub struct MarketParamsUpdated {
    pub market: Pubkey,
    pub updated_by: Pubkey,
    /// Termination probability (scaled by 10^6, e.g., 1000 = 0.1%)
    pub termination_probability: u32,
    pub updated_at: i64,
}

/// Liquidity reward distribution event
#[event]
pub struct LiquidityRewardDistributed {
    pub recipient: Pubkey,
    pub distributed_by: Pubkey,
    pub amount: u64,
    pub distributed_at: i64,
}

/// Market creation fee collection event
/// 
/// Triggered when creator creates a new market
/// Records 10 USDC market creation fee
#[event]
pub struct MarketCreationFeeCollected {
    /// Market address
    pub market: Pubkey,
    /// Market creator
    pub creator: Pubkey,
    /// Creation fee amount (USDC, scaled by 10^6)
    pub fee_amount: u64,
    /// Transaction slot
    pub slot: u64,
    /// Transaction timestamp
    pub timestamp: i64,
}

// ============================================
// Admin Control Events
// ============================================

/// Market paused event (admin emergency stop)
#[event]
pub struct MarketPaused {
    /// Market address
    pub market: Pubkey,
    /// Admin who paused
    pub paused_by: Pubkey,
    /// Pause timestamp
    pub paused_at: i64,
}

/// Market resumed event (admin re-enable)
#[event]
pub struct MarketResumed {
    /// Market address
    pub market: Pubkey,
    /// Admin who resumed
    pub resumed_by: Pubkey,
    /// Resume timestamp
    pub resumed_at: i64,
}

/// Global fee rates updated event
/// 
/// Emitted when admin updates platform-wide fee configuration.
/// All markets read from Global account, so changes take effect immediately.
#[event]
pub struct GlobalFeeRatesUpdated {
    /// Admin who updated
    pub updated_by: Pubkey,
    /// Center taker fee rate (at 50% probability)
    pub center_taker_fee_rate: u32,
    /// Extreme taker fee rate (at 0%/100% probability)
    pub extreme_taker_fee_rate: u32,
    /// Platform fee share
    pub platform_fee_rate: u32,
    /// Maker rebate rate
    pub maker_rebate_rate: u32,
    /// Creator incentive rate
    pub creator_incentive_rate: u32,
    /// Update timestamp
    pub updated_at: i64,
}

/// Platform fees withdrawn event
#[event]
pub struct PlatformFeesWithdrawn {
    /// Recipient address
    pub recipient: Pubkey,
    /// Withdrawn by admin
    pub withdrawn_by: Pubkey,
    /// Amount withdrawn (USDC lamports)
    pub amount: u64,
    /// Withdrawal timestamp
    pub withdrawn_at: i64,
}

/// Reward fees withdrawn event
#[event]
pub struct RewardFeesWithdrawn {
    /// Recipient address
    pub recipient: Pubkey,
    /// Withdrawn by admin
    pub withdrawn_by: Pubkey,
    /// Amount withdrawn (USDC lamports)
    pub amount: u64,
    /// Withdrawal timestamp
    pub withdrawn_at: i64,
}
