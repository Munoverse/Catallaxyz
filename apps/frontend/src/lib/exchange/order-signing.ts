/**
 * Order Signing Utilities
 * 
 * Handles Ed25519 signing of orders using the user's wallet.
 */

import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { Order, SignedOrder, hashOrder, serializeOrder } from './order-types';

// ============================================
// Wallet Adapter Types
// ============================================

export interface WalletSignMessageAdapter {
  publicKey: PublicKey | null;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

// ============================================
// Order Signing
// ============================================

/**
 * Sign an order using the wallet's signMessage
 */
export async function signOrder(
  order: Order,
  wallet: WalletSignMessageAdapter
): Promise<SignedOrder> {
  if (!wallet.publicKey) {
    throw new Error('Wallet not connected');
  }
  
  if (!wallet.signMessage) {
    throw new Error('Wallet does not support message signing');
  }
  
  // Verify the order signer matches the wallet
  if (!order.signer.equals(wallet.publicKey)) {
    throw new Error('Order signer does not match connected wallet');
  }
  
  // Hash the order
  const orderHash = await hashOrder(order);
  
  // Sign the hash
  const signature = await wallet.signMessage(orderHash);
  
  if (signature.length !== 64) {
    throw new Error(`Invalid signature length: ${signature.length}, expected 64`);
  }
  
  return {
    order,
    signature,
  };
}

/**
 * Verify an order signature locally
 * Note: This is for client-side validation only
 * In production, use a proper Ed25519 verification library
 */
export async function verifyOrderSignature(signedOrder: SignedOrder): Promise<boolean> {
  // Signature verification would require an Ed25519 library
  // For now, we trust the wallet signed correctly
  // The on-chain verification is the source of truth
  console.warn('Client-side signature verification not implemented');
  return signedOrder.signature.length === 64;
}

// ============================================
// Signature Encoding
// ============================================

/**
 * Encode signature to base58 for API transmission
 */
export function encodeSignature(signature: Uint8Array): string {
  return bs58.encode(signature);
}

/**
 * Decode signature from base58
 */
export function decodeSignature(encoded: string): Uint8Array {
  return bs58.decode(encoded);
}

// ============================================
// Signed Order API Format
// ============================================

export interface SignedOrderApiFormat {
  order: {
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
  };
  signature: string;
}

/**
 * Convert SignedOrder to API format for transmission
 */
export function signedOrderToApiFormat(signedOrder: SignedOrder): SignedOrderApiFormat {
  return {
    order: {
      salt: signedOrder.order.salt.toString(),
      maker: signedOrder.order.maker.toBase58(),
      signer: signedOrder.order.signer.toBase58(),
      taker: signedOrder.order.taker.toBase58(),
      market: signedOrder.order.market.toBase58(),
      tokenId: signedOrder.order.tokenId,
      makerAmount: signedOrder.order.makerAmount.toString(),
      takerAmount: signedOrder.order.takerAmount.toString(),
      expiration: signedOrder.order.expiration.toString(),
      nonce: signedOrder.order.nonce.toString(),
      feeRateBps: signedOrder.order.feeRateBps,
      side: signedOrder.order.side,
    },
    signature: encodeSignature(signedOrder.signature),
  };
}
