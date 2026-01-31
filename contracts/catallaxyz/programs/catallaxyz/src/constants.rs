pub const GLOBAL_SEED: &str = "global";
pub const MARKET_SEED: &str = "market";
pub const PLATFORM_TREASURY_SEED: &str = "platform_treasury"; // Platform treasury (for trading fees & market creation fees)
pub const REWARD_TREASURY_SEED: &str = "reward_treasury"; // Rewards treasury (for liquidity rewards)
pub const CREATOR_TREASURY_SEED: &str = "creator_treasury"; // Creator treasury (for creator incentives)
pub const USDC_DECIMALS: u8 = 6;

// Outcome types
pub const OUTCOME_YES: u8 = 0;
pub const OUTCOME_NO: u8 = 1;

// Binary market constants
// Fixed to 2 outcomes (YES/NO) for simplified implementation
pub const MAX_OUTCOME_TOKENS: usize = 2; // Binary markets always have 2 outcomes (YES and NO)
pub const PRICE_SCALE: u64 = 1_000_000; // Price precision (10^6)

/// Price tolerance for validation (0.01% at 10^6 scale)
pub const PRICE_TOLERANCE: u64 = 100;

// Market metadata limits (bytes, UTF-8)
pub const MAX_QUESTION_LEN: usize = 200;
pub const MAX_DESCRIPTION_LEN: usize = 500;
pub const MAX_OUTCOME_DESCRIPTION_LEN: usize = 200;

// ============================================
// VRF Termination Constants (Updated 2026-01-10 - User opt-in mechanism)
// ============================================

/// Switchboard VRF fee - Only charged when user opts for termination check
/// 
/// New mechanism:
/// - Users can opt-in "check termination" when trading
/// - If opted-in: Pay this VRF fee, frontend calls settle_with_randomness after trade
/// - If not opted-in: No VRF fee, no termination check, saves costs
/// 
/// Benefits:
/// - Users decide whether to pay VRF fee for termination check
/// - Higher flexibility, lower cost for small trades
/// - Removed "every 5 trades" automatic check rule
pub const VRF_FEE_LAMPORTS: u64 = 5_000_000; // 0.005 SOL for Switchboard VRF

// ============================================
// Inactivity Termination (7-day no activity auto-termination)
// ============================================
/// If market has no orders/trades for 7 consecutive days, automatic termination is allowed
/// Termination must be triggered by an instruction call
pub const INACTIVITY_TIMEOUT_SECONDS: i64 = 7 * 24 * 60 * 60; // 7 days

// ============================================
// Termination Probability (VRF random termination probability)
// Note: Fee curve defaults are now in Global state (see global.rs default_fees module)
// ============================================
/// Default termination probability: 0.1%
/// 
/// How it works:
/// 1. User opts-in "check termination" when trading and pays VRF fee
/// 2. After trade completes, frontend calls settle_with_randomness
/// 3. Switchboard VRF generates random number
/// 4. If random < this probability threshold, trigger market termination
/// 5. Market uses last trade price as final settlement price
/// 
/// Probability can be customized when creating market
pub const DEFAULT_TERMINATION_PROBABILITY: u32 = 1_000; // 0.1% (scaled by 10^6)

// ============================================
// Platform Fees
// ============================================
/// Market creation fee: 10 USDC (scaled by 10^6)
/// Charged when creating a new prediction market
/// Collected in platform treasury as protocol revenue
pub const MARKET_CREATION_FEE: u64 = 10_000_000; // 10 USDC (6 decimals)

// ============================================
// Inactivity Termination Reward
// ============================================
/// Reward for executing inactivity termination (paid from platform treasury)
/// Denominated in USDC (6 decimals).
pub const TERMINATION_EXECUTION_REWARD_USDC: u64 = 100_000; // 0.10 USDC
