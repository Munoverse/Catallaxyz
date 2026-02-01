'use client'

/**
 * Gas Payment Hook (Simplified)
 * 
 * All users pay gas fees with SOL directly.
 * This hook is kept for backward compatibility but the token selection
 * features have been removed since Kora is no longer used.
 * 
 * Usage:
 * const { isLoading } = useGasPayment()
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { getConnection } from '@/lib/solana-connection'

export interface GasPaymentToken {
  mint: string
  symbol: string
  name: string
  decimals: number
  logoUrl?: string
  balance: number
  balanceLamports: bigint
  isSupported: boolean
  hasBalance: boolean
}

export interface GasPaymentState {
  // SOL balance for gas
  solBalance: number
  hasSufficientSol: boolean
  
  // Legacy properties for backward compatibility
  supportedTokens: GasPaymentToken[]
  userTokens: GasPaymentToken[]
  selectedToken: GasPaymentToken | null
  selectedMint: string | null
  selectToken: (mint: string) => void
  refreshBalances: () => Promise<void>
  
  // State
  isLoading: boolean
  isKoraEnabled: boolean // Always false now
  isEmbeddedWallet: boolean
  error: string | null
}

const MIN_SOL_FOR_GAS = 0.001 // Minimum SOL needed for gas

export function useGasPayment(): GasPaymentState {
  const { publicKey, isConnected, isEmbeddedWallet } = usePhantomWallet()
  const connection = getConnection()
  
  const [solBalance, setSolBalance] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refresh SOL balance
  const refreshBalances = useCallback(async () => {
    if (!isConnected || !publicKey) {
      setSolBalance(0)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const balance = await connection.getBalance(publicKey)
      setSolBalance(balance / LAMPORTS_PER_SOL)
    } catch (err) {
      console.error('Failed to fetch SOL balance:', err)
      setError(err instanceof Error ? err.message : 'Failed to load balance')
    } finally {
      setIsLoading(false)
    }
  }, [isConnected, publicKey, connection])

  // Refresh on mount and when wallet changes
  useEffect(() => {
    if (isConnected && publicKey) {
      refreshBalances()
    }
  }, [isConnected, publicKey, refreshBalances])

  const hasSufficientSol = solBalance >= MIN_SOL_FOR_GAS

  // Create a SOL token entry for backward compatibility
  const solToken: GasPaymentToken = useMemo(() => ({
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logoUrl: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    balance: solBalance,
    balanceLamports: BigInt(Math.floor(solBalance * LAMPORTS_PER_SOL)),
    isSupported: true,
    hasBalance: solBalance > 0,
  }), [solBalance])

  // Legacy selectToken function (no-op now)
  const selectToken = useCallback((_mint: string) => {
    // No-op: SOL is always used for gas now
  }, [])

  return {
    solBalance,
    hasSufficientSol,
    
    // Legacy properties for backward compatibility
    supportedTokens: [solToken],
    userTokens: solToken.hasBalance ? [solToken] : [],
    selectedToken: solToken,
    selectedMint: solToken.mint,
    selectToken,
    refreshBalances,
    
    isLoading,
    isKoraEnabled: false, // Kora is disabled
    isEmbeddedWallet,
    error,
  }
}

export default useGasPayment
