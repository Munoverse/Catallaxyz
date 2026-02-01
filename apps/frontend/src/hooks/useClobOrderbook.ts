'use client'

/**
 * useClobOrderbook Hook
 * Manages CLOB orderbook interactions with proper credentials handling
 * 
 * AUDIT FIX: Added proper TypeScript types and balance management
 * AUDIT FIX P2-1: Use centralized credential storage utility
 * 
 * EXCHANGE INTEGRATION: Now uses Ed25519 signed orders for on-chain settlement
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import {
  createOrDeriveApiKey,
  cancelOrder,
  cancelAllOrders,
  fetchOrderbook,
  fetchOrders,
  fetchTrades,
  fetchBalance,
  type ClobCredentials,
  type OrderParams,
  type OrderInfo,
  type OrderbookRow,
  type TradeInfo,
} from '@/lib/clob-client'
// Note: placeOrder removed - now using signed orders via ExchangeClient
import {
  getStoredCredentials,
  setStoredCredentials,
  clearStoredCredentials,
} from '@/lib/credentials'
import { logger } from '@/lib/frontend-logger'
import { OrderBuilder, type CreateOrderParams } from '@/lib/exchange/order-builder'
import { createExchangeClient } from '@/lib/exchange/exchange-client'
import type { WalletSignMessageAdapter } from '@/lib/exchange/order-signing'

export interface ClobBalance {
  usdcAvailable: string
  usdcLocked: string
  yesAvailable: string
  yesLocked: string
  noAvailable: string
  noLocked: string
}

export function useClobOrderbook(marketId: string | null, outcomeType: 'yes' | 'no') {
  const { publicKey, isConnected, walletAddress, solana } = usePhantomWallet()
  const [orderbook, setOrderbook] = useState<OrderbookRow[] | null>(null)
  const [orders, setOrders] = useState<OrderInfo[]>([])
  const [trades, setTrades] = useState<TradeInfo[]>([])
  const [balance, setBalance] = useState<ClobBalance | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Adapter for signMessage to match createOrDeriveApiKey expected signature
  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    if (!solana) throw new Error('Solana not available')
    const messageString = new TextDecoder().decode(message)
    const result = await solana.signMessage(messageString)
    return result.signature
  }, [solana])

  // Exchange client for signed order submission
  const exchangeClient = useMemo(() => createExchangeClient(), [])

  // Wallet adapter for order signing (matches WalletSignMessageAdapter interface)
  const walletAdapter = useMemo((): WalletSignMessageAdapter => ({
    publicKey: publicKey ? new PublicKey(publicKey.toString()) : null,
    signMessage: solana ? async (message: Uint8Array) => {
      // For order signing, we sign the raw bytes (order hash)
      // Phantom's signMessage expects a string, but we need to sign raw bytes
      // Use base64 encoding to preserve the bytes
      const base64Message = btoa(String.fromCharCode(...message))
      const result = await solana.signMessage(base64Message)
      return result.signature
    } : undefined,
  }), [publicKey, solana])

  // Order builder for creating signed orders
  const orderBuilder = useMemo(() => {
    if (!walletAdapter.publicKey) return null
    return new OrderBuilder(walletAdapter)
  }, [walletAdapter])

  // Get stored credentials, memoized to avoid re-reading on every render
  const storedCredentials = useMemo(() => getStoredCredentials(), [])
  
  // Check if credentials match current wallet
  const credentials = useMemo(() => {
    if (!walletAddress) return null
    if (storedCredentials?.walletAddress === walletAddress) {
      return storedCredentials
    }
    return null
  }, [storedCredentials, walletAddress])

  // Ensure user has valid credentials
  const ensureCredentials = useCallback(async (): Promise<ClobCredentials> => {
    if (credentials) {
      setIsAuthenticated(true)
      return credentials
    }
    
    if (!walletAddress || !solana) {
      throw new Error('Wallet does not support message signing')
    }
    
    const data = await createOrDeriveApiKey({
      walletAddress,
      signMessage,
      signatureType: 1,
      funderAddress: walletAddress,
    })
    
    setStoredCredentials(data)
    setIsAuthenticated(true)
    return data
  }, [credentials, walletAddress, solana, signMessage])

  // Clear credentials on wallet disconnect
  useEffect(() => {
    if (!isConnected) {
      setIsAuthenticated(false)
      setOrders([])
      setBalance(null)
    }
  }, [isConnected])

  const refreshOrderbook = useCallback(async () => {
    if (!marketId) return
    setLoading(true)
    setError(null)
    
    try {
      const result = await fetchOrderbook(marketId, outcomeType)
      if (result.success && result.data) {
        // Combine bids and asks into a single array for the orderbook display
        const combined = [
          ...(result.data.bids || []).map(row => ({ ...row, side: 'buy' as const })),
          ...(result.data.asks || []).map(row => ({ ...row, side: 'sell' as const })),
        ]
        setOrderbook(combined)
      } else {
        setError(result.error?.message || 'Failed to fetch orderbook')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [marketId, outcomeType])

  const refreshOrders = useCallback(async () => {
    if (!marketId) return
    setLoading(true)
    setError(null)
    
    try {
      const creds = await ensureCredentials()
      const result = await fetchOrders({ credentials: creds, marketId })
      if (result.success && result.data) {
        setOrders(result.data)
      } else {
        setError(result.error?.message || 'Failed to fetch orders')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [ensureCredentials, marketId])

  const refreshTrades = useCallback(async () => {
    if (!marketId) return
    setLoading(true)
    setError(null)
    
    try {
      const result = await fetchTrades(marketId)
      if (result.success && result.data) {
        setTrades(result.data)
      } else {
        setError(result.error?.message || 'Failed to fetch trades')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [marketId])

  const refreshBalance = useCallback(async () => {
    try {
      const creds = await ensureCredentials()
      const result = await fetchBalance({ credentials: creds })
      if (result.success && result.data) {
        setBalance({
          usdcAvailable: result.data.usdcAvailable,
          usdcLocked: result.data.usdcLocked,
          yesAvailable: result.data.yesAvailable,
          yesLocked: result.data.yesLocked,
          noAvailable: result.data.noAvailable,
          noLocked: result.data.noLocked,
        })
      }
    } catch (err) {
      // Balance fetch failure is not critical, don't set error
      logger.warn('useClobOrderbook', 'Failed to fetch balance', err)
    }
  }, [ensureCredentials])

  /**
   * Submit an order using Ed25519 signed orders for on-chain settlement.
   * 
   * @param order - Order parameters including marketAddress for on-chain market
   * @returns Result with orderHash for tracking
   */
  const submitOrder = useCallback(
    async (order: OrderParams & { marketAddress?: string }) => {
      // Ensure we have credentials for API authentication
      await ensureCredentials()
      
      // Check if we have the exchange infrastructure ready
      if (!orderBuilder || !walletAdapter.publicKey) {
        // Fallback to legacy CLOB order if exchange not ready
        logger.warn('useClobOrderbook', 'Exchange not ready, wallet not connected')
        return {
          success: false,
          error: { code: 'WALLET_NOT_READY', message: 'Wallet not connected for order signing' },
        }
      }

      // If no marketAddress provided, we can't create a signed order
      // The marketAddress should be the on-chain market PDA
      if (!order.marketAddress) {
        logger.warn('useClobOrderbook', 'No marketAddress provided, cannot create signed order')
        return {
          success: false,
          error: { code: 'MISSING_MARKET_ADDRESS', message: 'Market on-chain address required for signed orders' },
        }
      }

      try {
        // 1. Fetch current nonce from the exchange
        const nonceResult = await exchangeClient.getNonce()
        if (!nonceResult.success || !nonceResult.data) {
          logger.error('useClobOrderbook', 'Failed to fetch nonce', nonceResult.error)
          return {
            success: false,
            error: nonceResult.error || { code: 'NONCE_FETCH_FAILED', message: 'Failed to fetch nonce' },
          }
        }
        const nonce = BigInt(nonceResult.data.nonce)

        // 2. Create order parameters for the OrderBuilder
        const createOrderParams: CreateOrderParams = {
          market: new PublicKey(order.marketAddress),
          outcome: order.outcomeType,
          side: order.side,
          price: order.price || 0.5, // Default to 0.5 for market orders
          size: typeof order.amount === 'string' ? parseFloat(order.amount) / 1_000_000 : order.amount / 1_000_000, // Convert from lamports to units
          nonce,
          feeRateBps: 0, // Platform handles fees
          expiration: Math.floor(Date.now() / 1000) + 86400, // 24 hour expiration
        }

        // 3. Create and sign the order
        logger.info('useClobOrderbook', 'Creating signed order', { 
          market: order.marketAddress,
          outcome: order.outcomeType,
          side: order.side,
          price: createOrderParams.price,
          size: createOrderParams.size,
        })

        const signedOrder = await orderBuilder.createSignedOrder(createOrderParams)

        // 4. Submit the signed order to the exchange
        const submitResult = await exchangeClient.submitOrder(signedOrder)

        if (submitResult.success) {
          logger.info('useClobOrderbook', 'Signed order submitted', { 
            orderHash: submitResult.data?.orderHash,
          })
          
          // Refresh data after successful submission
          void refreshOrderbook()
          void refreshOrders()
          void refreshBalance()
        } else {
          logger.error('useClobOrderbook', 'Failed to submit signed order', submitResult.error)
        }

        return submitResult
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create signed order'
        logger.error('useClobOrderbook', 'Error in submitOrder', err)
        return {
          success: false,
          error: { code: 'ORDER_SIGNING_FAILED', message },
        }
      }
    },
    [ensureCredentials, orderBuilder, walletAdapter.publicKey, exchangeClient, refreshOrderbook, refreshOrders, refreshBalance]
  )

  const cancel = useCallback(
    async (orderId: string) => {
      const creds = await ensureCredentials()
      const result = await cancelOrder({ credentials: creds, orderId })
      
      // Refresh orders after cancellation
      if (result.success) {
        void refreshOrders()
        void refreshBalance()
      }
      
      return result
    },
    [ensureCredentials, refreshOrders, refreshBalance]
  )

  const cancelAll = useCallback(
    async () => {
      if (!marketId) throw new Error('Market ID required')
      
      const creds = await ensureCredentials()
      const result = await cancelAllOrders({ 
        credentials: creds, 
        marketId,
        outcomeType,
      })
      
      // Refresh orders after cancellation
      if (result.success) {
        void refreshOrders()
        void refreshBalance()
      }
      
      return result
    },
    [ensureCredentials, marketId, outcomeType, refreshOrders, refreshBalance]
  )

  // Logout / clear credentials
  const logout = useCallback(() => {
    clearStoredCredentials()
    setIsAuthenticated(false)
    setOrders([])
    setBalance(null)
  }, [])

  // Initial data fetch
  useEffect(() => {
    void refreshOrderbook()
    void refreshTrades()
  }, [refreshOrderbook, refreshTrades])

  // Fetch balance when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      void refreshBalance()
    }
  }, [isAuthenticated, refreshBalance])

  return {
    // Data
    orderbook,
    orders,
    trades,
    balance,
    
    // State
    loading,
    error,
    isAuthenticated,
    
    // Actions
    refreshOrderbook,
    refreshOrders,
    refreshTrades,
    refreshBalance,
    submitOrder,
    cancelOrder: cancel,
    cancelAllOrders: cancelAll,
    logout,
    
    // Auth
    ensureCredentials,
  }
}
