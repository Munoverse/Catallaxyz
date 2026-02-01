'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { apiFetch } from '@/lib/api-client';
import { buildWalletAuthHeaders } from '@/lib/wallet-auth';

export interface FavoriteMarket {
  marketId: string;
  createdAt: string;
  market?: {
    id: string;
    title: string;
    question?: string;
    status?: string;
    category?: string;
    tip_amount?: string | number | null;
    total_volume?: number | string | null;
    participants_count?: number | null;
    created_at?: string;
  } | null;
}

export function useFavorites() {
  const { publicKey, isConnected, walletAddress, solana } = usePhantomWallet();
  const [favorites, setFavorites] = useState<FavoriteMarket[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Adapter for signMessage to match buildWalletAuthHeaders expected signature
  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    if (!solana) throw new Error('Solana not available');
    const messageString = new TextDecoder().decode(message);
    const result = await solana.signMessage(messageString);
    return result.signature;
  }, [solana]);

  const fetchFavorites = useCallback(async () => {
    if (!walletAddress) {
      setFavorites([]);
      setFavoriteIds(new Set());
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch(`/api/favorites?walletAddress=${walletAddress}`);
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message || 'Failed to load favorites');
      }
      const rows = payload?.data?.favorites || [];
      setFavorites(rows);
      setFavoriteIds(new Set(rows.map((row: FavoriteMarket) => row.marketId)));
    } catch (error) {
      console.error('Failed to fetch favorites:', error);
      setFavorites([]);
      setFavoriteIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  const buildAuthHeaders = useCallback(async () => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }
    if (!solana) {
      throw new Error('Wallet does not support message signing');
    }
    return buildWalletAuthHeaders({
      walletAddress,
      signMessage,
    });
  }, [walletAddress, solana, signMessage]);

  const toggleFavorite = useCallback(
    async (marketId: string) => {
      if (!walletAddress || !isConnected) {
        throw new Error('Wallet not connected');
      }

      const headers = await buildAuthHeaders();
      const isFavorite = favoriteIds.has(marketId);
      const method = isFavorite ? 'DELETE' : 'POST';
      const response = await apiFetch('/api/favorites', {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          walletAddress,
          marketId,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message || 'Failed to update favorite');
      }

      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFavorite) {
          next.delete(marketId);
        } else {
          next.add(marketId);
        }
        return next;
      });

      if (isFavorite) {
        setFavorites((prev) => prev.filter((item) => item.marketId !== marketId));
      }
    },
    [walletAddress, isConnected, favoriteIds, buildAuthHeaders]
  );

  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchFavorites();
    } else {
      setFavorites([]);
      setFavoriteIds(new Set());
    }
  }, [isConnected, walletAddress, fetchFavorites]);

  return {
    favorites,
    favoriteIds,
    loading,
    toggleFavorite,
    refetch: fetchFavorites,
  };
}
