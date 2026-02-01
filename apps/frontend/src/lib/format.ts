/**
 * Consolidated Formatting Functions
 * AUDIT FIX v2.0.3: Centralized formatting utilities for frontend
 * 
 * This file consolidates all formatting functions to avoid duplication
 * and ensure consistent formatting across the application.
 */

// ============================================
// Constants
// ============================================

export const USDC_DECIMALS = 6
export const USDC_SCALE = 10 ** USDC_DECIMALS
export const PRICE_SCALE = 1_000_000

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
 * formatUsdc(1234567890123, { compact: true })  // "1.23M"
 */
export function formatUsdc(
  lamports: number | bigint | string | null | undefined,
  options: {
    minDecimals?: number
    maxDecimals?: number
    compact?: boolean
    showSymbol?: boolean
  } = {}
): string {
  const {
    minDecimals = 2,
    maxDecimals = 6,
    compact = false,
    showSymbol = false,
  } = options

  const numValue = typeof lamports === 'string' 
    ? parseFloat(lamports) 
    : Number(lamports ?? 0)
  const amount = numValue / USDC_SCALE

  let formatted: string

  if (compact) {
    if (amount >= 1_000_000) {
      formatted = `${(amount / 1_000_000).toFixed(2)}M`
    } else if (amount >= 1_000) {
      formatted = `${(amount / 1_000).toFixed(2)}K`
    } else {
      formatted = amount.toLocaleString(undefined, {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
      })
    }
  } else {
    formatted = amount.toLocaleString(undefined, {
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: maxDecimals,
    })
  }

  return showSymbol ? `$${formatted}` : formatted
}

/**
 * Format USDC with dollar symbol
 */
export function formatUsdcWithSymbol(
  lamports: number | bigint | string | null | undefined,
  options: Omit<Parameters<typeof formatUsdc>[1], 'showSymbol'> = {}
): string {
  return formatUsdc(lamports, { ...options, showSymbol: true })
}

/**
 * Convert lamports to USDC decimal value
 */
export function lamportsToUsdc(lamports: number | bigint | string | null | undefined): number {
  const numValue = typeof lamports === 'string' 
    ? parseFloat(lamports) 
    : Number(lamports ?? 0)
  return numValue / USDC_SCALE
}

/**
 * Convert USDC decimal to lamports
 */
export function usdcToLamports(usdc: number): bigint {
  return BigInt(Math.floor(usdc * USDC_SCALE))
}

// ============================================
// Price Formatting
// ============================================

/**
 * Format a price (0.0 to 1.0) as percentage
 * 
 * @param price - Price value (0.0 to 1.0 or 0-100)
 * @param decimals - Decimal places
 * @returns Formatted percentage string
 * 
 * @example
 * formatPrice(0.75)   // "75.00%"
 * formatPrice(75)     // "75.00%" (auto-detects scale)
 */
export function formatPrice(
  price: number | string | null | undefined,
  decimals: number = 2
): string {
  const numValue = typeof price === 'string' ? parseFloat(price) : (price ?? 0)
  
  // Auto-detect if price is already in percentage form (0-100) or decimal (0-1)
  const percentage = numValue > 1 ? numValue : numValue * 100
  
  return `${percentage.toFixed(decimals)}%`
}

/**
 * Format a price as decimal
 */
export function formatPriceDecimal(
  price: number | string | null | undefined,
  decimals: number = 2
): string {
  const numValue = typeof price === 'string' ? parseFloat(price) : (price ?? 0)
  return numValue.toFixed(decimals)
}

/**
 * Format probability (alias for formatPrice)
 */
export function formatProbability(
  probability: number | string | null | undefined,
  decimals: number = 2
): string {
  return formatPrice(probability, decimals)
}

// ============================================
// Date/Time Formatting
// ============================================

/**
 * Format a date to localized string
 */
export function formatDateTime(
  date: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (!date) return '-'
  
  const d = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date
  
  if (isNaN(d.getTime())) return '-'
  
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  })
}

/**
 * Format date only (no time)
 */
export function formatDate(
  date: Date | string | number | null | undefined
): string {
  if (!date) return '-'
  
  const d = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date
  
  if (isNaN(d.getTime())) return '-'
  
  return d.toLocaleDateString()
}

/**
 * Format a date to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(
  date: Date | string | number | null | undefined
): string {
  if (!date) return '-'
  
  const d = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date
  
  if (isNaN(d.getTime())) return '-'
  
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`
  
  return formatDateTime(d)
}

/**
 * Format time until a future date
 */
export function formatTimeUntil(
  date: Date | string | number | null | undefined
): string {
  if (!date) return '-'
  
  const d = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date
  
  if (isNaN(d.getTime())) return '-'
  
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  
  if (diffMs <= 0) return 'ended'
  
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffDay > 0) return `${diffDay}d ${diffHour % 24}h`
  if (diffHour > 0) return `${diffHour}h ${diffMin % 60}m`
  if (diffMin > 0) return `${diffMin}m`
  return `${diffSec}s`
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
export function formatCompact(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2)}B`
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`
  }
  
  return num.toLocaleString()
}

/**
 * Format a number with specific decimal places
 */
export function formatNumber(
  value: number | string | null | undefined,
  decimals: number = 2
): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Format a number as integer (no decimals)
 */
export function formatInteger(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  return Math.round(num).toLocaleString()
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
  if (!address) return '-'
  if (address.length <= prefixLength + suffixLength + 3) return address
  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`
}

/**
 * Format wallet address for display (alias)
 */
export function formatWalletAddress(
  address: string | null | undefined
): string {
  return truncateAddress(address, 4, 4)
}

// ============================================
// Percent Change Formatting
// ============================================

/**
 * Format a percentage change with + or - sign
 */
export function formatPercentChange(
  value: number | null | undefined,
  decimals: number = 2
): string {
  if (value == null) return '-'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}
