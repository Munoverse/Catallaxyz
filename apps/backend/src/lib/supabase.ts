import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger.js';

// AUDIT FIX D-H3: Require proper Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate required configuration at startup
if (!supabaseUrl) {
  logger.error('supabase', 'SUPABASE_URL is not configured');
}
if (!supabaseAnonKey) {
  logger.error('supabase', 'SUPABASE_ANON_KEY is not configured');
}

// AUDIT FIX D-H3: Only create public client if properly configured
let supabasePublicClient: SupabaseClient | null = null;

export function getPublicClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase public client not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
  }
  if (!supabasePublicClient) {
    supabasePublicClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabasePublicClient;
}

// Legacy export for backwards compatibility (throws if not configured)
export { supabasePublicClient };

export function createServerClient(): SupabaseClient {
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is not set');
  }
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
