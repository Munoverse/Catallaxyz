use anchor_lang::prelude::*;

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub creator: Pubkey,
    pub question: String,
    pub description: String,
    pub yes_description: String,
    pub no_description: String,
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
    /// Outcome redeemed (0: YES, 1: NO)
    pub winning_outcome: u8,
    pub token_amount: u64,
    pub reward_amount: u64,
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

// ============================================
// Platform Fee Events
// ============================================

/// Trading fee collection event
/// 
/// Triggered when a trade is settled on-chain
/// Records trading fee based on dynamic fee curve
/// 
/// AUDIT FIX v1.2.5: Added maker, taker, outcome_type, side, size fields
/// for complete trade event tracking needed by off-chain sync
#[event]
pub struct TradingFeeCollected {
    /// Market address
    pub market: Pubkey,
    /// Maker address (liquidity provider)
    pub maker: Pubkey,
    /// Taker address (aggressor)
    pub taker: Pubkey,
    /// User who paid the trading fee (usually taker)
    pub user: Pubkey,
    /// Outcome type: 0 = YES, 1 = NO
    pub outcome_type: u8,
    /// Trade side: 0 = BUY, 1 = SELL
    pub side: u8,
    /// Trade size in lamports
    pub size: u64,
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

// ============================================
// Exchange (Polymarket-style) Events
// ============================================

/// Order filled event (single order fill)
/// 
/// Emitted when an order is partially or fully filled
#[event]
pub struct OrderFilled {
    /// Order hash (32-byte keccak256)
    pub order_hash: [u8; 32],
    /// Maker address (order creator)
    pub maker: Pubkey,
    /// Taker address (order filler / operator)
    pub taker: Pubkey,
    /// Maker asset ID (token_id of asset maker provides)
    pub maker_asset_id: u8,
    /// Taker asset ID (token_id of asset taker provides)
    pub taker_asset_id: u8,
    /// Maker amount filled
    pub maker_amount_filled: u64,
    /// Taker amount filled
    pub taker_amount_filled: u64,
    /// Fee charged (in proceeds token)
    pub fee: u64,
    /// Market address
    pub market: Pubkey,
    /// Transaction slot
    pub slot: u64,
    /// Transaction timestamp
    pub timestamp: i64,
}

/// Order cancelled event
/// 
/// Emitted when an order is cancelled by the maker
#[event]
pub struct OrderCancelled {
    /// Order hash (32-byte keccak256)
    pub order_hash: [u8; 32],
    /// Maker address (order creator who cancelled)
    pub maker: Pubkey,
    /// Market address
    pub market: Pubkey,
    /// Transaction slot
    pub slot: u64,
    /// Transaction timestamp
    pub timestamp: i64,
}

/// Orders matched event
/// 
/// Emitted when a taker order is matched against one or more maker orders
#[event]
pub struct OrdersMatched {
    /// Taker order hash
    pub taker_order_hash: [u8; 32],
    /// Taker address (taker order maker)
    pub taker_maker: Pubkey,
    /// Maker asset ID
    pub maker_asset_id: u8,
    /// Taker asset ID
    pub taker_asset_id: u8,
    /// Total maker amount filled
    pub maker_amount_filled: u64,
    /// Total taker amount filled
    pub taker_amount_filled: u64,
    /// Number of maker orders matched
    pub maker_orders_count: u8,
    /// Market address
    pub market: Pubkey,
    /// Transaction slot
    pub slot: u64,
    /// Transaction timestamp
    pub timestamp: i64,
}

/// User nonce incremented event
/// 
/// Emitted when a user increments their nonce to cancel all pending orders
#[event]
pub struct NonceIncremented {
    /// User address
    pub user: Pubkey,
    /// New nonce value
    pub new_nonce: u64,
    /// Transaction slot
    pub slot: u64,
    /// Transaction timestamp
    pub timestamp: i64,
}

/// Operator added event
#[event]
pub struct OperatorAdded {
    /// New operator address
    pub operator: Pubkey,
    /// Added by admin
    pub added_by: Pubkey,
    /// Timestamp
    pub timestamp: i64,
}

/// Operator removed event
#[event]
pub struct OperatorRemoved {
    /// Removed operator address
    pub operator: Pubkey,
    /// Removed by admin
    pub removed_by: Pubkey,
    /// Timestamp
    pub timestamp: i64,
}

/// Global trading paused event
#[event]
pub struct GlobalTradingPaused {
    /// Admin who paused
    pub paused_by: Pubkey,
    /// Timestamp
    pub timestamp: i64,
}

/// Global trading unpaused event
#[event]
pub struct GlobalTradingUnpaused {
    /// Admin who unpaused
    pub unpaused_by: Pubkey,
    /// Timestamp
    pub timestamp: i64,
}
