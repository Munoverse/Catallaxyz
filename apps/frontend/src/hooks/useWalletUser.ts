'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { apiFetch } from '@/lib/api-client'
import { buildWalletAuthHeaders } from '@/lib/wallet-auth'

interface User {
  id: string
  username: string
  walletAddress: string
  displayName?: string
  avatarUrl?: string
  bio?: string
  twitterHandle?: string
  emailAddress?: string
  createdAt: string
}

interface UseWalletUserReturn {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
  refetchUser: () => Promise<void>
  updateUser: (updates: Partial<User>) => Promise<void>
}

/**
 * Hook to manage wallet-based user authentication and data
 * Uses Phantom wallet for authentication
 */
export function useWalletUser(): UseWalletUserReturn {
  const { publicKey, isConnected, walletAddress, solana } = usePhantomWallet()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Adapter for signMessage to match buildWalletAuthHeaders expected signature
  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    if (!solana) throw new Error('Solana not available')
    const messageString = new TextDecoder().decode(message)
    const result = await solana.signMessage(messageString)
    return result.signature
  }, [solana])

  // Fetch user data from database
  const fetchUser = useCallback(async () => {
    if (!isConnected || !walletAddress) {
      setUser(null)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Check if user exists in database
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      
      if (!solana) {
        throw new Error('Wallet does not support message signing')
      }
      const authHeaders = await buildWalletAuthHeaders({ walletAddress, signMessage })
      Object.assign(headers, authHeaders)

      const response = await apiFetch('/api/users/by-wallet', {
        method: 'POST',
        headers,
        body: JSON.stringify({ walletAddress }),
      })

      if (!response.ok) {
        if (response.status === 404) {
          // User doesn't exist - they need to set up username
          setUser(null)
          setError('username_required')
          return
        }
        throw new Error('Failed to fetch user')
      }

      const data = await response.json()
      
      if (data.success && data.user) {
        if (!data.user.username) {
          setUser(null)
          setError('username_required')
          return
        }

        setUser({
          id: data.user.id,
          username: data.user.username,
          walletAddress: data.user.wallet_address,
          displayName: data.user.display_name,
          avatarUrl: data.user.avatar_url,
          bio: data.user.bio,
          twitterHandle: data.user.twitter_handle,
          emailAddress: data.user.email_address,
          createdAt: data.user.created_at,
        })
        setError(null)
      } else {
        setUser(null)
        setError('username_required')
      }
    } catch (err) {
      console.error('Error fetching user:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [walletAddress, isConnected, solana, signMessage])

  // Update user data
  const updateUser = useCallback(async (updates: Partial<User>) => {
    if (!user) {
      throw new Error('No user to update')
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      
      if (!solana) {
        throw new Error('Wallet does not support message signing')
      }
      const authHeaders = await buildWalletAuthHeaders({
        walletAddress: user.walletAddress,
        signMessage,
      })
      Object.assign(headers, authHeaders)

      const response = await apiFetch('/api/users/update', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          walletAddress: user.walletAddress,
          ...updates,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update user')
      }

      const data = await response.json()
      
      if (data.success && data.user) {
        setUser({
          id: data.user.id,
          username: data.user.username,
          walletAddress: data.user.wallet_address,
          displayName: data.user.display_name,
          avatarUrl: data.user.avatar_url,
          bio: data.user.bio,
          twitterHandle: data.user.twitter_handle,
          emailAddress: data.user.email_address,
          createdAt: data.user.created_at,
        })
      }
    } catch (err) {
      console.error('Error updating user:', err)
      throw err
    }
  }, [user, solana, signMessage])

  // Fetch user when wallet connects
  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchUser()
      return
    }

    setUser(null)
    setError(null)
  }, [isConnected, walletAddress, fetchUser])

  return {
    user,
    isLoading,
    isAuthenticated: isConnected && user !== null,
    error,
    refetchUser: fetchUser,
    updateUser,
  }
}
