/**
 * CLOB L2 Authentication Module
 * Shared authentication logic for CLOB API routes
 * 
 * AUDIT FIX B-44: Extracted from routes/clob.ts and clob-api/routes/auth.ts
 */

import type { FastifyRequest } from 'fastify';
import { createServerClient } from './supabase.js';
import {
  buildL2SignaturePayload,
  getAuthHeaders,
  ensureFreshTimestamp,
  verifyL2Signature,
} from './auth.js';
import { logger } from './logger.js';

export interface ApiKeyRow {
  id: string;
  user_id: string;
  wallet_address: string;
  funder_address: string | null;
  api_key: string;
  api_secret: string;
  api_passphrase: string;
  signature_type: number;
  l1_nonce: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Require L2 authentication for CLOB API requests
 * Validates API key, passphrase, timestamp, and HMAC signature
 * 
 * @throws Error if authentication fails
 * @returns ApiKeyRow for the authenticated user
 */
export async function requireL2Auth(request: FastifyRequest): Promise<ApiKeyRow> {
  const { apiKey, passphrase, signature, timestamp, address } = getAuthHeaders(request);
  if (!apiKey || !passphrase || !signature || !timestamp || !address) {
    throw new Error('Missing L2 auth headers');
  }

  const supabase = createServerClient();
  
  // AUDIT FIX B-46: Select only needed fields, avoid exposing api_secret in logs
  const { data: apiRow, error } = await supabase
    .from('api_keys')
    .select('id, user_id, wallet_address, funder_address, api_key, api_secret, api_passphrase, signature_type, l1_nonce, last_used_at, revoked_at, created_at, updated_at')
    .eq('api_key', apiKey)
    .eq('api_passphrase', passphrase)
    .single();

  if (error || !apiRow) {
    throw new Error('Invalid API credentials');
  }

  if (apiRow.revoked_at) {
    throw new Error('API key revoked');
  }

  if (apiRow.wallet_address && apiRow.wallet_address !== address) {
    throw new Error('Wallet address mismatch');
  }

  const timestampMs = ensureFreshTimestamp(timestamp);
  const lastUsedAtMs = apiRow.last_used_at ? Date.parse(apiRow.last_used_at) : 0;
  if (lastUsedAtMs && timestampMs <= lastUsedAtMs) {
    throw new Error('Stale timestamp');
  }

  const body = request.body ? JSON.stringify(request.body) : '';
  const payload = buildL2SignaturePayload({
    timestamp,
    method: request.method,
    path: request.url.split('?')[0],
    body,
  });

  if (!verifyL2Signature({ apiSecret: apiRow.api_secret, signature, payload })) {
    throw new Error('Invalid L2 signature');
  }

  // Update last_used_at timestamp
  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date(timestampMs).toISOString() })
    .eq('id', apiRow.id);

  return apiRow as ApiKeyRow;
}
