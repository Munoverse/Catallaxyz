/**
 * Shared Utility Functions
 * AUDIT FIX v2.1: Centralized utility functions
 * 
 * Consolidates duplicate implementations from:
 * - apps/backend/src/routes/admin.ts
 * - apps/backend/src/routes/cron.ts
 * - apps/backend/src/routes/markets.ts
 */

// ============================================
// Scaling Functions (for on-chain fee rates)
// ============================================

/**
 * Convert a decimal rate (0.0-1.0) to scaled integer
 * Used for on-chain fee rate representation
 * 
 * @param rate - Decimal rate (e.g., 0.032 for 3.2%)
 * @param scale - Scale factor (default 1,000,000)
 * @returns Scaled integer value
 * 
 * @example
 * toScaled(0.032) // returns 32000
 * toScaled(0.5)   // returns 500000
 */
export function toScaled(rate: number, scale: number = 1_000_000): number {
  return Math.floor(rate * scale);
}

/**
 * Convert a scaled integer back to decimal rate
 * 
 * @param scaled - Scaled integer value
 * @param scale - Scale factor (default 1,000,000)
 * @returns Decimal rate (0.0-1.0)
 * 
 * @example
 * fromScaled(32000)  // returns 0.032
 * fromScaled(500000) // returns 0.5
 */
export function fromScaled(scaled: number, scale: number = 1_000_000): number {
  return scaled / scale;
}

/**
 * Convert a decimal rate to scaled BigInt
 * Used for on-chain operations requiring BigInt
 * 
 * @param rate - Decimal rate (e.g., 0.032)
 * @param scale - Scale factor (default 1,000,000)
 * @returns Scaled BigInt value
 */
export function toScaledBigInt(rate: number, scale: number = 1_000_000): bigint {
  return BigInt(Math.floor(rate * scale));
}

/**
 * Convert a scaled BigInt back to decimal rate
 * 
 * @param scaled - Scaled BigInt value
 * @param scale - Scale factor (default 1,000,000)
 * @returns Decimal rate
 */
export function fromScaledBigInt(scaled: bigint, scale: number = 1_000_000): number {
  return Number(scaled) / scale;
}

// ============================================
// Validation Functions
// ============================================

/**
 * Clamp a value between 0 and 1
 * 
 * @param value - Value to clamp
 * @returns Clamped value between 0 and 1
 */
export function clampRate(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Validate that a value is a valid rate (0-1)
 */
export function isValidRate(value: number): boolean {
  return typeof value === 'number' && !isNaN(value) && value >= 0 && value <= 1;
}

// ============================================
// Common Constants
// ============================================

/** Scale factor for USDC (6 decimals) */
export const USDC_SCALE = 1_000_000;

/** Scale factor for fee rates */
export const FEE_RATE_SCALE = 1_000_000;

/** Scale factor for prices (basis points) */
export const PRICE_SCALE = 1_000_000;
