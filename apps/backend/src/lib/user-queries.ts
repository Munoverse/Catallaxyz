/**
 * User Queries Utility
 * AUDIT FIX v1.2.7: Centralized user query logic
 * Replaces duplicate logic in routes/users.ts, routes/markets.ts, routes/orders.ts, etc.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger.js';

export interface AuthContext {
  kind: 'wallet' | 'anonymous';
  walletAddress?: string;
}

export interface User {
  id: string;
  wallet_address: string | null;
  magic_user_id: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserQueryResult {
  user: User | null;
  error: Error | null;
}

/**
 * Get user by authentication context
 * Uses wallet authentication (Phantom)
 */
export async function getUserByAuthContext(
  auth: AuthContext,
  supabase: SupabaseClient
): Promise<UserQueryResult> {
  try {
    if (auth.kind === 'anonymous') {
      return { user: null, error: null };
    }

    // User fields to select (matching User interface)
    const userFields = 'id, wallet_address, magic_user_id, username, avatar_url, bio, created_at, updated_at';

    // Wallet auth
    if (auth.kind === 'wallet' && auth.walletAddress) {
      const { data: user, error } = await supabase
        .from('users')
        .select(userFields)
        .eq('wallet_address', auth.walletAddress)
        .single();

      if (error && (error as any).code !== 'PGRST116') {
        return { user: null, error: new Error(error.message) };
      }

      return { user: user || null, error: null };
    }

    return { user: null, error: null };
  } catch (err: any) {
    logger.error('user-queries', 'Error in getUserByAuthContext', err);
    return { user: null, error: err };
  }
}

/**
 * Get user by wallet address
 */
export async function getUserByWalletAddress(
  walletAddress: string,
  supabase: SupabaseClient
): Promise<UserQueryResult> {
  const userFields = 'id, wallet_address, magic_user_id, username, avatar_url, bio, created_at, updated_at';
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select(userFields)
      .eq('wallet_address', walletAddress)
      .single();

    if (error && (error as any).code !== 'PGRST116') {
      return { user: null, error: new Error(error.message) };
    }

    return { user: user || null, error: null };
  } catch (err: any) {
    logger.error('user-queries', 'Error in getUserByWalletAddress', err);
    return { user: null, error: err };
  }
}

/**
 * Get user by username
 */
export async function getUserByUsername(
  username: string,
  supabase: SupabaseClient
): Promise<UserQueryResult> {
  const userFields = 'id, wallet_address, magic_user_id, username, avatar_url, bio, created_at, updated_at';
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select(userFields)
      .eq('username', username.toLowerCase())
      .single();

    if (error && (error as any).code !== 'PGRST116') {
      return { user: null, error: new Error(error.message) };
    }

    return { user: user || null, error: null };
  } catch (err: any) {
    logger.error('user-queries', 'Error in getUserByUsername', err);
    return { user: null, error: err };
  }
}

/**
 * Check if username is available
 */
export async function isUsernameAvailable(
  username: string,
  supabase: SupabaseClient,
  excludeUserId?: string
): Promise<boolean> {
  try {
    let query = supabase
      .from('users')
      .select('id')
      .eq('username', username.toLowerCase());

    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }

    const { data } = await query.single();
    return !data;
  } catch (err) {
    // PGRST116 means no rows found, which means username is available
    return true;
  }
}
