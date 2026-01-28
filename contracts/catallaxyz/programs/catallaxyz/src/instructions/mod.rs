pub mod initialize;
pub mod init_treasury;
pub mod init_platform_treasury;
pub mod init_reward_treasury;
pub mod init_creator_treasury;
pub mod distribute_liquidity_reward;

// AUDIT FIX: Shared treasury utilities
pub mod treasury_utils;
pub mod create_market;
pub mod init_market_vault;
pub mod settle_market;
pub mod redeem_single_outcome;
pub mod settle_trade;

pub mod split_position_single; // Split USDC into YES+NO for single question
pub mod merge_position_single; // Merge YES+NO back to USDC for single question

// User balance management (CLOB deposits/withdrawals)
pub mod deposit_usdc;
pub mod withdraw_usdc;

pub mod request_randomness;
pub mod settle_with_randomness;

// Admin instructions
pub mod terminate_if_inactive;
pub mod pause_market;
pub mod resume_market;
pub mod update_fee_rates;
pub mod update_market_params;
pub mod withdraw_platform_fees;
pub mod withdraw_reward_fees;

// Allow ambiguous glob re-exports since each handler is namespaced by its module
// and we call them explicitly in lib.rs (e.g., instructions::initialize::handler)
#[allow(ambiguous_glob_reexports)]
pub use initialize::*;
#[allow(ambiguous_glob_reexports)]
pub use init_treasury::*;
#[allow(ambiguous_glob_reexports)]
pub use init_platform_treasury::*;
#[allow(ambiguous_glob_reexports)]
pub use init_reward_treasury::*;
pub use init_creator_treasury::*;
#[allow(ambiguous_glob_reexports)]
pub use distribute_liquidity_reward::*;
#[allow(ambiguous_glob_reexports)]
pub use create_market::*;
#[allow(ambiguous_glob_reexports)]
pub use init_market_vault::*;
#[allow(ambiguous_glob_reexports)]
pub use settle_market::*;
#[allow(ambiguous_glob_reexports)]
pub use redeem_single_outcome::*;
pub use settle_trade::*;

#[allow(ambiguous_glob_reexports)]
pub use split_position_single::*;
#[allow(ambiguous_glob_reexports)]
pub use merge_position_single::*;

// User balance management exports
#[allow(ambiguous_glob_reexports)]
pub use deposit_usdc::*;
#[allow(ambiguous_glob_reexports)]
pub use withdraw_usdc::*;

#[allow(ambiguous_glob_reexports)]
pub use request_randomness::*;
#[allow(ambiguous_glob_reexports)]
pub use settle_with_randomness::*;

// Admin instructions
#[allow(ambiguous_glob_reexports)]
pub use terminate_if_inactive::*;
#[allow(ambiguous_glob_reexports)]
pub use pause_market::*;
#[allow(ambiguous_glob_reexports)]
pub use resume_market::*;
#[allow(ambiguous_glob_reexports)]
pub use update_fee_rates::*;
#[allow(ambiguous_glob_reexports)]
pub use update_market_params::*;
#[allow(ambiguous_glob_reexports)]
pub use withdraw_platform_fees::*;
#[allow(ambiguous_glob_reexports)]
pub use withdraw_reward_fees::*;