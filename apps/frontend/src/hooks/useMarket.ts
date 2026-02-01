/**
 * useMarket Hook
 * Fetches a single market by ID with proper cleanup
 * 
 * AUDIT FIX HIGH-6: Added AbortController for request cancellation
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Market } from '@/types';
import { apiFetch } from '@/lib/api-client';

export function useMarket(marketId: string | null) {
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchMarket = useCallback(async (signal?: AbortSignal) => {
    if (!marketId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(`/api/markets/${marketId}`, { signal });
      
      // Check if request was aborted
      if (signal?.aborted) return;
      
      if (!response.ok) {
        throw new Error('Failed to fetch market');
      }

      const data = await response.json();
      const marketData = data?.data?.market ?? data?.market ?? null;
      setMarket(marketData);
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
    
    fetchMarket(abortControllerRef.current.signal);

    // Cleanup on unmount or marketId change
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [marketId, fetchMarket]);

  const refetch = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    return fetchMarket(abortControllerRef.current.signal);
  }, [fetchMarket]);

  return { market, loading, error, refetch };
}
