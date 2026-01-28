/**
 * Unified Formatting Functions
 * AUDIT FIX: Centralized formatting to eliminate code duplication
 */

// ============================================
// Constants
// ============================================

export const PRICE_SCALE = 1_000_000;
export const USDC_DECIMALS = 6;

// ============================================
// Price Formatting
// ============================================

/**
 * Format a scaled price (1e6) to human-readable format
 * @param price - Price in scaled format (0-1000000)
 * @param decimals - Number of decimal places (default: 4)
 */
export const formatPrice = (price: number | null | undefined, decimals = 4): string => {
  if (price === null || price === undefined) return '—';
  return (price / PRICE_SCALE).toFixed(decimals);
};

/**
 * Format a price as percentage
 * @param price - Price in scaled format (0-1000000)
 */
export const formatPricePercent = (price: number | null | undefined): string => {
  if (price === null || price === undefined) return '—';
  return `${((price / PRICE_SCALE) * 100).toFixed(1)}%`;
};

/**
 * Format probability (0-1000000 scale to percentage)
 */
export const formatProbability = (probability: number | null | undefined): string => {
  if (probability === null || probability === undefined) return '—';
  return `${(probability / 10000).toFixed(2)}%`;
};

// ============================================
// Amount Formatting
// ============================================

/**
 * Format a token amount (scaled by 1e6) to human-readable USDC
 * @param amount - Amount in lamports (1 USDC = 1,000,000 lamports)
 * @param decimals - Number of decimal places (default: 2)
 */
export const formatAmount = (amount: number | null | undefined, decimals = 2): string => {
  if (amount === null || amount === undefined) return '—';
  return (amount / PRICE_SCALE).toFixed(decimals);
};

/**
 * Alias for formatAmount for backward compatibility
 */
export const formatSize = formatAmount;

/**
 * Format USDC amount with symbol
 * @param amount - Amount in lamports
 */
export const formatUsdc = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined) return '—';
  return `${formatAmount(amount)} USDC`;
};

/**
 * Format USDC amount with compact notation for large numbers
 */
export const formatUsdcCompact = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined) return '—';
  const value = amount / PRICE_SCALE;
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  return value.toFixed(2);
};

// ============================================
// Date/Time Formatting
// ============================================

/**
 * Format Unix timestamp to locale date string
 * @param timestamp - Unix timestamp in seconds
 */
export const formatDate = (timestamp: number | null | undefined): string => {
  if (timestamp === null || timestamp === undefined || timestamp === 0) return '—';
  return new Date(timestamp * 1000).toLocaleDateString();
};

/**
 * Format Unix timestamp to locale time string
 * @param timestamp - Unix timestamp in seconds
 */
export const formatTime = (timestamp: number | null | undefined): string => {
  if (timestamp === null || timestamp === undefined || timestamp === 0) return '—';
  return new Date(timestamp * 1000).toLocaleTimeString();
};

/**
 * Format Unix timestamp to full locale date-time string
 * @param timestamp - Unix timestamp in seconds
 */
export const formatDateTime = (timestamp: number | null | undefined): string => {
  if (timestamp === null || timestamp === undefined || timestamp === 0) return '—';
  return new Date(timestamp * 1000).toLocaleString();
};

/**
 * Format ISO date string to locale time string
 */
export const formatIsoTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleTimeString();
  } catch {
    return '—';
  }
};

/**
 * Format relative time (e.g., "2 hours ago")
 */
export const formatRelativeTime = (timestamp: number | null | undefined): string => {
  if (timestamp === null || timestamp === undefined || timestamp === 0) return '—';
  
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  
  return formatDate(timestamp);
};

// ============================================
// Address Formatting
// ============================================

/**
 * Truncate a wallet address or pubkey for display
 * @param address - Full address string
 * @param startChars - Characters to show at start (default: 4)
 * @param endChars - Characters to show at end (default: 4)
 */
export const truncateAddress = (
  address: string | null | undefined,
  startChars = 4,
  endChars = 4
): string => {
  if (!address) return '—';
  if (address.length <= startChars + endChars + 3) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
};

// ============================================
// Status Formatting
// ============================================

/**
 * Format market status code to human-readable label
 */
export const formatMarketStatus = (status: number | null | undefined): string => {
  if (status === null || status === undefined) return '—';
  switch (status) {
    case 0: return 'Active';
    case 1: return 'Settled';
    case 2: return 'Paused';
    case 3: return 'Cancelled';
    case 4: return 'Terminated';
    default: return 'Unknown';
  }
};

/**
 * Format order status to human-readable label
 */
export const formatOrderStatus = (status: string | null | undefined): string => {
  if (!status) return '—';
  switch (status.toLowerCase()) {
    case 'open': return 'Open';
    case 'partial': return 'Partial';
    case 'filled': return 'Filled';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
};

// ============================================
// Number Formatting
// ============================================

/**
 * Format a number with thousand separators
 */
export const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString();
};

/**
 * Format percentage with specified decimals
 */
export const formatPercent = (value: number | null | undefined, decimals = 2): string => {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(decimals)}%`;
};
