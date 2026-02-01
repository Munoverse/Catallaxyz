import type { FastifyRequest } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import { createServerClient } from './supabase.js';
import { logger } from './logger.js';

/**
 * Get authenticated user ID from the request
 */
export async function getAuthenticatedUser(_request: FastifyRequest): Promise<string | null> {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user.id;
  } catch (error) {
    logger.error('auth', 'Error getting authenticated user', error);
    return null;
  }
}

/**
 * Get authenticated user with full profile
 */
export async function getAuthenticatedUserProfile(_request: FastifyRequest) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    return {
      id: user.id,
      email: user.email,
      ...profile,
    };
  } catch (error) {
    logger.error('auth', 'Error getting user profile', error);
    return null;
  }
}

const POLY_HEADERS = {
  apiKey: 'poly_api_key',
  passphrase: 'poly_passphrase',
  signature: 'poly_signature',
  timestamp: 'poly_timestamp',
  address: 'poly_address',
  nonce: 'poly_nonce',
} as const;

const DEFAULT_AUTH_WINDOW_SECONDS = Number(process.env.AUTH_TIMESTAMP_WINDOW_SECONDS || 300);

function normalizeHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseAuthTimestampMs(timestamp: string) {
  if (!timestamp) return null;
  const numeric = Number(timestamp);
  if (Number.isFinite(numeric)) {
    if (numeric > 1e12) return Math.floor(numeric);
    if (numeric > 1e9) return Math.floor(numeric * 1000);
    if (numeric > 1e6) return Math.floor(numeric * 1000);
  }
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

export function ensureFreshTimestamp(timestamp: string, windowSeconds = DEFAULT_AUTH_WINDOW_SECONDS) {
  const parsed = parseAuthTimestampMs(timestamp);
  if (!parsed) {
    throw new Error('Invalid timestamp');
  }
  const nowMs = Date.now();
  if (Math.abs(nowMs - parsed) > windowSeconds * 1000) {
    throw new Error('Timestamp expired');
  }
  return parsed;
}

export function buildL1Message(walletAddress: string, timestamp: string, nonce: string) {
  return `Catallaxyz CLOB auth:${walletAddress}:${timestamp}:${nonce}`;
}

export function verifyL1Signature({
  walletAddress,
  signature,
  timestamp,
  nonce,
}: {
  walletAddress: string;
  signature: string;
  timestamp: string;
  nonce: string;
}) {
  try {
    const message = buildL1Message(walletAddress, timestamp, nonce);
    const publicKey = new PublicKey(walletAddress);
    const signatureBytes = bs58.decode(signature);
    return nacl.sign.detached.verify(
      Buffer.from(message),
      signatureBytes,
      publicKey.toBytes()
    );
  } catch (error) {
    logger.error('auth', 'L1 signature verification failed', error);
    return false;
  }
}

export function buildL2SignaturePayload({
  timestamp,
  method,
  path,
  body,
}: {
  timestamp: string;
  method: string;
  path: string;
  body?: string;
}) {
  return `${timestamp}${method.toUpperCase()}${path}${body || ''}`;
}

export function verifyL2Signature({
  apiSecret,
  signature,
  payload,
}: {
  apiSecret: string;
  signature: string;
  payload: string;
}) {
  const hmac = crypto.createHmac('sha256', apiSecret).update(payload).digest('hex');
  // AUDIT FIX: Use constant-time comparison to prevent timing attacks
  try {
    const hmacBuffer = Buffer.from(hmac, 'hex');
    const signatureBuffer = Buffer.from(signature, 'hex');
    if (hmacBuffer.length !== signatureBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(hmacBuffer, signatureBuffer);
  } catch {
    // If signature is not valid hex, fail comparison
    return false;
  }
}

export function getAuthHeaders(request: FastifyRequest) {
  const headers = request.headers;
  return {
    apiKey: normalizeHeader(headers[POLY_HEADERS.apiKey]),
    passphrase: normalizeHeader(headers[POLY_HEADERS.passphrase]),
    signature: normalizeHeader(headers[POLY_HEADERS.signature]),
    timestamp: normalizeHeader(headers[POLY_HEADERS.timestamp]),
    address: normalizeHeader(headers[POLY_HEADERS.address]),
    nonce: normalizeHeader(headers[POLY_HEADERS.nonce]),
  };
}

export function getWalletAuthHeaders(request: FastifyRequest) {
  const headers = request.headers;
  return {
    address: normalizeHeader(headers['x-wallet-address']) || normalizeHeader(headers[POLY_HEADERS.address]),
    signature:
      normalizeHeader(headers['x-wallet-signature']) || normalizeHeader(headers[POLY_HEADERS.signature]),
    timestamp:
      normalizeHeader(headers['x-wallet-timestamp']) || normalizeHeader(headers[POLY_HEADERS.timestamp]),
    nonce: normalizeHeader(headers['x-wallet-nonce']) || normalizeHeader(headers[POLY_HEADERS.nonce]),
  };
}

async function recordAuthNonce(
  supabase: SupabaseClient,
  walletAddress: string,
  nonce: string,
  timestampMs: number
) {
  const { error } = await supabase.from('auth_nonces').insert({
    wallet_address: walletAddress,
    nonce,
    created_at: new Date(timestampMs).toISOString(),
  });

  if (error) {
    if ((error as any).code === '23505') {
      throw new Error('Nonce already used');
    }
    throw new Error(error.message || 'Failed to record nonce');
  }
}

export async function verifyWalletAuth({
  supabase,
  walletAddress,
  signature,
  timestamp,
  nonce,
}: {
  supabase: SupabaseClient;
  walletAddress: string;
  signature: string;
  timestamp: string;
  nonce: string;
}) {
  if (!walletAddress || !signature || !timestamp || !nonce) {
    throw new Error('Missing wallet auth headers');
  }

  const timestampMs = ensureFreshTimestamp(timestamp);
  const verified = verifyL1Signature({
    walletAddress,
    signature,
    timestamp,
    nonce,
  });

  if (!verified) {
    throw new Error('Invalid wallet signature');
  }

  await recordAuthNonce(supabase, walletAddress, nonce, timestampMs);
}

export async function getAuthContext({
  request,
  supabase,
}: {
  request: FastifyRequest;
  supabase: SupabaseClient;
}) {
  try {
    const walletHeaders = getWalletAuthHeaders(request);
    if (
      walletHeaders.address ||
      walletHeaders.signature ||
      walletHeaders.timestamp ||
      walletHeaders.nonce
    ) {
      if (!walletHeaders.address) {
        throw new Error('Missing wallet address');
      }
      await verifyWalletAuth({
        supabase,
        walletAddress: walletHeaders.address,
        signature: walletHeaders.signature || '',
        timestamp: walletHeaders.timestamp || '',
        nonce: walletHeaders.nonce || '',
      });
      return { kind: 'wallet' as const, walletAddress: walletHeaders.address };
    }

    throw new Error('Authentication required');
  } catch (error) {
    const err = new Error((error as Error)?.message || 'Authentication required');
    (err as any).statusCode = 401;
    throw err;
  }
}
