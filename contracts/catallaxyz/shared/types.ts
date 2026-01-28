// ============================================
// AUDIT FIX v2.1 (HIGH-15): Complete type definitions
// Synced with contract state definitions
// ============================================

export enum MarketStatus {
  Active = 0,
  Settled = 1,
  Paused = 2,     // Added: Missing status
  Cancelled = 3,  // Added: Missing status
  Terminated = 4,
}

export enum Outcome {
  Yes = 0,
  No = 1,
}

export enum TerminationReason {
  Vrf = 0,
  Inactivity = 1,
}

// ============================================
// Market Account Type (synced with contract)
// ============================================

export interface MarketAccount {
  // Basic info
  creator: string;
  marketId: Uint8Array;
  usdcMint: string;
  
  // Status
  status: MarketStatus;
  isPaused: boolean;  // AUDIT FIX: Added missing field
  
  // Position tracking
  totalYesPosition: bigint;
  totalNoPosition: bigint;
  totalPositionCollateral: bigint;
  totalRedeemableUsdc: bigint;
  totalRedeemedUsdc: bigint;
  
  // Settlement info
  settledOutcome: Outcome | null;
  finalYesPrice: number;
  finalNoPrice: number;
  settledAt: number;
  
  // Termination info
  terminationReason: TerminationReason | null;
  
  // Timestamps
  createdAt: number;
  lastTradeAt: number;
  lastPriceUpdateAt: number;
  
  // Nonce tracking (AUDIT FIX: Added missing fields)
  settleTradeNonce: bigint;  // For settle_trade instruction
  tradeNonce: bigint;        // For randomness check
  
  // Fee configuration
  terminationProbability: number;
  
  // PDA bump
  bump: number;
}

// ============================================
// User Position Type
// ============================================

export interface UserPosition {
  user: string;
  market: string;
  yesBalance: bigint;
  noBalance: bigint;
  bump: number;
}

// ============================================
// User Balance Type (CLOB balance)
// ============================================

export interface UserBalance {
  user: string;
  market: string;
  usdcBalance: bigint;
  bump: number;
}

// ============================================
// Global State Type
// ============================================

export interface GlobalState {
  authority: string;
  usdcMint: string;
  settlementSigner: string;
  
  // Fee rates (in basis points, 1e6 scale)
  centerTakerFeeRate: number;
  extremeTakerFeeRate: number;
  platformFeeRate: number;
  makerRebateRate: number;
  creatorIncentiveRate: number;
  
  bump: number;
}
