/**
 * useMarkets Hook
 * Fetches markets list with filters and proper cleanup
 * 
 * AUDIT FIX HIGH-6: Added AbortController for request cancellation
 * AUDIT FIX MED-14: Improved filter memoization
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Market } from '@/types';
import { apiFetch } from '@/lib/api-client';

interface MarketsFilters {
  status?: string;
  type?: string;
  sort?: string;
  limit?: number;
}

export function useMarkets(filters?: MarketsFilters) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // AUDIT FIX MED-14: Use individual deps instead of JSON.stringify
  const { status, type, sort, limit } = filters || {};

  const fetchMarkets = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (type) params.append('type', type);
      if (sort) params.append('sort', sort);
      if (limit) params.append('limit', limit.toString());

      const response = await apiFetch(`/api/markets?${params.toString()}`, { signal });
      
      // Check if request was aborted
      if (signal?.aborted) return;
      
      if (!response.ok) {
        throw new Error('Failed to fetch markets');
      }

      const data = await response.json();
      const payload = data?.data?.markets ?? data?.markets ?? [];
      setMarkets(payload);
    } catch (err: unknown) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      setMarkets([]);
    } finally {
      setLoading(false);
    }
  }, [status, type, sort, limit]);

  useEffect(() => {
    // Cancel any in-flight requests
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    
    fetchMarkets(abortControllerRef.current.signal);

    // Cleanup on unmount or filters change
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchMarkets]);

  const refetch = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    return fetchMarkets(abortControllerRef.current.signal);
  }, [fetchMarkets]);

  return { markets, loading, error, refetch };
}
