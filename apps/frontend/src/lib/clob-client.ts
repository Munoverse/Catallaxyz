'use client'

/**
 * CLOB Client - Central Limit Order Book API Client
 * 
 * AUDIT FIX: Added proper TypeScript types and missing functions
 * Reference: Polymarket CLOB API design patterns
 */

import bs58 from 'bs58'
import { apiFetch } from '@/lib/api-client'

const CLOB_PREFIX = '/api/clob'

// ============================================
// Type Definitions
// ============================================

export interface ClobCredentials {
  apiKey: string
  passphrase: string
  secret: string
  walletAddress: string
}

export interface OrderParams {
  marketId: string
  outcomeType: 'yes' | 'no'
  side: 'buy' | 'sell'
  orderType: 'limit' | 'market'
  price?: number // Required for limit orders (0-1 range)
  amount: string | number // In smallest units (USDC lamports)
  clientOrderId?: string
  timeInForce?: 'GTC' | 'IOC' | 'FOK' // Good-til-cancelled, Immediate-or-cancel, Fill-or-kill
}

export interface OrderFill {
  price: number
  size: string
  timestamp: string
  makerOrderId?: string
}

export interface OrderResponse {
  success: boolean
  data?: {
    orderId: string
    status: 'open' | 'partial' | 'filled' | 'cancelled' | 'rejected'
    filledAmount?: string
    remainingAmount?: string
    fills?: OrderFill[]
  }
  error?: {
    code: string
    message: string
  }
}

export interface OrderInfo {
  orderId: string
  marketId: string
  outcomeType: 'yes' | 'no'
  side: 'buy' | 'sell'
  orderType: 'limit' | 'market'
  price: number
  amount: string
  filledAmount: string
  remainingAmount: string
  status: 'open' | 'partial' | 'filled' | 'cancelled'
  createdAt: string
  clientOrderId?: string
}

export interface OrderbookRow {
  price: number
  size: string
  total: string
  side: 'buy' | 'sell'
}

export interface OrderbookResponse {
  success: boolean
  data?: {
    bids: OrderbookRow[]
    asks: OrderbookRow[]
    timestamp: string
  }
  error?: {
    code: string
    message: string
  }
}

export interface BalanceResponse {
  success: boolean
  data?: {
    userId: string
    usdcAvailable: string
    usdcLocked: string
    yesAvailable: string
    yesLocked: string
    noAvailable: string
    noLocked: string
  }
  error?: {
    code: string
    message: string
  }
}

export interface TradeInfo {
  id: string
  marketId: string
  outcomeType: 'yes' | 'no'
  side: 'buy' | 'sell'
  price: number
  amount: string
  makerUserId?: string
  takerUserId?: string
  createdAt: string
}

// ============================================
// Authentication Helpers
// ============================================

export function buildL1Message(walletAddress: string, timestamp: string, nonce: string): string {
  return `Catallaxyz CLOB auth:${walletAddress}:${timestamp}:${nonce}`
}

export async function createOrDeriveApiKey({
  walletAddress,
  signMessage,
  signatureType = 0,
  funderAddress,
}: {
  walletAddress: string
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  signatureType?: number
  funderAddress?: string
}) {
  const timestamp = Date.now().toString()
  const nonce = `nonce-${Date.now()}`
  const message = buildL1Message(walletAddress, timestamp, nonce)
  const signature = await signMessage(new TextEncoder().encode(message))

  const response = await apiFetch(`${CLOB_PREFIX}/auth/api-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      poly_signature: bs58.encode(signature),
      poly_timestamp: timestamp,
      poly_nonce: nonce,
      poly_address: walletAddress,
    },
    body: JSON.stringify({
      walletAddress,
      nonce,
      signatureType,
      funderAddress,
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to create API key')
  }

  const data = await response.json()
  return { ...data.data, walletAddress }
}

async function buildHmacSignature(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function withL2Auth({
  apiKey,
  passphrase,
  secret,
  address,
  method,
  path,
  body,
}: {
  apiKey: string
  passphrase: string
  secret: string
  address: string
  method: string
  path: string
  body?: string
}) {
  const timestamp = Date.now().toString()
  const payload = `${timestamp}${method.toUpperCase()}${path}${body || ''}`
  const signature = await buildHmacSignature(secret, payload)

  return {
    poly_api_key: apiKey,
    poly_passphrase: passphrase,
    poly_signature: signature,
    poly_timestamp: timestamp,
    poly_address: address,
  }
}

/**
 * Place a new order
 * 
 * @param credentials - CLOB API credentials
 * @param order - Order parameters
 * @returns Order response with orderId and status
 */
export async function placeOrder({
  credentials,
  order,
}: {
  credentials: ClobCredentials
  order: OrderParams
}): Promise<OrderResponse> {
  // Validate order params
  if (order.orderType === 'limit' && (order.price === undefined || order.price === null)) {
    throw new Error('Limit orders require a price')
  }
  if (order.orderType === 'limit' && (order.price! < 0 || order.price! > 1)) {
    throw new Error('Price must be between 0 and 1')
  }

  const body = JSON.stringify(order)
  const headers = await withL2Auth({
    apiKey: credentials.apiKey,
    passphrase: credentials.passphrase,
    secret: credentials.secret,
    address: credentials.walletAddress,
    method: 'POST',
    path: `${CLOB_PREFIX}/orders`,
    body,
  })

  const response = await apiFetch(`${CLOB_PREFIX}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body,
  })

  const result = await response.json()
  
  if (!response.ok) {
    return {
      success: false,
      error: result.error || { code: 'ORDER_FAILED', message: 'Failed to place order' },
    }
  }
  
  return result
}

/**
 * Fetch orderbook for a market
 * 
 * @param marketId - Market ID
 * @param outcomeType - 'yes' or 'no'
 * @returns Orderbook with bids and asks
 */
export async function fetchOrderbook(
  marketId: string,
  outcomeType: 'yes' | 'no'
): Promise<OrderbookResponse> {
  const response = await apiFetch(
    `${CLOB_PREFIX}/orderbook?marketId=${marketId}&outcomeType=${outcomeType}`,
    { method: 'GET' }
  )
  
  const result = await response.json()
  
  if (!response.ok) {
    return {
      success: false,
      error: result.error || { code: 'FETCH_FAILED', message: 'Failed to fetch orderbook' },
    }
  }
  
  return result
}

/**
 * Fetch user's orders
 * 
 * @param credentials - CLOB API credentials
 * @param marketId - Optional market ID to filter
 * @param status - Order status filter: 'open', 'all', or specific status
 * @returns List of orders
 */
export async function fetchOrders({
  credentials,
  marketId,
  status = 'open',
}: {
  credentials: ClobCredentials
  marketId?: string
  status?: 'open' | 'all' | 'filled' | 'cancelled'
}): Promise<{ success: boolean; data?: OrderInfo[]; error?: { code: string; message: string } }> {
  const params = new URLSearchParams()
  if (marketId) params.append('marketId', marketId)
  if (status) params.append('status', status)
  
  const queryString = params.toString()
  const path = `${CLOB_PREFIX}/orders${queryString ? `?${queryString}` : ''}`
  
  const headers = await withL2Auth({
    apiKey: credentials.apiKey,
    passphrase: credentials.passphrase,
    secret: credentials.secret,
    address: credentials.walletAddress,
    method: 'GET',
    path,
    body: '',
  })
  
  const response = await apiFetch(path, { method: 'GET', headers })
  const result = await response.json()
  
  if (!response.ok) {
    return {
      success: false,
      error: result.error || { code: 'FETCH_FAILED', message: 'Failed to fetch orders' },
    }
  }
  
  return result
}

/**
 * Fetch trade history for a market
 * 
 * @param marketId - Optional market ID to filter
 * @param limit - Number of trades to fetch (default 50)
 * @returns List of trades
 */
export async function fetchTrades(
  marketId?: string,
  limit = 50
): Promise<{ success: boolean; data?: TradeInfo[]; error?: { code: string; message: string } }> {
  const params = new URLSearchParams()
  if (marketId) params.append('marketId', marketId)
  params.append('limit', limit.toString())
  
  const response = await apiFetch(
    `${CLOB_PREFIX}/trades?${params.toString()}`,
    { method: 'GET' }
  )
  
  const result = await response.json()
  
  if (!response.ok) {
    return {
      success: false,
      error: result.error || { code: 'FETCH_FAILED', message: 'Failed to fetch trades' },
    }
  }
  
  return result
}

/**
 * Cancel a specific order
 * 
 * @param credentials - CLOB API credentials
 * @param orderId - Order ID to cancel
 * @returns Cancel result with unlocked amount
 */
export async function cancelOrder({
  credentials,
  orderId,
}: {
  credentials: ClobCredentials
  orderId: string
}): Promise<{ success: boolean; data?: { orderId: string; status: string; unlockedAmount?: string }; error?: { code: string; message: string } }> {
  const path = `${CLOB_PREFIX}/orders/${orderId}`
  const headers = await withL2Auth({
    apiKey: credentials.apiKey,
    passphrase: credentials.passphrase,
    secret: credentials.secret,
    address: credentials.walletAddress,
    method: 'DELETE',
    path,
    body: '',
  })
  
  const response = await apiFetch(path, {
    method: 'DELETE',
    headers,
  })
  
  const result = await response.json()
  
  if (!response.ok) {
    return {
      success: false,
      error: result.error || { code: 'CANCEL_FAILED', message: 'Failed to cancel order' },
    }
  }
  
  return result
}

/**
 * Cancel all orders for a market
 * 
 * @param credentials - CLOB API credentials
 * @param marketId - Market ID
 * @param outcomeType - Optional outcome type filter
 * @returns Cancel result with count and total unlocked
 */
export async function cancelAllOrders({
  credentials,
  marketId,
  outcomeType,
}: {
  credentials: ClobCredentials
  marketId: string
  outcomeType?: 'yes' | 'no'
}): Promise<{ success: boolean; data?: { cancelledCount: number; totalUnlocked: string }; error?: { code: string; message: string } }> {
  const body = JSON.stringify({ marketId, outcomeType })
  const path = `${CLOB_PREFIX}/orders/cancel-all`
  const headers = await withL2Auth({
    apiKey: credentials.apiKey,
    passphrase: credentials.passphrase,
    secret: credentials.secret,
    address: credentials.walletAddress,
    method: 'POST',
    path,
    body,
  })
  
  const response = await apiFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body,
  })
  
  const result = await response.json()
  
  if (!response.ok) {
    return {
      success: false,
      error: result.error || { code: 'CANCEL_FAILED', message: 'Failed to cancel orders' },
    }
  }
  
  return result
}

/**
 * Fetch user's CLOB balance
 * 
 * @param credentials - CLOB API credentials
 * @returns User balance with available and locked amounts
 */
export async function fetchBalance({
  credentials,
}: {
  credentials: ClobCredentials
}): Promise<BalanceResponse> {
  const path = `${CLOB_PREFIX}/balances`
  const headers = await withL2Auth({
    apiKey: credentials.apiKey,
    passphrase: credentials.passphrase,
    secret: credentials.secret,
    address: credentials.walletAddress,
    method: 'GET',
    path,
    body: '',
  })
  
  const response = await apiFetch(path, { method: 'GET', headers })
  const result = await response.json()
  
  if (!response.ok) {
    return {
      success: false,
      error: result.error || { code: 'FETCH_FAILED', message: 'Failed to fetch balance' },
    }
  }
  
  return result
}

/**
 * Record a deposit (after on-chain transaction)
 * 
 * @param credentials - CLOB API credentials
 * @param amount - Amount deposited (in lamports)
 * @param transactionSignature - On-chain transaction signature
 * @returns New balance after deposit
 */
export async function recordDeposit({
  credentials,
  amount,
  transactionSignature,
}: {
  credentials: ClobCredentials
  amount: string | number
  transactionSignature: string
}): Promise<{ success: boolean; data?: { newBalance: string }; error?: { code: string; message: string } }> {
  const body = JSON.stringify({ amount: amount.toString(), transactionSignature })
  const path = `${CLOB_PREFIX}/balances/deposit`
  const headers = await withL2Auth({
    apiKey: credentials.apiKey,
    passphrase: credentials.passphrase,
    secret: credentials.secret,
    address: credentials.walletAddress,
    method: 'POST',
    path,
    body,
  })
  
  const response = await apiFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body,
  })
  
  const result = await response.json()
  
  if (!response.ok) {
    return {
      success: false,
      error: result.error || { code: 'DEPOSIT_FAILED', message: 'Failed to record deposit' },
    }
  }
  
  return result
}

// AUDIT FIX: requestWithdrawal removed
// Users withdraw directly via Phantom wallet - no CLOB withdrawal needed
