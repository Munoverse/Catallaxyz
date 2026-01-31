use anchor_lang::prelude::*;

#[error_code]
pub enum TerminatorError {
    #[msg("Invalid probability: must be between 0 and 1")]
    InvalidProbability,

    #[msg("Market is not active")]
    MarketNotActive,

    #[msg("Market is already settled")]
    MarketAlreadySettled,

    #[msg("Settlement index mismatch")]
    SettlementIndexMismatch,

    #[msg("Invalid market type")]
    InvalidMarketType,

    // ============================================
    // AUDIT FIX: Specific Market State Errors
    // ============================================
    
    #[msg("Market is paused")]
    MarketPaused,
    
    #[msg("Market is not paused")]
    MarketNotPaused,
    
    #[msg("Missing reference agent")]
    MissingReferenceAgent,
    
    #[msg("Missing last trade outcome")]
    MissingLastTradeOutcome,
    
    #[msg("Invalid USDC mint")]
    InvalidUsdcMint,

    #[msg("Maximum settlements reached")]
    MaxSettlementsReached,

    #[msg("Invalid Switchboard oracle")]
    InvalidSwitchboardOracle,

    #[msg("Switchboard oracle update required")]
    SwitchboardUpdateRequired,

    #[msg("Insufficient balance")]
    InsufficientBalance,

    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Invalid liquidity parameter")]
    InvalidLiquidityParameter,

    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,

    #[msg("Invalid fee rate")]
    InvalidFeeRate,

    #[msg("Pool not active")]
    PoolNotActive,

    #[msg("Invalid market")]
    InvalidMarket,

    #[msg("Invalid token mint")]
    InvalidTokenMint,

    #[msg("Invalid outcome")]
    InvalidOutcome,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("Slippage exceeded")]
    SlippageExceeded,

    #[msg("Insufficient reserve")]
    InsufficientReserve,


    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Invalid input")]
    InvalidInput,

    #[msg("Invalid signature")]
    InvalidSignature,

    #[msg("Insufficient vault balance")]
    InsufficientVaultBalance,

    #[msg("Tokens not initialized")]
    TokensNotInitialized,

    #[msg("Invalid outcome count: must be between 2 and 10")]
    InvalidOutcomeCount,

    #[msg("Not a binary market")]
    NotBinaryMarket,

    #[msg("Insufficient outcome positions")]
    InsufficientOutcomeTokens,

    #[msg("Invalid outcome index")]
    InvalidOutcomeIndex,
    
    #[msg("Invalid mint")]
    InvalidMint,
    
    #[msg("Invalid token account owner")]
    InvalidTokenAccountOwner,
    
    #[msg("Invalid account input")]
    InvalidAccountInput,
    
    #[msg("Tokens already initialized")]
    TokensAlreadyInitialized,
    
    #[msg("Mint already initialized")]
    MintAlreadyInitialized,
    
    #[msg("Outcome count mismatch")]
    OutcomeCountMismatch,

    #[msg("No convertible positions")]
    NoConvertiblePositions,

    // ============================================
    // Random Termination & Redemption Errors
    // ============================================
    
    #[msg("Market has been terminated")]
    MarketTerminated,
    
    #[msg("Market not terminated yet")]
    MarketNotTerminated,
    
    #[msg("Redemption not allowed")]
    RedemptionNotAllowed,
    
    #[msg("Insufficient outcome positions for redemption")]
    InsufficientOutcomeTokensForRedemption,
    
    // ============================================
    // Fee Errors
    // ============================================
    
    #[msg("Invalid fee rate configuration")]
    InvalidFeeConfiguration,
    
    // ============================================
    // Account Validation Errors
    // ============================================
    
    #[msg("Invalid global account")]
    InvalidGlobalAccount,
    
    // ============================================
    // Exchange (Polymarket-style) Errors
    // ============================================
    
    #[msg("Trading is paused")]
    TradingPaused,
    
    #[msg("Not an operator")]
    NotOperator,
    
    #[msg("Not an admin")]
    NotAdmin,
    
    #[msg("Maximum operators reached")]
    MaxOperatorsReached,
    
    #[msg("Already an operator")]
    AlreadyOperator,
    
    #[msg("Operator not found")]
    OperatorNotFound,
    
    #[msg("Order expired")]
    OrderExpired,
    
    #[msg("Order not fillable (already filled or cancelled)")]
    OrderNotFillable,
    
    #[msg("Invalid nonce")]
    InvalidNonce,
    
    #[msg("Fee rate too high")]
    FeeTooHigh,
    
    #[msg("Orders not crossing (prices don't match)")]
    NotCrossing,
    
    #[msg("Invalid taker (order restricted to specific taker)")]
    InvalidTaker,
    
    #[msg("Invalid order signer")]
    InvalidOrderSigner,
    
    #[msg("Token ID mismatch")]
    MismatchedTokenIds,
    
    #[msg("Invalid complement tokens")]
    InvalidComplement,
    
    #[msg("Order hash mismatch")]
    OrderHashMismatch,
    
    #[msg("Fill amount exceeds remaining")]
    FillAmountExceedsRemaining,
    
    #[msg("Cannot cancel: not order maker")]
    NotOrderMaker,
    
    #[msg("Order already cancelled or filled")]
    OrderAlreadyCancelledOrFilled,
}
