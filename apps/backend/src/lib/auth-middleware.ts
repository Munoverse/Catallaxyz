/**
 * Unified Authentication Middleware
 * 
 * AUDIT FIX B-32: Extracted from orders.ts, comments.ts, favorites.ts, markets.ts
 * Provides consistent authentication handling for Wallet (Phantom) users
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from './supabase.js';
import { getAuthContext, getWalletAuthHeaders } from './auth.js';
import { logger } from './logger.js';

/**
 * Authenticated user information
 */
export interface AuthenticatedUser {
  userId: string;
  walletAddress: string;
  username?: string;
  authKind: 'wallet';
}

/**
 * Authentication error with HTTP status code
 */
export class AuthError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 401, code = 'UNAUTHORIZED') {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Resolve user from authentication context
 * Uses wallet signature authentication (Phantom)
 */
export async function resolveUser(
  request: FastifyRequest,
  supabase?: SupabaseClient
): Promise<AuthenticatedUser> {
  const client = supabase || createServerClient();
  const authContext = await getAuthContext({ request, supabase: client });

  if (authContext.kind === 'wallet') {
    // Wallet auth: find user by wallet_address
    const { data: user, error } = await client
      .from('users')
      .select('id, wallet_address, username')
      .eq('wallet_address', authContext.walletAddress)
      .single();

    if (error || !user) {
      throw new AuthError('User not found for wallet address', 401);
    }

    return {
      userId: user.id,
      walletAddress: user.wallet_address,
      username: user.username,
      authKind: 'wallet',
    };
  }

  throw new AuthError('Authentication required', 401);
}

/**
 * Require authentication - throws AuthError if not authenticated
 * Use this in route handlers that require authentication
 */
export async function requireAuth(
  request: FastifyRequest,
  supabase?: SupabaseClient
): Promise<AuthenticatedUser> {
  return resolveUser(request, supabase);
}

/**
 * Try to authenticate - returns null if not authenticated (doesn't throw)
 * Use this for optional authentication scenarios
 */
export async function tryAuth(
  request: FastifyRequest,
  supabase?: SupabaseClient
): Promise<AuthenticatedUser | null> {
  try {
    return await resolveUser(request, supabase);
  } catch {
    return null;
  }
}

/**
 * Verify that the authenticated user matches the provided wallet address
 * Useful for operations where wallet address is passed in body/params
 */
export function verifyWalletMatch(
  authenticatedUser: AuthenticatedUser,
  providedWalletAddress?: string
): void {
  if (providedWalletAddress && authenticatedUser.walletAddress !== providedWalletAddress) {
    throw new AuthError('Wallet address mismatch', 403, 'FORBIDDEN');
  }
}

/**
 * Send a standardized authentication error response
 */
export function sendAuthError(reply: FastifyReply, error: AuthError | Error): void {
  const statusCode = (error as AuthError).statusCode || 401;
  const code = (error as AuthError).code || 'UNAUTHORIZED';
  
  reply.code(statusCode).send({
    success: false,
    error: {
      code,
      message: error.message || 'Authentication required',
    },
  });
}

/**
 * Check if request has authentication headers (doesn't validate them)
 */
export function hasAuthHeaders(request: FastifyRequest): boolean {
  const walletHeaders = getWalletAuthHeaders(request);
  return !!(walletHeaders.address || walletHeaders.signature);
}

/**
 * Fastify preHandler hook for routes requiring authentication
 * Adds `request.user` with authenticated user information
 */
export function authPreHandler(
  request: FastifyRequest & { user?: AuthenticatedUser },
  reply: FastifyReply,
  done: (err?: Error) => void
): void {
  const supabase = createServerClient();
  
  resolveUser(request, supabase)
    .then((user) => {
      request.user = user;
      done();
    })
    .catch((error) => {
      sendAuthError(reply, error);
    });
}

/**
 * Register auth decorator on Fastify instance
 * Call this once during app setup to enable request.user
 */
export function registerAuthDecorator(app: FastifyInstance): void {
  // Decorate request with user property
  app.decorateRequest('user', null);
}

/**
 * System authentication (for backend-to-backend calls)
 */
export function requireSystemAuth(
  request: FastifyRequest,
  secretEnvVars: string[] = ['ORDER_PATCH_SECRET', 'CRON_SECRET']
): void {
  const authHeader = request.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : null;

  // Also check x-cron-secret header
  const cronSecret = request.headers['x-cron-secret'] as string | undefined;
  const token = bearerToken || cronSecret;

  if (!token) {
    throw new AuthError('System authentication required', 401);
  }

  // Check against any of the configured secrets
  const validSecrets = secretEnvVars
    .map((envVar) => process.env[envVar])
    .filter(Boolean);

  if (validSecrets.length === 0) {
    logger.error('auth-middleware', 'No system auth secrets configured');
    throw new AuthError('System authentication not configured', 500, 'SERVER_ERROR');
  }

  if (!validSecrets.includes(token)) {
    throw new AuthError('Invalid system credentials', 401);
  }
}

/**
 * Try system authentication - returns true if authenticated, false otherwise
 */
export function trySystemAuth(
  request: FastifyRequest,
  secretEnvVars: string[] = ['ORDER_PATCH_SECRET', 'CRON_SECRET']
): boolean {
  try {
    requireSystemAuth(request, secretEnvVars);
    return true;
  } catch {
    return false;
  }
}
