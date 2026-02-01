'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePhantom, useDisconnect } from '@phantom/react-sdk';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { apiFetch } from '@/lib/api-client';
import { buildWalletAuthHeaders } from '@/lib/wallet-auth';

export interface User {
  id: string;
  walletAddress: string;
  username?: string;
  usernameVerified: boolean;
  email?: string;
  twitterHandle?: string;
  avatarUrl?: string;
  bio?: string;
  
  // Stats
  totalMarketsCreated: number;
  totalTrades: number;
  totalVolume: bigint;
  totalProfitLoss: bigint;
  biggestWin: bigint;
  totalPredictions: number;
  
  // Balances
  usdcBalance: bigint;
  lastBalanceUpdate?: string;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface UserStats {
  realizedPnl: bigint;
  unrealizedPnl: bigint;
  totalPnl: bigint;
  totalPositionValue: bigint;
  marketsParticipated: number;
  activePositions: number;
}

/**
 * Hook to manage user state and authentication with Phantom wallet
 */
export function useUser() {
  const { isConnected, isLoading: connecting } = usePhantom();
  const { publicKey, walletAddress, solana } = usePhantomWallet();
  const { disconnect } = useDisconnect();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adapter for signMessage to match buildWalletAuthHeaders expected signature
  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    if (!solana) throw new Error('Solana not available');
    const messageString = new TextDecoder().decode(message);
    const result = await solana.signMessage(messageString);
    return result.signature;
  }, [solana]);

  // Get wallet address from connected wallet
  const getWalletAddress = useCallback(() => {
    if (!walletAddress || !isConnected) {
      return null;
    }
    return walletAddress;
  }, [walletAddress, isConnected]);

  // Fetch user data from database
  const fetchUser = useCallback(async () => {
    const address = getWalletAddress();
    
    if (!address || !solana) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Build auth headers using wallet signature
      const authHeaders = await buildWalletAuthHeaders({ walletAddress: address, signMessage });

      const response = await apiFetch('/api/users/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          walletAddress: address,
        }),
      });

      const result = await response.json();

      if (result.success) {
        const userData = result.data;
        
        // Check if user needs to set username
        if (!userData.username) {
          setNeedsUsername(true);
          setUser(null);
        } else {
          setNeedsUsername(false);
          setUser({
            id: userData.id,
            walletAddress: userData.walletAddress,
            username: userData.username,
            usernameVerified: userData.usernameVerified || false,
            email: userData.email,
            twitterHandle: userData.twitterHandle,
            avatarUrl: userData.avatarUrl,
            bio: userData.bio,
            totalMarketsCreated: userData.totalMarketsCreated || 0,
            totalTrades: userData.totalTrades || 0,
            totalVolume: BigInt(userData.totalVolume || 0),
            totalProfitLoss: BigInt(userData.totalProfitLoss || 0),
            biggestWin: BigInt(userData.biggestWin || 0),
            totalPredictions: userData.totalPredictions || 0,
            usdcBalance: BigInt(userData.usdcBalance || 0),
            lastBalanceUpdate: userData.lastBalanceUpdate,
            createdAt: userData.createdAt,
            updatedAt: userData.updatedAt,
            lastLoginAt: userData.lastLoginAt,
          });
        }
      } else {
        setError(result.error?.message || 'Failed to fetch user');
      }
    } catch (err: any) {
      console.error('Error fetching user:', err);
      setError(err.message || 'Failed to fetch user');
    } finally {
      setLoading(false);
    }
  }, [getWalletAddress, solana, signMessage]);

  // Fetch user data when wallet connection changes
  useEffect(() => {
    if (isConnected && !connecting) {
      fetchUser();
    } else if (!isConnected && !connecting) {
      setUser(null);
      setNeedsUsername(false);
      setLoading(false);
    }
  }, [isConnected, connecting, fetchUser]);

  // Register username after dialog completion
  const completeUsernameRegistration = useCallback(async (username: string) => {
    const address = getWalletAddress();
    if (!address || !solana) return;

    try {
      const authHeaders = await buildWalletAuthHeaders({ walletAddress: address, signMessage });

      const response = await apiFetch('/api/users/register-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ walletAddress: address, username }),
      });

      const result = await response.json();

      if (result.success) {
        setNeedsUsername(false);
        // Refresh user data
        await fetchUser();
      } else {
        throw new Error(result.error?.message || 'Failed to register username');
      }
    } catch (err: any) {
      console.error('Error registering username:', err);
      throw err;
    }
  }, [getWalletAddress, fetchUser, solana, signMessage]);

  // Update user data
  const updateUser = useCallback(async (updates: Partial<User>) => {
    if (!user || !solana) return;

    try {
      const authHeaders = await buildWalletAuthHeaders({ 
        walletAddress: user.walletAddress, 
        signMessage 
      });

      const response = await apiFetch(`/api/users/${user.walletAddress}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(updates),
      });

      const result = await response.json();

      if (result.success) {
        await fetchUser();
      } else {
        throw new Error(result.error?.message || 'Failed to update user');
      }
    } catch (err: any) {
      console.error('Error updating user:', err);
      throw err;
    }
  }, [user, fetchUser, solana, signMessage]);

  // Get user stats
  const getUserStats = useCallback(async (): Promise<UserStats | null> => {
    if (!user) return null;

    try {
      const response = await apiFetch(`/api/users/${user.walletAddress}/stats`);
      const result = await response.json();

      if (result.success) {
        return {
          realizedPnl: BigInt(result.data.realizedPnl || 0),
          unrealizedPnl: BigInt(result.data.unrealizedPnl || 0),
          totalPnl: BigInt(result.data.totalPnl || 0),
          totalPositionValue: BigInt(result.data.totalPositionValue || 0),
          marketsParticipated: result.data.marketsParticipated || 0,
          activePositions: result.data.activePositions || 0,
        };
      }

      return null;
    } catch (err) {
      console.error('Error fetching user stats:', err);
      return null;
    }
  }, [user]);

  return {
    // Auth state
    connected: isConnected,
    connecting,
    publicKey,
    
    // User data
    user,
    loading,
    needsUsername,
    error,
    
    // Actions
    disconnect,
    refreshUser: fetchUser,
    completeUsernameRegistration,
    updateUser,
    getUserStats,
    getWalletAddress,
  };
}

