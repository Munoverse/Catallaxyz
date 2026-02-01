use anchor_lang::prelude::*;

#[error_code]
pub enum TerminatorError {
    // ============================================
    // Market State Errors
    // ============================================
    
    #[msg("Market is not active")]
    MarketNotActive,

    #[msg("Market is already settled")]
    MarketAlreadySettled,
    
    #[msg("Market is paused")]
    MarketPaused,
    
    #[msg("Market is not paused")]
    MarketNotPaused,
    
    #[msg("Invalid market")]
    InvalidMarket,

    // ============================================
    // Input Validation Errors
    // ============================================
    
    #[msg("Invalid probability: must be between 0 and 1")]
    InvalidProbability,
    
    #[msg("Invalid input")]
    InvalidInput,
    
    #[msg("Invalid amount")]
    InvalidAmount,
    
    #[msg("Invalid outcome")]
    InvalidOutcome,

    #[msg("Invalid outcome index")]
    InvalidOutcomeIndex,

    // ============================================
    // Account & Authorization Errors
    // ============================================
    
    #[msg("Unauthorized")]
    Unauthorized,
    
    #[msg("Invalid account input")]
    InvalidAccountInput,
    
    #[msg("Invalid global account")]
    InvalidGlobalAccount,
    
    #[msg("Invalid USDC mint")]
    InvalidUsdcMint,

    #[msg("Invalid token mint")]
    InvalidTokenMint,
    
    #[msg("Invalid token account owner")]
    InvalidTokenAccountOwner,

    // ============================================
    // Balance & Supply Errors
    // ============================================

    #[msg("Insufficient balance")]
    InsufficientBalance,

    #[msg("Insufficient vault balance")]
    InsufficientVaultBalance,

    #[msg("Insufficient outcome positions")]
    InsufficientOutcomeTokens,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    // ============================================
    // Trade Reference Errors
    // ============================================
    
    #[msg("Missing reference agent")]
    MissingReferenceAgent,
    
    #[msg("Missing last trade outcome")]
    MissingLastTradeOutcome,

    // ============================================
    // Switchboard VRF Errors
    // ============================================

    #[msg("Invalid Switchboard oracle")]
    InvalidSwitchboardOracle,

    #[msg("Switchboard oracle update required")]
    SwitchboardUpdateRequired,

    // ============================================
    // Fee Errors
    // ============================================

    #[msg("Invalid fee rate")]
    InvalidFeeRate,
    
    #[msg("Invalid fee rate configuration")]
    InvalidFeeConfiguration,
    
    #[msg("Fee rate too high")]
    FeeTooHigh,

    // ============================================
    // Signature Errors
    // ============================================

    #[msg("Invalid signature")]
    InvalidSignature,

    // ============================================
    // Termination & Redemption Errors
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
    // Exchange (CLOB) Errors
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

    // ============================================
    // Order Errors
    // ============================================
    
    #[msg("Order expired")]
    OrderExpired,
    
    #[msg("Order not fillable (already filled or cancelled)")]
    OrderNotFillable,
    
    #[msg("Invalid nonce")]
    InvalidNonce,
    
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
