/**
 * Catallaxyz shared constants
 *
 * Defines project-wide constants aligned with on-chain and database values.
 * 
 * @packageDocumentation
 */

// ============================================
// 1. Fee system
// ============================================

/**
 * Dynamic taker fee curve
 * Formula: fee = CENTER_TAKER_FEE - (CENTER_TAKER_FEE - EXTREME_TAKER_FEE) × (distance_from_center / 0.5)
 *
 * Examples:
 * - Price 0.50: 3.2% (max, center)
 * - Price 0.40/0.60: 2.6%
 * - Price 0.30/0.70: 2.0%
 * - Price 0.20/0.80: 1.4%
 * - Price 0.10/0.90: 0.8%
 * - Price 0.01/0.99: 0.2% (min, extreme)
 */
export const FEE_RATES = {
  /** Center rate: max fee at 50% price (3.2%) */
  CENTER_TAKER_FEE: 0.032,

  /** Extreme rate: min fee at 0%/100% price (0.2%) */
  EXTREME_TAKER_FEE: 0.002,

  /** Maker rebate: fee share returned to makers (20%) */
  MAKER_REBATE: 0.2,

  /** Platform fee share (75%) */
  PLATFORM_FEE: 0.75,

  /** Creator incentive share (5%) */
  CREATOR_INCENTIVE: 0.05,
} as const;

/**
 * Calculate dynamic taker fee rate (aligned with on-chain)
 * @param probability Price probability (0-1)
 * @returns Taker fee rate (0-1)
 */
export function calculateTakerFeeRate(probability: number): number {
  // Distance from center (50%)
  const distanceFromCenter = Math.abs(probability - 0.5);

  // Rate range
  const rateRange = FEE_RATES.CENTER_TAKER_FEE - FEE_RATES.EXTREME_TAKER_FEE;

  // Fee reduction
  const feeReduction = rateRange * (distanceFromCenter / 0.5);

  // Final rate
  const feeRate = FEE_RATES.CENTER_TAKER_FEE - feeReduction;

  // Clamp to valid range
  return Math.max(
    Math.min(feeRate, FEE_RATES.CENTER_TAKER_FEE),
    FEE_RATES.EXTREME_TAKER_FEE
  );
}

// ============================================
// 2. VRF and random termination
// ============================================

/** Switchboard VRF fee (SOL) */
export const VRF_FEE_SOL = 0.005;

/** Switchboard VRF fee (lamports) */
export const VRF_FEE_LAMPORTS = 5_000_000;

/** Default termination probability (0.1%) */
export const TERMINATION_PROBABILITY = 0.001;

/** Termination probability (percent) */
export const TERMINATION_PROBABILITY_PERCENT = 0.1;

/**
 * Termination threshold (on-chain format)
 * 0.1% = 100,000 / 100,000,000
 *
 * Used as settle_with_randomness settlementThreshold
 */
export const TERMINATION_THRESHOLD_SCALED = 100_000;

/** Max termination threshold value */
export const TERMINATION_THRESHOLD_MAX = 100_000_000;

// ============================================
// 3. Market termination
// ============================================

/** Inactivity auto-termination (days) */
export const INACTIVITY_TIMEOUT_DAYS = 7;

/** Inactivity auto-termination (seconds) */
export const INACTIVITY_TIMEOUT_SECONDS = 7 * 24 * 60 * 60;

// ============================================
// 4. Market status
// ============================================

/** On-chain market status */
export enum ContractMarketStatus {
  Active = 0,
  Settled = 1,
  Closed = 2,
  Terminated = 4,
}

/** Database market status */
export type DatabaseMarketStatus =
  | 'active'
  | 'paused'
  | 'running'
  | 'settled'
  | 'closed'
  | 'cancelled'
  | 'terminated';

/** Status mapping: on-chain -> database */
export const CONTRACT_TO_DB_STATUS: Record<
  ContractMarketStatus,
  DatabaseMarketStatus
> = {
  [ContractMarketStatus.Active]: 'active',
  [ContractMarketStatus.Settled]: 'settled',
  [ContractMarketStatus.Closed]: 'closed',
  [ContractMarketStatus.Terminated]: 'terminated',
};

/** Status mapping: database -> on-chain */
export const DB_TO_CONTRACT_STATUS: Record<
  DatabaseMarketStatus,
  ContractMarketStatus | null
> = {
  active: ContractMarketStatus.Active,
  running: ContractMarketStatus.Active,
  settled: ContractMarketStatus.Settled,
  closed: ContractMarketStatus.Closed,
  paused: null, // Not supported on-chain
  cancelled: ContractMarketStatus.Closed,
  terminated: ContractMarketStatus.Terminated,
};

/** Market status labels */
export const MARKET_STATUS_LABELS: Record<DatabaseMarketStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  running: 'Running',
  settled: 'Settled',
  closed: 'Closed',
  cancelled: 'Cancelled',
  terminated: 'Terminated',
};

// ============================================
// 5. Outcome Tokens (Binary markets only)
// ============================================

/** Binary markets always have 2 outcomes (YES and NO) */
export const MAX_OUTCOME_TOKENS = 2;

/** Price scale (10^6) */
export const PRICE_SCALE = 1_000_000;

// ============================================
// 6. USDC and amounts
// ============================================

/** USDC decimals */
export const USDC_DECIMALS = 6;

/** Minimum trade amount (lamports) */
export const MIN_TRADE_AMOUNT_LAMPORTS = 1_000_000;

/** Minimum trade amount (USDC) */
export const MIN_TRADE_AMOUNT_USDC = 1;

/** Convert lamports to USDC */
export function lamportsToUsdc(lamports: number | bigint): number {
  return Number(lamports) / Math.pow(10, USDC_DECIMALS);
}

/** Convert USDC to lamports */
export function usdcToLamports(usdc: number): bigint {
  return BigInt(Math.floor(usdc * Math.pow(10, USDC_DECIMALS)));
}

// ============================================
// 7. Trade types
// ============================================

/** Order type */
export enum OrderType {
  Limit = 'limit',
  Market = 'market',
}

/** Order side */
export enum OrderSide {
  Buy = 'buy',
  Sell = 'sell',
}

/** Redemption type */
export enum RedemptionType {
  Merge = 'merge',
  SingleOutcome = 'single_outcome',
}

// ============================================
// 8. Helpers
// ============================================

/**
 * Format rate as percentage string
 * @param rate Rate (0-1)
 * @param decimals Decimal places
 * @returns Formatted percentage
 */
export function formatFeeRate(rate: number, decimals: number = 2): string {
  return `${(rate * 100).toFixed(decimals)}%`;
}

/**
 * Format USDC amount
 * @param lamports USDC lamports
 * @param decimals Decimal places
 * @returns Formatted USDC string
 */
export function formatUsdc(lamports: number | bigint, decimals: number = 2): string {
  const usdc = lamportsToUsdc(lamports);
  return usdc.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format probability as percentage
 * @param probability Probability (0-1)
 * @param decimals Decimal places
 * @returns Formatted percentage
 */
export function formatProbability(probability: number, decimals: number = 1): string {
  return `${(probability * 100).toFixed(decimals)}%`;
}

// ============================================
// 9. Polymarket-style probability calculation
// ============================================

/** Spread threshold - use last trade price when exceeded (10¢) */
export const SPREAD_THRESHOLD = 0.1;

/**
 * Calculate market probability using Polymarket approach
 *
 * Rules (from Polymarket docs):
 * 1. Probability = midpoint of bid-ask spread
 * 2. If spread > 10¢, use last trade price
 *
 * @param bestBid Best bid (0-1)
 * @param bestAsk Best ask (0-1)
 * @param spread Spread (0-1)
 * @param lastTradePrice Last trade price (optional, 0-1)
 * @returns Market probability (0-1)
 */
export function calculateMarketProbability(
  bestBid: number,
  bestAsk: number,
  spread: number,
  lastTradePrice?: number
): number {
  if (spread > SPREAD_THRESHOLD && lastTradePrice !== undefined) {
    return Math.max(0, Math.min(1, lastTradePrice));
  }

  const midPrice = (bestBid + bestAsk) / 2;
  return Math.max(0, Math.min(1, midPrice));
}

/**
 * Format price in cents
 * @param price Price (0-1)
 * @param decimals Decimal places
 * @returns Formatted price (e.g. "37.5¢")
 */
export function formatPriceCents(price: number, decimals: number = 1): string {
  return `${(price * 100).toFixed(decimals)}¢`;
}

// ============================================
// Legacy exports for backward compatibility
// ============================================

/** @deprecated Use ContractMarketStatus instead */
export const catallaxyzMarketStatus = ContractMarketStatus;

/** @deprecated Use CONTRACT_TO_DB_STATUS instead */
export const catallaxyz_TO_DB_STATUS = CONTRACT_TO_DB_STATUS;

/** @deprecated Use DB_TO_CONTRACT_STATUS instead */
export const DB_TO_catallaxyz_STATUS = DB_TO_CONTRACT_STATUS;
