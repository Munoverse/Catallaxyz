/**
 * Auth Headers Utility
 * Centralized authentication header building for Phantom Connect wallets
 */

import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

export interface AuthHeadersParams {
  publicKey: PublicKey | null;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

export interface AuthHeaders {
  'X-Wallet-Address': string;
  'X-Wallet-Signature'?: string;
  'X-Wallet-Message'?: string;
  'X-Auth-Provider'?: string;
}

/**
 * Build authentication headers for API requests
 * Uses Phantom Connect wallet for signing
 */
export async function buildAuthHeaders(params: AuthHeadersParams): Promise<AuthHeaders | null> {
  const { publicKey, signMessage } = params;

  const walletAddress = publicKey?.toBase58();

  if (!walletAddress) {
    return null;
  }

  const headers: AuthHeaders = {
    'X-Wallet-Address': walletAddress,
    'X-Auth-Provider': 'phantom',
  };

  // Sign message if signMessage function is available
  if (signMessage && publicKey) {
    try {
      const timestamp = Date.now();
      const message = `Authenticate: ${walletAddress}:${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);
      const signature = await signMessage(messageBytes);
      
      headers['X-Wallet-Signature'] = bs58.encode(signature);
      headers['X-Wallet-Message'] = message;
    } catch (error) {
      console.error('Failed to sign message for auth:', error);
      // Continue without signature for read-only operations
    }
  }

  return headers;
}

/**
 * Check if user is authenticated based on wallet state
 */
export function isAuthenticated(params: {
  connected: boolean;
  publicKey: PublicKey | null;
}): boolean {
  const { connected, publicKey } = params;
  return connected && !!publicKey;
}

/**
 * Get effective wallet address
 */
export function getEffectiveWalletAddress(params: {
  publicKey: PublicKey | null;
}): string | null {
  const { publicKey } = params;
  return publicKey?.toBase58() ?? null;
}
