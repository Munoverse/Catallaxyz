/**
 * Exchange Order Types (Polymarket-style)
 * 
 * TypeScript definitions for the new atomic swap order system.
 */

import { PublicKey } from '@solana/web3.js';

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
  signature: Uint8Array;
}

// ============================================
// Constants
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

export const MAX_FEE_RATE_BPS = 1000; // 10%
export const PRICE_SCALE = BigInt(1_000_000);

// Domain separator must match on-chain
export const DOMAIN_SEPARATOR = 'Catallaxyz Exchange v1';

// ============================================
// Order Serialization (Borsh-compatible)
// ============================================

/**
 * Serialize an order to bytes (Borsh format)
 * Must match the on-chain Order struct serialization
 */
export function serializeOrder(order: Order): Uint8Array {
  const buffer = new ArrayBuffer(172); // Fixed size
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  
  let offset = 0;
  
  // salt: u64
  view.setBigUint64(offset, order.salt, true);
  offset += 8;
  
  // maker: [u8; 32]
  bytes.set(order.maker.toBytes(), offset);
  offset += 32;
  
  // signer: [u8; 32]
  bytes.set(order.signer.toBytes(), offset);
  offset += 32;
  
  // taker: [u8; 32]
  bytes.set(order.taker.toBytes(), offset);
  offset += 32;
  
  // market: [u8; 32]
  bytes.set(order.market.toBytes(), offset);
  offset += 32;
  
  // token_id: u8
  view.setUint8(offset, order.tokenId);
  offset += 1;
  
  // maker_amount: u64
  view.setBigUint64(offset, order.makerAmount, true);
  offset += 8;
  
  // taker_amount: u64
  view.setBigUint64(offset, order.takerAmount, true);
  offset += 8;
  
  // expiration: i64
  view.setBigInt64(offset, order.expiration, true);
  offset += 8;
  
  // nonce: u64
  view.setBigUint64(offset, order.nonce, true);
  offset += 8;
  
  // fee_rate_bps: u16
  view.setUint16(offset, order.feeRateBps, true);
  offset += 2;
  
  // side: u8
  view.setUint8(offset, order.side);
  offset += 1;
  
  return bytes;
}

// ============================================
// Order Hashing (Blake3)
// ============================================

/**
 * Hash an order using SHA-256
 * Note: Must match on-chain implementation
 */
export async function hashOrder(order: Order): Promise<Uint8Array> {
  const orderBytes = serializeOrder(order);
  const domainBytes = new TextEncoder().encode(DOMAIN_SEPARATOR);
  
  // Combine domain separator and order bytes
  const combined = new Uint8Array(domainBytes.length + orderBytes.length);
  combined.set(domainBytes);
  combined.set(orderBytes, domainBytes.length);
  
  // Use SHA-256 (matches solana_program::hash)
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  return new Uint8Array(hashBuffer);
}

// ============================================
// Validation
// ============================================

export function validateOrder(order: Order): { valid: boolean; error?: string } {
  if (order.feeRateBps > MAX_FEE_RATE_BPS) {
    return { valid: false, error: `Fee rate ${order.feeRateBps} exceeds max ${MAX_FEE_RATE_BPS}` };
  }
  
  if (order.tokenId > 2) {
    return { valid: false, error: `Invalid token ID: ${order.tokenId}` };
  }
  
  if (order.makerAmount <= BigInt(0) || order.takerAmount <= BigInt(0)) {
    return { valid: false, error: 'Amounts must be positive' };
  }
  
  if (order.side > 1) {
    return { valid: false, error: `Invalid side: ${order.side}` };
  }
  
  return { valid: true };
}

export function isOrderExpired(order: Order): boolean {
  return order.expiration > BigInt(0) && order.expiration < BigInt(Math.floor(Date.now() / 1000));
}

// ============================================
// Price Calculation
// ============================================

export function calculateOrderPrice(order: Order): bigint {
  if (order.side === SIDE.BUY) {
    if (order.takerAmount === BigInt(0)) return BigInt(0);
    return (order.makerAmount * PRICE_SCALE) / order.takerAmount;
  } else {
    if (order.makerAmount === BigInt(0)) return BigInt(0);
    return (order.takerAmount * PRICE_SCALE) / order.makerAmount;
  }
}

// ============================================
// API Format Conversion
// ============================================

export interface OrderApiFormat {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  market: string;
  tokenId: number;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: number;
  side: number;
}

export function orderToApiFormat(order: Order): OrderApiFormat {
  return {
    salt: order.salt.toString(),
    maker: order.maker.toBase58(),
    signer: order.signer.toBase58(),
    taker: order.taker.toBase58(),
    market: order.market.toBase58(),
    tokenId: order.tokenId,
    makerAmount: order.makerAmount.toString(),
    takerAmount: order.takerAmount.toString(),
    expiration: order.expiration.toString(),
    nonce: order.nonce.toString(),
    feeRateBps: order.feeRateBps,
    side: order.side,
  };
}

export function orderFromApiFormat(data: OrderApiFormat): Order {
  return {
    salt: BigInt(data.salt),
    maker: new PublicKey(data.maker),
    signer: new PublicKey(data.signer),
    taker: new PublicKey(data.taker),
    market: new PublicKey(data.market),
    tokenId: data.tokenId,
    makerAmount: BigInt(data.makerAmount),
    takerAmount: BigInt(data.takerAmount),
    expiration: BigInt(data.expiration),
    nonce: BigInt(data.nonce),
    feeRateBps: data.feeRateBps,
    side: data.side,
  };
}
