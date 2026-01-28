/**
 * Shared type definitions for Catallaxyz frontend
 * 
 * These types mirror the on-chain account structures and API responses
 */

import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';

// ============================================
// Constants
// ============================================

/** USDC has 6 decimal places (1 USDC = 1,000,000 lamports) */
export const USDC_DECIMALS = 6;
export const USDC_MULTIPLIER = 10 ** USDC_DECIMALS;

/** Price scale (1.0 = 1,000,000) */
export const PRICE_SCALE = 1_000_000;

/** Termination probability scale */
export const PROBABILITY_SCALE = 1_000_000;

// ============================================
// On-chain Account Types
// ============================================

/**
 * Global account data from on-chain program
 */
export interface GlobalAccount {
  authority: PublicKey;
  usdcMint: PublicKey;
  platformFeeRate: BN;
  makerRebateRate: BN;
  centerTakerFeeRate: BN;
  extremeTakerFeeRate: BN;
  creatorIncentiveRate: BN;
  platformTreasury: PublicKey;
  creatorTreasury: PublicKey;
  bump: number;
}

/**
 * Market account data from on-chain program
 */
export interface MarketAccount {
  creator: PublicKey;
  global: PublicKey;
  marketId: number[];
  status: number;
  isPaused: boolean;
  pausedAt: BN | null;
  totalTrades: BN;
  totalPositionCollateral: BN;
  totalYesSupply: BN;
  totalNoSupply: BN;
  lastTradeYesPrice: BN | null;
  lastTradeNoPrice: BN | null;
  lastActivityTs: BN;
  lastTradeSlot: BN | null;
  lastTradeOutcome: number | null;
  referenceAgent: PublicKey | null;
  createdAt: BN;
  randomTerminationEnabled: boolean;
  terminationProbability: number;
  isRandomlyTerminated: boolean;
  canRedeem: boolean;
  finalYesPrice: BN | null;
  finalNoPrice: BN | null;
  terminationTradeSlot: BN | null;
  tradeNonce: BN;
  switchboardQueue: PublicKey | null;
  randomnessAccount: PublicKey | null;
  bump: number;
}

/**
 * User position account data
 * AUDIT FIX v1.2.5: Field names match Rust contract (yes_balance, no_balance)
 */
export interface UserPositionAccount {
  market: PublicKey;
  user: PublicKey;
  yesBalance: BN;  // Matches Rust: yes_balance
  noBalance: BN;   // Matches Rust: no_balance
  bump: number;
}

/**
 * User balance account data
 * AUDIT FIX v1.2.5: Matches Rust contract structure (user_balance.rs)
 * 
 * Note: The contract only stores a single usdc_balance field.
 * Available/locked tracking is done off-chain in the CLOB system.
 */
export interface UserBalanceAccount {
  user: PublicKey;
  market: PublicKey;
  usdcBalance: BN;
  bump: number;
}

// ============================================
// API Response Types
// ============================================

/**
 * Market data from API
 */
export interface MarketApiResponse {
  address: string;
  creator: string;
  status: number;
  createdAt?: number;
  totalTrades?: number;
  question?: string;
  probability?: number;
  volume24h?: number;
  liquidity?: number;
}

/**
 * Orderbook entry (buy or sell side)
 * AUDIT FIX v1.2.4: Added optional fields used by OrderbookPanel
 */
export interface OrderbookEntry {
  price: number;
  size: number;
  total: number;
  ordersCount?: number;
  // Optional fields for detailed order display
  id?: string;
  maker?: string;
  remaining?: number;
}

/**
 * Order data
 */
export interface Order {
  id: string;
  marketId: string;
  userId: string;
  outcomeType: 'yes' | 'no';
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  price: number;
  amount: number;
  filledAmount: number;
  remainingAmount: number;
  status: 'open' | 'partial' | 'filled' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

/**
 * Trade data
 */
export interface Trade {
  id: string;
  marketId: string;
  makerId?: string;
  takerId?: string;
  outcomeType: 'yes' | 'no';
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  totalCost: number;
  makerFee: number;
  takerFee: number;
  createdAt: string;
  txSignature?: string;
}

/**
 * User data
 */
export interface User {
  id: string;
  walletAddress: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  totalTrades: number;
  totalVolume: number;
  winRate: number;
}

// ============================================
// UI State Types
// ============================================

/**
 * Market display row for list views
 */
export interface MarketRow {
  address: string;
  creator: string;
  status: number;
  createdAt?: number;
  totalTrades?: number;
  question?: string;
}

/**
 * User position for display
 */
export interface UserPosition {
  yes: number;
  no: number;
}

/**
 * Outcome type
 */
export type OutcomeType = 'yes' | 'no';

/**
 * Trade side
 */
export type TradeSide = 'buy' | 'sell';

/**
 * Order type
 */
export type OrderType = 'limit' | 'market';

/**
 * Order status
 */
export type OrderStatus = 'open' | 'partial' | 'filled' | 'cancelled';

// ============================================
// Utility Types
// ============================================

/**
 * Value that can be converted to a number
 * Handles BN, number, string, and objects with toNumber()
 */
export type NumberLike = number | BN | string | { toNumber(): number } | null | undefined;

/**
 * Convert a NumberLike value to number
 */
export const toNumber = (value: NumberLike): number | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
};

/**
 * Format USDC amount from lamports to display string
 */
export const formatUsdcAmount = (lamports: number | undefined | null): string => {
  const amount = lamports ?? 0;
  return (amount / USDC_MULTIPLIER).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
};

/**
 * Format price from scaled value
 */
export const formatPrice = (scaledPrice: number | undefined | null): string => {
  if (scaledPrice === null || scaledPrice === undefined) return '—';
  return (scaledPrice / PRICE_SCALE).toFixed(4);
};

/**
 * Format probability as percentage
 */
export const formatProbability = (scaledProbability: number | undefined | null): string => {
  if (scaledProbability === null || scaledProbability === undefined) return '—';
  return `${((scaledProbability / PROBABILITY_SCALE) * 100).toFixed(4)}%`;
};

/**
 * Format timestamp to locale string
 */
export const formatDateTime = (timestamp: number | undefined | null): string => {
  if (!timestamp) return '—';
  return new Date(timestamp * 1000).toLocaleString();
};
