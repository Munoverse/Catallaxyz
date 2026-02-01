/**
 * Exchange Types (Polymarket-style)
 * 
 * Defines order structures and utilities for the new atomic swap mechanism.
 */

import { PublicKey } from '@solana/web3.js';
import { serialize, Schema } from 'borsh';
import { createHash } from 'crypto';

// ============================================
// Order Structure
// ============================================

export interface Order {
  salt: bigint;
  maker: PublicKey;
  signer: PublicKey;
  taker: PublicKey;
  market: PublicKey;
  tokenId: number; // 0=USDC, 1=YES, 2=NO
  makerAmount: bigint;
  takerAmount: bigint;
  expiration: bigint;
  nonce: bigint;
  feeRateBps: number;
  side: number; // 0=BUY, 1=SELL
}

export interface SignedOrder {
  order: Order;
  signature: Uint8Array; // 64 bytes Ed25519 signature
}

// ============================================
// Match Types
// ============================================

export enum MatchType {
  Complementary = 0, // Buy vs Sell
  Mint = 1,          // Buy vs Buy (mint tokens)
  Merge = 2,         // Sell vs Sell (merge to USDC)
}

// ============================================
// Token IDs
// ============================================

export const TOKEN_ID = {
  USDC: 0,
  YES: 1,
  NO: 2,
} as const;

export const SIDE = {
  BUY: 0,
  SELL: 1,
} as const;

// ============================================
// Borsh Serialization Schema
// ============================================

const orderSchema: Schema = {
  struct: {
    salt: 'u64',
    maker: { array: { type: 'u8', len: 32 } },
    signer: { array: { type: 'u8', len: 32 } },
    taker: { array: { type: 'u8', len: 32 } },
    market: { array: { type: 'u8', len: 32 } },
    token_id: 'u8',
    maker_amount: 'u64',
    taker_amount: 'u64',
    expiration: 'i64',
    nonce: 'u64',
    fee_rate_bps: 'u16',
    side: 'u8',
  },
};

// ============================================
// Order Hashing
// ============================================

const DOMAIN_SEPARATOR = Buffer.from('Catallaxyz Exchange v1');

/**
 * Serialize an order to bytes using Borsh
 */
export function serializeOrder(order: Order): Buffer {
  const orderData = {
    salt: order.salt,
    maker: Array.from(order.maker.toBytes()),
    signer: Array.from(order.signer.toBytes()),
    taker: Array.from(order.taker.toBytes()),
    market: Array.from(order.market.toBytes()),
    token_id: order.tokenId,
    maker_amount: order.makerAmount,
    taker_amount: order.takerAmount,
    expiration: order.expiration,
    nonce: order.nonce,
    fee_rate_bps: order.feeRateBps,
    side: order.side,
  };
  return Buffer.from(serialize(orderSchema, orderData));
}

/**
 * Hash an order using SHA256 
 * Note: On-chain uses blake3, but for simplicity we use SHA256 here
 * Update on-chain to match if needed, or use a blake3 library
 */
export function hashOrder(order: Order): Buffer {
  const orderBytes = serializeOrder(order);
  const combined = Buffer.concat([DOMAIN_SEPARATOR, orderBytes]);
  // Use SHA256 for now (matches solana_program::hash)
  return createHash('sha256').update(combined).digest();
}

// ============================================
// Order Validation
// ============================================

export const MAX_FEE_RATE_BPS = 1000; // 10%
export const PRICE_SCALE = 1_000_000n;

/**
 * Validate order parameters
 */
export function validateOrder(order: Order): { valid: boolean; error?: string } {
  // Check fee rate
  if (order.feeRateBps > MAX_FEE_RATE_BPS) {
    return { valid: false, error: `Fee rate ${order.feeRateBps} exceeds max ${MAX_FEE_RATE_BPS}` };
  }

  // Check token ID
  if (order.tokenId > 2) {
    return { valid: false, error: `Invalid token ID: ${order.tokenId}` };
  }

  // Check amounts
  if (order.makerAmount <= 0n || order.takerAmount <= 0n) {
    return { valid: false, error: 'Amounts must be positive' };
  }

  // Check side
  if (order.side > 1) {
    return { valid: false, error: `Invalid side: ${order.side}` };
  }

  return { valid: true };
}

/**
 * Check if order has expired
 */
export function isOrderExpired(order: Order, currentTimestamp: number): boolean {
  return order.expiration > 0n && order.expiration < BigInt(currentTimestamp);
}

/**
 * Calculate order price (scaled by PRICE_SCALE)
 */
export function calculateOrderPrice(order: Order): bigint {
  if (order.side === SIDE.BUY) {
    // BUY: price = makerAmount (USDC) / takerAmount (tokens)
    if (order.takerAmount === 0n) return 0n;
    return (order.makerAmount * PRICE_SCALE) / order.takerAmount;
  } else {
    // SELL: price = takerAmount (USDC) / makerAmount (tokens)
    if (order.makerAmount === 0n) return 0n;
    return (order.takerAmount * PRICE_SCALE) / order.makerAmount;
  }
}

/**
 * Determine match type from two orders
 */
export function determineMatchType(takerOrder: Order, makerOrder: Order): MatchType | null {
  const takerSide = takerOrder.side;
  const makerSide = makerOrder.side;

  if ((takerSide === SIDE.BUY && makerSide === SIDE.SELL) ||
      (takerSide === SIDE.SELL && makerSide === SIDE.BUY)) {
    return MatchType.Complementary;
  }

  if (takerSide === SIDE.BUY && makerSide === SIDE.BUY) {
    // Both buying - must be complementary tokens for MINT
    if (takerOrder.tokenId !== makerOrder.tokenId && 
        takerOrder.tokenId !== TOKEN_ID.USDC && 
        makerOrder.tokenId !== TOKEN_ID.USDC) {
      return MatchType.Mint;
    }
    return null;
  }

  if (takerSide === SIDE.SELL && makerSide === SIDE.SELL) {
    // Both selling - must be complementary tokens for MERGE
    if (takerOrder.tokenId !== makerOrder.tokenId &&
        takerOrder.tokenId !== TOKEN_ID.USDC &&
        makerOrder.tokenId !== TOKEN_ID.USDC) {
      return MatchType.Merge;
    }
    return null;
  }

  return null;
}

/**
 * Check if two orders have crossing prices
 */
export function isCrossing(takerOrder: Order, makerOrder: Order, matchType: MatchType): boolean {
  const takerPrice = calculateOrderPrice(takerOrder);
  const makerPrice = calculateOrderPrice(makerOrder);

  switch (matchType) {
    case MatchType.Complementary:
      if (takerOrder.side === SIDE.BUY) {
        return takerPrice >= makerPrice;
      } else {
        return takerPrice <= makerPrice;
      }

    case MatchType.Mint:
      // Both buying complementary tokens - total price should be <= 1.0
      return takerPrice + makerPrice <= PRICE_SCALE;

    case MatchType.Merge:
      // Both selling complementary tokens - total price should be >= 1.0
      return takerPrice + makerPrice >= PRICE_SCALE;

    default:
      return false;
  }
}

// ============================================
// Order Creation Helpers
// ============================================

/**
 * Generate a random salt for order uniqueness
 */
export function generateSalt(): bigint {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return BigInt('0x' + Buffer.from(bytes).toString('hex'));
}

/**
 * Create an order from simplified parameters
 */
export function createOrder(params: {
  maker: PublicKey;
  market: PublicKey;
  tokenId: number;
  side: number;
  price: number; // 0.01 - 0.99
  size: bigint;  // in token units
  nonce: bigint;
  feeRateBps?: number;
  expiration?: number;
  taker?: PublicKey;
}): Order {
  const { maker, market, tokenId, side, price, size, nonce, feeRateBps = 0, expiration = 0, taker } = params;

  // Calculate maker and taker amounts from price and size
  let makerAmount: bigint;
  let takerAmount: bigint;

  const priceScaled = BigInt(Math.floor(price * 1_000_000));

  if (side === SIDE.BUY) {
    // BUY: maker provides USDC, receives tokens
    // makerAmount = price * size
    takerAmount = size;
    makerAmount = (priceScaled * size) / PRICE_SCALE;
  } else {
    // SELL: maker provides tokens, receives USDC
    makerAmount = size;
    takerAmount = (priceScaled * size) / PRICE_SCALE;
  }

  return {
    salt: generateSalt(),
    maker,
    signer: maker, // Default signer is maker
    taker: taker || PublicKey.default,
    market,
    tokenId,
    makerAmount,
    takerAmount,
    expiration: BigInt(expiration),
    nonce,
    feeRateBps,
    side,
  };
}
