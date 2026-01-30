/**
 * Shared Formatting Functions
 * AUDIT FIX v2.1: Centralized formatting utilities
 * 
 * Consolidates duplicate implementations for consistent
 * formatting across frontend and backend
 */

import { USDC_SCALE, PRICE_SCALE } from './utils.js';

// ============================================
// USDC Formatting
// ============================================

/**
 * Format USDC lamports to human-readable string
 * 
 * @param lamports - Amount in USDC lamports (1 USDC = 1,000,000 lamports)
 * @param options - Formatting options
 * @returns Formatted string
 * 
 * @example
 * formatUsdc(1000000)        // "1.00"
 * formatUsdc(123456789)      // "123.46"
 * formatUsdc(1234567890123)  // "1.23M"
 */
export function formatUsdc(
  lamports: number | bigint | null | undefined,
  options: {
    minDecimals?: number;
    maxDecimals?: number;
    compact?: boolean;
  } = {}
): string {
  const {
    minDecimals = 2,
    maxDecimals = 6,
    compact = false,
  } = options;

  const amount = Number(lamports ?? 0) / USDC_SCALE;

  if (compact) {
    if (amount >= 1_000_000) {
      return `${(amount / 1_000_000).toFixed(2)}M`;
    }
    if (amount >= 1_000) {
      return `${(amount / 1_000).toFixed(2)}K`;
    }
  }

  return amount.toLocaleString(undefined, {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  });
}

/**
 * Format USDC with currency symbol
 */
export function formatUsdcWithSymbol(
  lamports: number | bigint | null | undefined,
  options: { compact?: boolean } = {}
): string {
  return `$${formatUsdc(lamports, options)}`;
}

// ============================================
// Price Formatting
// ============================================

/**
 * Format a price (0.0 to 1.0) as percentage
 * 
 * @param price - Price value (0.0 to 1.0)
 * @param decimals - Decimal places
 * @returns Formatted percentage string
 * 
 * @example
 * formatPrice(0.75)   // "75.00%"
 * formatPrice(0.123)  // "12.30%"
 */
export function formatPrice(price: number | null | undefined, decimals: number = 2): string {
  const value = price ?? 0;
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format a price as decimal (e.g., for YES/NO tokens)
 * 
 * @param price - Price value (0.0 to 1.0)
 * @returns Formatted decimal string
 * 
 * @example
 * formatPriceDecimal(0.75)  // "0.75"
 */
export function formatPriceDecimal(price: number | null | undefined, decimals: number = 2): string {
  const value = price ?? 0;
  return value.toFixed(decimals);
}

/**
 * Format probability (same as price but explicitly for probabilities)
 */
export function formatProbability(probability: number | null | undefined): string {
  return formatPrice(probability);
}

// ============================================
// Date/Time Formatting
// ============================================

/**
 * Format a date to ISO string
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString();
}

/**
 * Format a date to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  
  return formatDateTime(d);
}

/**
 * Format date for display (short format)
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString();
}

// ============================================
// Number Formatting
// ============================================

/**
 * Format a large number with compact notation
 * 
 * @example
 * formatCompact(1234567)  // "1.23M"
 * formatCompact(12345)    // "12.35K"
 * formatCompact(123)      // "123"
 */
export function formatCompact(value: number | null | undefined): string {
  const num = value ?? 0;
  
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`;
  }
  
  return num.toLocaleString();
}

/**
 * Format a number with specific decimal places
 */
export function formatNumber(
  value: number | null | undefined,
  decimals: number = 2
): string {
  const num = value ?? 0;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ============================================
// Address Formatting
// ============================================

/**
 * Truncate a Solana address for display
 * 
 * @example
 * truncateAddress("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")
 * // "7xKX...AsU"
 */
export function truncateAddress(
  address: string | null | undefined,
  prefixLength: number = 4,
  suffixLength: number = 4
): string {
  if (!address) return '-';
  if (address.length <= prefixLength + suffixLength + 3) return address;
  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`;
}
