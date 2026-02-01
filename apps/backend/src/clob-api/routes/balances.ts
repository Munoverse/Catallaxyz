/**
 * Balances Routes for CLOB API
 * User balance management (Redis is source of truth)
 */

import type { FastifyInstance } from 'fastify';
import { requireL2Auth } from './auth.js';
import { getUserBalance, depositToBalance } from '../../lib/redis/matching.js';
import { createServerClient } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

export default async function balancesRoutes(app: FastifyInstance) {
  // Get user balances
  app.get('/', async (request, reply) => {
    try {
      const apiKeyRow = await requireL2Auth(request);

      // Get balance from Redis (source of truth)
      const balance = await getUserBalance(apiKeyRow.user_id);

      if (!balance) {
        // Initialize empty balance
        return reply.send({
          success: true,
          data: {
            userId: apiKeyRow.user_id,
            usdcAvailable: '0',
            usdcLocked: '0',
            yesAvailable: '0',
            yesLocked: '0',
            noAvailable: '0',
            noLocked: '0',
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          userId: apiKeyRow.user_id,
          usdcAvailable: balance.usdcAvailable.toString(),
          usdcLocked: balance.usdcLocked.toString(),
          yesAvailable: balance.yesAvailable.toString(),
          yesLocked: balance.yesLocked.toString(),
          noAvailable: balance.noAvailable.toString(),
          noLocked: balance.noLocked.toString(),
        },
      });
    } catch (error: any) {
      logger.error('clob-balances', 'GET /balances error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Internal error' },
      });
    }
  });

  // Deposit (record on-chain deposit)
  app.post('/deposit', async (request, reply) => {
    try {
      const apiKeyRow = await requireL2Auth(request);
      const body = request.body as Record<string, any>;
      const { amount, transactionSignature, slot } = body;

      if (!amount || !transactionSignature) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'amount and transactionSignature are required' },
        });
      }

      // Verify the deposit transaction on-chain first (in production)
      // For now, trust the client and update Redis
      const result = await depositToBalance({
        userId: apiKeyRow.user_id,
        amount: BigInt(amount),
        transactionSignature,
        slot,
      });

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: { code: 'DEPOSIT_FAILED', message: result.error || 'Deposit failed' },
        });
      }

      return reply.send({
        success: true,
        data: {
          newBalance: result.newBalance?.toString(),
        },
      });
    } catch (error: any) {
      logger.error('clob-balances', 'POST /balances/deposit error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Internal error' },
      });
    }
  });

  // AUDIT FIX: Withdrawal endpoint removed
  // Users withdraw directly via Phantom wallet - no CLOB withdrawal needed
  // This endpoint is kept as a no-op for backwards compatibility
  app.post('/withdraw', async (_request, reply) => {
    return reply.code(410).send({
      success: false,
      error: {
        code: 'WITHDRAW_DEPRECATED',
        message: 'Withdrawal through CLOB is no longer supported. Please withdraw directly using your Phantom wallet.',
      },
    });
  });

  // Get balance history (from Postgres)
  app.get('/history', async (request, reply) => {
    try {
      const apiKeyRow = await requireL2Auth(request);
      const query = request.query as Record<string, string | undefined>;
      const limit = parseInt(query.limit || '50', 10);
      const offset = parseInt(query.offset || '0', 10);

      const supabase = createServerClient();
      const operationFields = 'id, user_id, market_id, operation_type, amount, status, tx_signature, created_at';
      const { data, error } = await supabase
        .from('user_operations')
        .select(operationFields)
        .eq('user_id', apiKeyRow.user_id)
        .in('operation_type', ['deposit', 'withdraw'])
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      return reply.send({
        success: true,
        data: data || [],
        pagination: {
          limit,
          offset,
          hasMore: data?.length === limit,
        },
      });
    } catch (error: any) {
      logger.error('clob-balances', 'GET /balances/history error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Internal error' },
      });
    }
  });
}
