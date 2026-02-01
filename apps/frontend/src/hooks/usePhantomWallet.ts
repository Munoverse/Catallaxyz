'use client'

/**
 * Phantom Wallet Hook
 * 
 * Convenience hook that wraps Phantom SDK hooks and provides
 * commonly needed values like PublicKey object.
 * 
 * Usage:
 * const { publicKey, isConnected, solana, isEmbeddedWallet } = usePhantomWallet()
 */

import { useMemo } from 'react'
import { usePhantom, useSolana, AddressType } from '@phantom/react-sdk'
import { PublicKey } from '@solana/web3.js'

/**
 * Wallet provider types
 * - 'embedded': OAuth login (Google, Apple) - managed by Phantom
 * - 'injected': Browser extension - user's own wallet with SOL for gas
 * - 'deeplink': Mobile app connection
 * - 'unknown': Provider type could not be determined
 */
export type WalletProviderType = 'embedded' | 'injected' | 'deeplink' | 'unknown'

export interface PhantomWalletState {
  // Connection state
  isConnected: boolean
  isLoading: boolean
  
  // Wallet info
  publicKey: PublicKey | null
  walletAddress: string | null
  
  // Wallet type detection
  providerType: WalletProviderType
  isEmbeddedWallet: boolean
  
  // Solana operations (from useSolana)
  solana: ReturnType<typeof useSolana>['solana']
  isSolanaAvailable: boolean
}

export function usePhantomWallet(): PhantomWalletState {
  const { isConnected, isLoading, addresses } = usePhantom()
  const { solana, isAvailable: isSolanaAvailable } = useSolana()

  // Get Solana address from addresses array
  const walletAddress = useMemo(() => {
    if (!addresses || addresses.length === 0) return null
    const solanaAddress = addresses.find(a => a.addressType === AddressType.solana)
    return solanaAddress?.address ?? null
  }, [addresses])

  // Convert to PublicKey object
  const publicKey = useMemo(() => {
    if (!walletAddress) return null
    try {
      return new PublicKey(walletAddress)
    } catch {
      return null
    }
  }, [walletAddress])

  // Determine the wallet provider type
  // Embedded wallets are created via OAuth (Google/Apple)
  // Injected wallets are browser extensions that require SOL for gas
  const providerType = useMemo((): WalletProviderType => {
    if (!isConnected) return 'unknown'

    // Check if window.phantom exists (indicates extension is being used)
    // If we're connected but no extension is detected, it's likely embedded
    if (typeof window !== 'undefined') {
      const hasExtension = !!(window as any)?.phantom?.solana?.isPhantom
      if (hasExtension && (window as any)?.phantom?.solana?.publicKey) {
        // Extension is installed and has a connected account
        return 'injected'
      }
    }

    // Default to embedded for OAuth connections
    return 'embedded'
  }, [isConnected])

  // Convenience flag: true if using an embedded wallet
  const isEmbeddedWallet = providerType === 'embedded'

  return {
    isConnected,
    isLoading,
    publicKey,
    walletAddress,
    providerType,
    isEmbeddedWallet,
    solana,
    isSolanaAvailable,
  }
}

export default usePhantomWallet
