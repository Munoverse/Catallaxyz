/**
 * Shared Database Helper Functions
 * AUDIT FIX v2.1 (MED-20): Centralized database helpers
 * 
 * This eliminates duplicate ensureUser/ensureMarket implementations across:
 * - /app/api/lib/helpers.ts
 * - /backend/sync-markets.ts
 * - /backend/cron/sync-trades.ts
 */

import { PoolClient } from 'pg';

// ============================================
// User Functions
// ============================================

/**
 * Ensure a user exists in the database, creating if necessary
 * Returns the user's UUID
 */
export async function ensureUser(
  client: PoolClient, 
  walletAddress: string
): Promise<string> {
  // Use upsert pattern for atomicity
  const result = await client.query<{ id: string }>(
    `INSERT INTO public.users (wallet_address, auth_provider)
     VALUES ($1, 'wallet')
     ON CONFLICT (wallet_address) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [walletAddress]
  );
  return result.rows[0].id;
}

/**
 * Get user ID by wallet address (returns null if not found)
 */
export async function getUserByWallet(
  client: PoolClient, 
  walletAddress: string
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    'SELECT id FROM public.users WHERE wallet_address = $1',
    [walletAddress]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

/**
 * Batch ensure users exist (more efficient for multiple users)
 */
export async function ensureUsers(
  client: PoolClient,
  walletAddresses: string[]
): Promise<Map<string, string>> {
  if (walletAddresses.length === 0) {
    return new Map();
  }

  // Deduplicate addresses
  const uniqueAddresses = [...new Set(walletAddresses)];
  
  // Bulk upsert using unnest
  const result = await client.query<{ id: string; wallet_address: string }>(
    `INSERT INTO public.users (wallet_address, auth_provider)
     SELECT unnest($1::text[]), 'wallet'
     ON CONFLICT (wallet_address) DO UPDATE SET updated_at = NOW()
     RETURNING id, wallet_address`,
    [uniqueAddresses]
  );
  
  return new Map(result.rows.map(row => [row.wallet_address, row.id]));
}

// ============================================
// Market Functions
// ============================================

/**
 * Ensure a market exists in the database, creating if necessary
 * Returns the market's UUID
 */
export async function ensureMarket(
  client: PoolClient, 
  marketAddress: string,
  options?: { title?: string }
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM public.markets WHERE solana_market_account = $1',
    [marketAddress]
  );
  
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  
  // Create a placeholder market entry
  const title = options?.title ?? `Market ${marketAddress.slice(0, 8)}`;
  const inserted = await client.query<{ id: string }>(
    'INSERT INTO public.markets (title, solana_market_account) VALUES ($1, $2) RETURNING id',
    [title, marketAddress]
  );
  
  return inserted.rows[0].id;
}

/**
 * Get market ID by Solana address (returns null if not found)
 */
export async function getMarketByAddress(
  client: PoolClient, 
  marketAddress: string
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    'SELECT id FROM public.markets WHERE solana_market_account = $1',
    [marketAddress]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Convert outcome string to number
 */
export function outcomeToNumber(outcome: 'yes' | 'no'): number {
  return outcome === 'yes' ? 0 : 1;
}

/**
 * Convert outcome number to string
 */
export function outcomeToString(outcome: number): 'yes' | 'no' {
  return outcome === 0 ? 'yes' : 'no';
}

/**
 * Convert side string to number
 */
export function sideToNumber(side: 'buy' | 'sell'): number {
  return side === 'buy' ? 0 : 1;
}

/**
 * Convert side number to string
 */
export function sideToString(side: number): 'buy' | 'sell' {
  return side === 0 ? 'buy' : 'sell';
}
