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

    #[msg("Insufficient outcome tokens")]
    InsufficientOutcomeTokens,

    #[msg("Invalid outcome index")]
    InvalidOutcomeIndex,
    
    // ============================================
    // Manifest CLOB Integration Errors
    // ============================================
    
    #[msg("Invalid Manifest market")]
    InvalidManifestMarket,
    
    #[msg("Manifest CPI call failed")]
    ManifestCpiFailed,
    
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

    #[msg("Instruction is deprecated")]
    DeprecatedInstruction,
    
    // ============================================
    // Random Termination & Redemption Errors
    // ============================================
    
    #[msg("Market has been terminated")]
    MarketTerminated,
    
    #[msg("Market not terminated yet")]
    MarketNotTerminated,
    
    #[msg("Redemption not allowed")]
    RedemptionNotAllowed,
    
    #[msg("Insufficient outcome tokens for redemption")]
    InsufficientOutcomeTokensForRedemption,
    
    // ============================================
    // Fee & Insurance Fund Errors
    // ============================================
    
    #[msg("Invalid fee rate configuration")]
    InvalidFeeConfiguration,
    
    #[msg("Insurance fund insufficient")]
    InsufficientInsuranceFund,
    
    #[msg("ADL (Auto-Deleveraging) triggered")]
    AdlTriggered,
}
