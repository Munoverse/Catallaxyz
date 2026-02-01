/**
 * Exchange Client
 * 
 * Client for interacting with the exchange API endpoints.
 */

import { PublicKey } from '@solana/web3.js';
import { SignedOrder } from './order-types';
import { signedOrderToApiFormat, SignedOrderApiFormat } from './order-signing';
import { getStoredCredentials } from '@/lib/credentials';

// ============================================
// API Response Types
// ============================================

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

interface SubmitOrderResponse {
  orderHash: string;
  status: string;
  order: {
    salt: string;
    maker: string;
    market: string;
    tokenId: number;
    side: number;
    makerAmount: string;
    takerAmount: string;
    nonce: string;
    feeRateBps: number;
  };
}

interface OrderStatusResponse {
  orderHash: string;
  exists: boolean;
  isFilledOrCancelled?: boolean;
  remaining?: string;
  status: 'unknown' | 'open' | 'filled' | 'cancelled';
}

interface NonceResponse {
  wallet: string;
  nonce: string;
}

// ============================================
// Exchange Client
// ============================================

export interface ExchangeClient {
  /** Submit a signed order to the exchange */
  submitOrder(signedOrder: SignedOrder): Promise<ApiResponse<SubmitOrderResponse>>;
  
  /** Get order status from on-chain */
  getOrderStatus(orderHash: string): Promise<ApiResponse<OrderStatusResponse>>;
  
  /** Get user's current nonce */
  getNonce(wallet?: PublicKey): Promise<ApiResponse<NonceResponse>>;
}

/**
 * Create an exchange client
 */
export function createExchangeClient(
  baseUrl: string = process.env.NEXT_PUBLIC_CLOB_API_URL || 'http://localhost:3002'
): ExchangeClient {
  
  async function makeRequest<T>(
    method: string,
    path: string,
    body?: any,
    requireAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${baseUrl}${path}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Add L2 auth headers if required
      if (requireAuth) {
        const credentials = getStoredCredentials();
        if (!credentials) {
          return {
            success: false,
            error: { code: 'AUTH_REQUIRED', message: 'Not authenticated' },
          };
        }
        
        const timestamp = Date.now().toString();
        const bodyStr = body ? JSON.stringify(body) : '';
        const signature = await buildHmacSignature(
          credentials.secret,
          timestamp,
          method,
          path,
          bodyStr
        );
        
        headers['poly_api_key'] = credentials.apiKey;
        headers['poly_passphrase'] = credentials.passphrase;
        headers['poly_signature'] = signature;
        headers['poly_timestamp'] = timestamp;
        headers['poly_address'] = credentials.walletAddress;
      }
      
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      
      const data = await response.json();
      return data;
    } catch (error: any) {
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: error.message || 'Network error' },
      };
    }
  }
  
  return {
    async submitOrder(signedOrder: SignedOrder): Promise<ApiResponse<SubmitOrderResponse>> {
      const body = signedOrderToApiFormat(signedOrder);
      return makeRequest<SubmitOrderResponse>('POST', '/exchange/orders', body);
    },
    
    async getOrderStatus(orderHash: string): Promise<ApiResponse<OrderStatusResponse>> {
      return makeRequest<OrderStatusResponse>('GET', `/exchange/orders/${orderHash}`, undefined, false);
    },
    
    async getNonce(wallet?: PublicKey): Promise<ApiResponse<NonceResponse>> {
      const credentials = getStoredCredentials();
      const walletAddress = wallet?.toBase58() || credentials?.walletAddress;
      
      if (!walletAddress) {
        return {
          success: false,
          error: { code: 'WALLET_REQUIRED', message: 'Wallet address required' },
        };
      }
      
      return makeRequest<NonceResponse>('GET', `/exchange/nonce/${walletAddress}`, undefined, false);
    },
  };
}

// ============================================
// Helper to generate HMAC signature
// ============================================

async function buildHmacSignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string
): Promise<string> {
  const payload = `${timestamp}${method}${path}${body}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
