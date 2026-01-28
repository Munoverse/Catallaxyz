/**
 * Shared Database Helper Functions
 * AUDIT FIX v1.2.5: Centralize common database operations for all API routes
 * 
 * This eliminates duplicated ensureUser/ensureMarket functions across routes.
 */

import { PoolClient } from 'pg';

/**
 * Ensure a user exists in the database, creating if necessary
 * Returns the user's UUID
 */
export async function ensureUser(client: PoolClient, walletAddress: string): Promise<string> {
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM public.users WHERE wallet_address = $1',
    [walletAddress]
  );
  
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  
  const inserted = await client.query<{ id: string }>(
    'INSERT INTO public.users (wallet_address, auth_provider) VALUES ($1, $2) RETURNING id',
    [walletAddress, 'wallet']
  );
  
  return inserted.rows[0].id;
}

/**
 * Ensure a market exists in the database, creating if necessary
 * Returns the market's UUID
 */
export async function ensureMarket(client: PoolClient, marketAddress: string): Promise<string> {
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM public.markets WHERE solana_market_account = $1',
    [marketAddress]
  );
  
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  
  // Create a placeholder market entry
  const title = `Market ${marketAddress.slice(0, 8)}`;
  const inserted = await client.query<{ id: string }>(
    'INSERT INTO public.markets (title, solana_market_account) VALUES ($1, $2) RETURNING id',
    [title, marketAddress]
  );
  
  return inserted.rows[0].id;
}

/**
 * Get user ID by wallet address (returns null if not found)
 */
export async function getUserByWallet(client: PoolClient, walletAddress: string): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    'SELECT id FROM public.users WHERE wallet_address = $1',
    [walletAddress]
  );
  
  return result.rows.length > 0 ? result.rows[0].id : null;
}

/**
 * Get market ID by Solana address (returns null if not found)
 */
export async function getMarketByAddress(client: PoolClient, marketAddress: string): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    'SELECT id FROM public.markets WHERE solana_market_account = $1',
    [marketAddress]
  );
  
  return result.rows.length > 0 ? result.rows[0].id : null;
}

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
