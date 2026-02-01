/**
 * Trades Routes for Data API
 * Read-only trade history endpoints
 */

import type { FastifyInstance } from 'fastify';
import { createServerClient } from '../../lib/supabase.js';

export default async function tradesRoutes(app: FastifyInstance) {
  // Get recent trades for a market
  app.get('/:marketId', async (request, reply) => {
    try {
      const { marketId } = request.params as { marketId: string };
      const query = request.query as Record<string, string | undefined>;
      const limit = parseInt(query.limit || '50', 10);
      const offset = parseInt(query.offset || '0', 10);
      const outcomeType = query.outcomeType;

      const supabase = createServerClient();
      let dbQuery = supabase
        .from('order_fills')
        .select('id, market_id, outcome_type, side, price, size, total_cost, created_at')
        .eq('market_id', marketId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (outcomeType) {
        dbQuery = dbQuery.eq('outcome_type', outcomeType);
      }

      const { data, error } = await dbQuery;

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
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  // Get global recent trades
  app.get('/', async (request, reply) => {
    try {
      const query = request.query as Record<string, string | undefined>;
      const limit = parseInt(query.limit || '50', 10);
      const offset = parseInt(query.offset || '0', 10);

      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('order_fills')
        .select('id, market_id, outcome_type, side, price, size, total_cost, created_at, markets!inner(title)')
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
        data: (data || []).map((t: any) => ({
          ...t,
          marketTitle: t.markets?.title,
          markets: undefined,
        })),
        pagination: {
          limit,
          offset,
          hasMore: data?.length === limit,
        },
      });
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  // Get trade by ID
  app.get('/id/:tradeId', async (request, reply) => {
    try {
      const { tradeId } = request.params as { tradeId: string };

      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('order_fills')
        .select('*, markets!inner(title)')
        .eq('id', tradeId)
        .single();

      if (error || !data) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Trade not found' },
        });
      }

      return reply.send({
        success: true,
        data: {
          ...data,
          marketTitle: data.markets?.title,
          markets: undefined,
        },
      });
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });
}
