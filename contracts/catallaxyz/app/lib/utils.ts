import { BN } from '@coral-xyz/anchor';
import { MarketStatus } from '../../shared/types';
import { NumberLike, USDC_MULTIPLIER, PRICE_SCALE, PROBABILITY_SCALE } from './types';

// Re-export types and utilities from types.ts
export { 
  toNumber, 
  formatUsdcAmount, 
  formatPrice, 
  formatProbability, 
  formatDateTime,
  USDC_DECIMALS,
  USDC_MULTIPLIER,
  PRICE_SCALE,
  PROBABILITY_SCALE,
} from './types';

export type { 
  NumberLike, 
  GlobalAccount, 
  MarketAccount, 
  UserPositionAccount,
  UserBalanceAccount,
  MarketRow,
  UserPosition,
  OutcomeType,
  TradeSide,
  Order,
  Trade,
  OrderbookEntry,
} from './types';

export const formatUsdc = (value?: number | null) => {
  const amount = value ?? 0;
  return (amount / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
};

export const parseUsdcAmount = (input: string) => {
  const normalized = input.trim();
  if (!normalized) return null;
  const [whole, fractional = ''] = normalized.split('.');
  const padded = (fractional + '000000').slice(0, 6);
  const raw = `${whole}${padded}`.replace(/^0+/, '') || '0';
  return new BN(raw);
};

export const formatStatus = (status: number) => {
  if (status === MarketStatus.Active) return 'Active';
  if (status === MarketStatus.Settled) return 'Settled';
  if (status === MarketStatus.Terminated) return 'Terminated';
  return `Unknown (${status})`;
};

// ============================================
// Error Handling Utilities
// ============================================

/**
 * Extract a user-friendly error message from any error type
 */
export const getErrorMessage = (err: unknown, fallback = 'An unexpected error occurred.'): string => {
  if (!err) return fallback;
  
  if (typeof err === 'string') return err;
  
  if (err instanceof Error) {
    // Handle Anchor/Solana specific errors
    const msg = err.message;
    
    // Extract custom program error messages
    if (msg.includes('custom program error:')) {
      const match = msg.match(/custom program error: (.+)/);
      return match?.[1] ?? msg;
    }
    
    // Handle common Solana errors
    if (msg.includes('insufficient funds')) return 'Insufficient funds for transaction.';
    if (msg.includes('Transaction simulation failed')) return 'Transaction simulation failed. Please try again.';
    if (msg.includes('blockhash not found')) return 'Network congestion. Please try again.';
    if (msg.includes('User rejected')) return 'Transaction was rejected.';
    
    return msg;
  }
  
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
  }
  
  return fallback;
};

/**
 * Check if error is a user cancellation (not a real error)
 */
export const isUserCancellation = (err: unknown): boolean => {
  const msg = getErrorMessage(err, '').toLowerCase();
  return msg.includes('user rejected') || msg.includes('user denied') || msg.includes('cancelled');
};
