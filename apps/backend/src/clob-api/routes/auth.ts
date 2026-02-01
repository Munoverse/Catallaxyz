/**
 * Auth Routes for CLOB API
 * L1/L2 authentication and API key management
 */

import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { createServerClient } from '../../lib/supabase.js';
import {
  buildL1Message,
  getAuthHeaders,
  verifyL1Signature,
} from '../../lib/auth.js';
// AUDIT FIX B-44: Use shared requireL2Auth module
import { requireL2Auth } from '../../lib/clob-auth.js';
import { logger } from '../../lib/logger.js';

// Re-export for backward compatibility
export { requireL2Auth } from '../../lib/clob-auth.js';

export default async function authRoutes(app: FastifyInstance) {
  // Create or retrieve API key
  app.post('/api-key', {
    config: {
      rateLimit: {
        max: Number(process.env.CLOB_API_KEY_RATE_LIMIT_MAX || 5),
        timeWindow: Number(process.env.CLOB_API_KEY_RATE_LIMIT_WINDOW_MS || 60_000),
      },
    },
  }, async (request, reply) => {
    try {
      const body = request.body as Record<string, any>;
      const { walletAddress, nonce, signatureType = 0, funderAddress } = body;
      const { signature, timestamp, address: headerAddress } = getAuthHeaders(request);

      if (!walletAddress || !signature || !timestamp || !nonce) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' },
        });
      }

      if (headerAddress && headerAddress !== walletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Header address mismatch' },
        });
      }

      const message = buildL1Message(walletAddress, timestamp, nonce);
      const verified = verifyL1Signature({
        walletAddress,
        signature,
        timestamp,
        nonce,
      });

      if (!verified) {
        return reply.code(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid L1 signature' },
        });
      }

      const supabase = createServerClient();
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', walletAddress)
        .single();

      if (!user) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      const { data: existing } = await supabase
        .from('api_keys')
        .select('api_key, api_passphrase')
        .eq('user_id', user.id)
        .eq('l1_nonce', nonce)
        .single();

      if (existing) {
        return reply.send({
          success: true,
          data: {
            apiKey: existing.api_key,
            secret: null,
            passphrase: existing.api_passphrase,
            message: 'Secret is only shown at creation. Use rotate to generate a new secret.',
          },
        });
      }

      const apiKey = crypto.randomUUID();
      const apiSecret = crypto.randomBytes(32).toString('hex');
      const apiPassphrase = crypto.randomBytes(16).toString('hex');

      const { data: created, error: insertError } = await supabase
        .from('api_keys')
        .insert({
          user_id: user.id,
          wallet_address: walletAddress,
          funder_address: funderAddress || null,
          api_key: apiKey,
          api_secret: apiSecret,
          api_passphrase: apiPassphrase,
          signature_type: signatureType,
          l1_nonce: nonce,
        })
        .select()
        .single();

      if (insertError || !created) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: insertError?.message || 'Insert failed' },
        });
      }

      return reply.send({
        success: true,
        data: {
          apiKey,
          secret: apiSecret,
          passphrase: apiPassphrase,
          message,
        },
      });
    } catch (error: any) {
      logger.error('clob-api/auth/api-key', 'Failed to create API key', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Internal error' },
      });
    }
  });

  // Revoke API key
  app.delete('/api-key', async (request, reply) => {
    try {
      const apiKeyRow = await requireL2Auth(request);
      
      const supabase = createServerClient();
      await supabase
        .from('api_keys')
        .delete()
        .eq('id', apiKeyRow.id);

      return reply.send({ success: true });
    } catch (error: any) {
      logger.error('clob-api/auth/api-key', 'Failed to revoke API key', error);
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: error.message },
      });
    }
  });

  // Rotate API secret (keeps API key + passphrase)
  app.post('/api-key/rotate', async (request, reply) => {
    try {
      const apiKeyRow = await requireL2Auth(request);

      const newSecret = crypto.randomBytes(32).toString('hex');
      const supabase = createServerClient();
      const { error } = await supabase
        .from('api_keys')
        .update({
          api_secret: newSecret,
          updated_at: new Date().toISOString(),
        })
        .eq('id', apiKeyRow.id);

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      return reply.send({
        success: true,
        data: {
          apiKey: apiKeyRow.api_key,
          secret: newSecret,
          passphrase: apiKeyRow.api_passphrase,
        },
      });
    } catch (error: any) {
      logger.error('clob-api/auth/api-key/rotate', 'Failed to rotate API secret', error);
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: error.message },
      });
    }
  });

  // Verify current session
  app.get('/verify', async (request, reply) => {
    try {
      const apiKeyRow = await requireL2Auth(request);
      
      return reply.send({
        success: true,
        data: {
          userId: apiKeyRow.user_id,
          walletAddress: apiKeyRow.wallet_address,
          createdAt: apiKeyRow.created_at,
        },
      });
    } catch (error: any) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: error.message },
      });
    }
  });
}
