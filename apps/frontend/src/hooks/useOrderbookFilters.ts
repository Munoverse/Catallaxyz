/**
 * useOrderbookFilters Hook
 * Provides memoized filtering of orderbook data into bids and asks
 * 
 * AUDIT FIX F-A6, F-44: Extracted from TradingPanel, OrderbookView, ProbabilityChart
 */

import { useMemo } from 'react';

// Define proper types for orderbook rows
export interface OrderbookRow {
  side: 'buy' | 'sell';
  price: number;
  total_amount?: number;
  total?: number;
  size?: number;
  [key: string]: unknown;
}

export interface FilteredOrderbook {
  bids: OrderbookRow[];
  asks: OrderbookRow[];
  maxTotal: number;
  midPrice: number | null;
  spread: number | null;
}

/**
 * Filter orderbook into bids and asks with computed statistics
 * 
 * @param orderbook - Raw orderbook data array
 * @returns Filtered and computed orderbook data
 */
export function useOrderbookFilters(orderbook: OrderbookRow[] | null | undefined): FilteredOrderbook {
  return useMemo(() => {
    if (!orderbook || orderbook.length === 0) {
      return {
        bids: [],
        asks: [],
        maxTotal: 1,
        midPrice: null,
        spread: null,
      };
    }

    const bids = orderbook.filter((row) => row.side === 'buy');
    const asks = orderbook.filter((row) => row.side === 'sell');

    // Calculate max total for depth visualization
    const maxTotal = Math.max(
      1,
      ...bids.map((b) => b.total_amount || b.total || 0),
      ...asks.map((a) => a.total_amount || a.total || 0)
    );

    // Calculate mid price and spread if both sides have orders
    let midPrice: number | null = null;
    let spread: number | null = null;

    if (bids.length > 0 && asks.length > 0) {
      const bestBid = Math.max(...bids.map((b) => b.price));
      const bestAsk = Math.min(...asks.map((a) => a.price));
      
      if (bestBid > 0 && bestAsk > 0 && bestAsk >= bestBid) {
        midPrice = (bestBid + bestAsk) / 2;
        spread = bestAsk - bestBid;
      }
    }

    return {
      bids,
      asks,
      maxTotal,
      midPrice,
      spread,
    };
  }, [orderbook]);
}

/**
 * Get depth percentage for visualization
 * 
 * @param total - Row total amount
 * @param maxTotal - Maximum total in orderbook
 * @returns Percentage string (0-100)
 */
export function getDepthPercentage(total: number, maxTotal: number): string {
  if (maxTotal <= 0) return '0';
  return Math.min(100, (total / maxTotal) * 100).toFixed(1);
}

/**
 * Format price for display
 * 
 * @param price - Price value (0-1 range)
 * @param decimals - Number of decimal places
 * @returns Formatted price string
 */
export function formatOrderbookPrice(price: number, decimals = 2): string {
  return price.toFixed(decimals);
}

/**
 * Format size/amount for display
 * 
 * @param amount - Amount in smallest units
 * @param decimals - USDC decimals (default 6)
 * @returns Formatted amount string
 */
export function formatOrderbookSize(amount: number, decimals = 6): string {
  return (amount / Math.pow(10, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default useOrderbookFilters;
