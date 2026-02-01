/**
 * useMarketTrades Hook
 * Fetches trade history for a market with proper cleanup
 * 
 * AUDIT FIX HIGH-6: Added AbortController for request cancellation
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Trade } from '@/types';
import { apiFetch } from '@/lib/api-client';

export function useMarketTrades(marketId: string | null) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchTrades = useCallback(async (signal?: AbortSignal) => {
    if (!marketId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(`/api/trades?marketId=${marketId}`, { signal });
      
      // Check if request was aborted
      if (signal?.aborted) return;
      
      if (!response.ok) {
        throw new Error('Failed to fetch trades');
      }

      const data = await response.json();
      setTrades(data?.data?.trades || []);
    } catch (err: unknown) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    if (!marketId) {
      setLoading(false);
      return;
    }

    // Cancel any in-flight requests
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    
    fetchTrades(abortControllerRef.current.signal);

    // Cleanup on unmount or marketId change
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [marketId, fetchTrades]);

  const refetch = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    return fetchTrades(abortControllerRef.current.signal);
  }, [fetchTrades]);

  return { trades, loading, error, refetch };
}
