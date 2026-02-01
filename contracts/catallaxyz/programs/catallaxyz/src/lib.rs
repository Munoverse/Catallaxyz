use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod states;
pub mod switchboard_lite;
pub mod utils;

// Import all instruction types (Context structs and params)
// The ambiguous glob re-exports warning is acceptable since each handler
// is namespaced by its module and we call them explicitly
#[allow(ambiguous_glob_reexports)]
use instructions::*;

declare_id!("4Vpqj1dsjLX7cQ3z85Sh3ZUQ1Adz7rdzvMQnbtgx7n9u");

#[program]
pub mod catallaxyz {
    use super::*;

    /// Initialize the global program state
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Initialize the platform treasury for collecting trading and creation fees
    pub fn init_platform_treasury(ctx: Context<InitPlatformTreasury>) -> Result<()> {
        instructions::init_platform_treasury::handler(ctx)
    }

    /// Create a new prediction market
    pub fn create_market(
        ctx: Context<CreateMarket>,
        params: CreateMarketParams,
    ) -> Result<()> {
        instructions::create_market::handler(ctx, params)
    }

    /// Settle the market based on last trade outcome
    pub fn settle_market(ctx: Context<SettleMarket>) -> Result<()> {
        instructions::settle_market::handler(ctx)
    }

    /// Initialize market USDC vault (should be called after market creation)
    pub fn init_market_vault(ctx: Context<InitMarketVault>) -> Result<()> {
        instructions::init_market_vault::handler(ctx)
    }

    // Binary market operations: split/merge USDC <-> YES+NO positions

    /// Redeem single outcome position after settlement or termination
    pub fn redeem_single_outcome(
        ctx: Context<RedeemSingleOutcome>,
        params: RedeemSingleOutcomeParams,
    ) -> Result<()> {
        instructions::redeem_single_outcome::handler(ctx, params)
    }

    /// Request Switchboard randomness for market settlement check
    pub fn request_randomness(ctx: Context<RequestRandomness>) -> Result<()> {
        instructions::request_randomness::handler(ctx)
    }

    /// Check and settle market using Switchboard randomness
    /// Implements random termination mechanism from the paper
    pub fn settle_with_randomness(
        ctx: Context<SettleWithRandomness>,
        params: SettleWithRandomnessParams,
    ) -> Result<()> {
        instructions::settle_with_randomness::handler(ctx, params)
    }

    /// Terminate a market if it has been inactive for >= 7 days.
    /// Keeper or authority only.
    /// Note: Batch termination is handled at the backend level by bundling
    /// multiple terminateIfInactive instructions into a single transaction.
    pub fn terminate_if_inactive(ctx: Context<TerminateIfInactive>) -> Result<()> {
        instructions::terminate_if_inactive::handler(ctx)
    }

    /// Set or update the keeper wallet address.
    /// Authority only.
    pub fn set_keeper(ctx: Context<SetKeeper>, params: SetKeeperParams) -> Result<()> {
        instructions::set_keeper::handler(ctx, params)
    }

    /// Split USDC into YES and NO positions for a SINGLE question
    /// Split 1 USDC into 1 YES + 1 NO position
    pub fn split_position_single(
        ctx: Context<SplitPositionSingle>,
        params: SplitPositionSingleParams,
    ) -> Result<()> {
        instructions::split_position_single::handler(ctx, params)
    }

    /// Merge YES and NO positions back to USDC for a SINGLE question
    /// Merge 1 YES + 1 NO position back into 1 USDC
    pub fn merge_position_single(
        ctx: Context<MergePositionSingle>,
        params: MergePositionSingleParams,
    ) -> Result<()> {
        instructions::merge_position_single::handler(ctx, params)
    }

    // ============================================
    // User Balance Management (CLOB)
    // ============================================

    /// Deposit USDC into the market vault for trading
    /// Creates UserBalance and UserPosition accounts if needed
    pub fn deposit_usdc(ctx: Context<DepositUsdc>, params: DepositUsdcParams) -> Result<()> {
        instructions::deposit_usdc::handler(ctx, params)
    }

    /// Withdraw USDC from the market vault
    /// Returns USDC to user's token account
    pub fn withdraw_usdc(ctx: Context<WithdrawUsdc>, params: WithdrawUsdcParams) -> Result<()> {
        instructions::withdraw_usdc::handler(ctx, params)
    }

    // ============================================
    // Admin Instructions
    // ============================================

    /// Pause a market (admin only - emergency stop)
    /// Disables trading and order placement
    pub fn pause_market(ctx: Context<PauseMarket>) -> Result<()> {
        instructions::pause_market::handler(ctx)
    }

    /// Resume a paused market (admin only)
    /// Re-enables trading and order placement
    pub fn resume_market(ctx: Context<ResumeMarket>) -> Result<()> {
        instructions::resume_market::handler(ctx)
    }

    /// Update market fee rates (admin only)
    /// Adjusts the dynamic fee curve parameters
    pub fn update_fee_rates(
        ctx: Context<UpdateFeeRates>,
        params: UpdateFeeRatesParams,
    ) -> Result<()> {
        instructions::update_fee_rates::handler(ctx, params)
    }

    /// Update market termination probability and maker rebate rate (admin only)
    pub fn update_market_params(
        ctx: Context<UpdateMarketParamsAccounts>,
        params: UpdateMarketParamsInput,
    ) -> Result<()> {
        instructions::update_market_params::handler(ctx, params)
    }

    /// Initialize reward treasury (admin only)
    pub fn init_reward_treasury(ctx: Context<InitRewardTreasury>) -> Result<()> {
        instructions::init_reward_treasury::handler(ctx)
    }

    /// Initialize creator treasury (admin only)
    pub fn init_creator_treasury(ctx: Context<InitCreatorTreasury>) -> Result<()> {
        instructions::init_creator_treasury::handler(ctx)
    }

    /// Distribute liquidity reward to a recipient (admin only)
    pub fn distribute_liquidity_reward(
        ctx: Context<DistributeLiquidityReward>,
        params: DistributeLiquidityRewardParams,
    ) -> Result<()> {
        instructions::distribute_liquidity_reward::handler(ctx, params)
    }

    /// Withdraw platform fees (admin only)
    /// Transfers accumulated fees from platform treasury
    pub fn withdraw_platform_fees(
        ctx: Context<WithdrawPlatformFees>,
        params: WithdrawPlatformFeesParams,
    ) -> Result<()> {
        instructions::withdraw_platform_fees::handler(ctx, params)
    }

    /// Withdraw reward treasury funds (admin only)
    pub fn withdraw_reward_fees(
        ctx: Context<WithdrawRewardFees>,
        params: WithdrawRewardFeesParams,
    ) -> Result<()> {
        instructions::withdraw_reward_fees::handler(ctx, params)
    }

    // ============================================
    // Exchange (Polymarket-style) Instructions
    // ============================================

    /// Fill a single signed order
    /// Operator acts as counterparty
    pub fn fill_order(
        ctx: Context<FillOrder>,
        params: FillOrderParams,
    ) -> Result<()> {
        instructions::fill_order::handler(ctx, params)
    }

    /// Match taker order against multiple maker orders atomically
    /// Supports COMPLEMENTARY, MINT, and MERGE match types
    pub fn match_orders<'info>(
        ctx: Context<'_, '_, 'info, 'info, MatchOrders<'info>>,
        params: MatchOrdersParams,
    ) -> Result<()> {
        instructions::match_orders::handler(ctx, params)
    }

    /// Cancel an order on-chain (maker only)
    pub fn cancel_order(
        ctx: Context<CancelOrder>,
        params: CancelOrderParams,
    ) -> Result<()> {
        instructions::cancel_order::handler(ctx, params)
    }

    /// Increment user nonce to batch-cancel all orders with lower nonce
    pub fn increment_nonce(ctx: Context<IncrementNonce>) -> Result<()> {
        instructions::increment_nonce::handler(ctx)
    }

    /// Add an operator (admin only)
    pub fn add_operator(
        ctx: Context<AddOperator>,
        params: AddOperatorParams,
    ) -> Result<()> {
        instructions::operator_management::handler_add_operator(ctx, params)
    }

    /// Remove an operator (admin only)
    pub fn remove_operator(
        ctx: Context<RemoveOperator>,
        params: RemoveOperatorParams,
    ) -> Result<()> {
        instructions::operator_management::handler_remove_operator(ctx, params)
    }

    /// Pause global trading (admin only)
    pub fn pause_trading(ctx: Context<PauseTrading>) -> Result<()> {
        instructions::global_pause::handler_pause_trading(ctx)
    }

    /// Unpause global trading (admin only)
    pub fn unpause_trading(ctx: Context<UnpauseTrading>) -> Result<()> {
        instructions::global_pause::handler_unpause_trading(ctx)
    }

}