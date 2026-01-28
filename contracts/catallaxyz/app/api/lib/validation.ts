/**
 * Shared Input Validation Utilities
 * AUDIT FIX v1.2.5: Centralize validation for consistent security across API routes
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Maximum allowed time drift for timestamp validation (5 minutes)
 */
export const MAX_TIME_DRIFT_MS = 5 * 60 * 1000;

/**
 * Validate a timestamp is within acceptable range
 */
export function validateTimestamp(timestamp: string | number): { valid: boolean; error?: string } {
  const timestampMs = Number(timestamp);
  
  if (!Number.isFinite(timestampMs)) {
    return { valid: false, error: 'Invalid timestamp format.' };
  }
  
  const timeDiff = Math.abs(timestampMs - Date.now());
  
  if (timeDiff > MAX_TIME_DRIFT_MS) {
    return { valid: false, error: 'Timestamp out of acceptable range (±5 minutes).' };
  }
  
  return { valid: true };
}

/**
 * Validate a Solana public key
 */
export function validatePublicKey(address: string): { valid: boolean; publicKey?: PublicKey; error?: string } {
  try {
    const publicKey = new PublicKey(address);
    return { valid: true, publicKey };
  } catch {
    return { valid: false, error: 'Invalid Solana address format.' };
  }
}

/**
 * Validate price is within valid range (0, 1]
 */
export function validatePrice(price: number): { valid: boolean; error?: string } {
  if (!Number.isFinite(price)) {
    return { valid: false, error: 'Price must be a valid number.' };
  }
  
  if (price <= 0 || price > 1_000_000) {
    return { valid: false, error: 'Price must be between 0 and 1 (scaled by 1,000,000).' };
  }
  
  return { valid: true };
}

/**
 * Validate size/amount is positive
 */
export function validateSize(size: number): { valid: boolean; error?: string } {
  if (!Number.isFinite(size) || size <= 0) {
    return { valid: false, error: 'Size must be a positive number.' };
  }
  
  return { valid: true };
}

/**
 * Validate outcome is 0 (YES) or 1 (NO)
 */
export function validateOutcome(outcome: number): { valid: boolean; error?: string } {
  if (outcome !== 0 && outcome !== 1) {
    return { valid: false, error: 'Outcome must be 0 (YES) or 1 (NO).' };
  }
  
  return { valid: true };
}

/**
 * Validate side is 'buy' or 'sell'
 */
export function validateSide(side: string): { valid: boolean; error?: string } {
  if (side !== 'buy' && side !== 'sell') {
    return { valid: false, error: "Side must be 'buy' or 'sell'." };
  }
  
  return { valid: true };
}

/**
 * Validate required fields are present
 */
export function validateRequired(obj: Record<string, unknown>, fields: string[]): { valid: boolean; error?: string } {
  const missing = fields.filter(field => obj[field] === undefined || obj[field] === null || obj[field] === '');
  
  if (missing.length > 0) {
    return { valid: false, error: `Missing required fields: ${missing.join(', ')}` };
  }
  
  return { valid: true };
}
