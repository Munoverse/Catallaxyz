/**
 * Markets Routes for Data API
 * Read-only market data endpoints
 */

import type { FastifyInstance } from 'fastify';
import { createServerClient } from '../../lib/supabase.js';

export default async function marketsRoutes(app: FastifyInstance) {
  // Get all markets with pagination
  app.get('/', async (request, reply) => {
    try {
      const query = request.query as Record<string, string | undefined>;
      const status = query.status;
      const category = query.category;
      const limit = parseInt(query.limit || '50', 10);
      const offset = parseInt(query.offset || '0', 10);
      const sortBy = query.sortBy || 'created_at';
      const sortOrder = query.sortOrder === 'asc' ? true : false;

      const supabase = createServerClient();
      let dbQuery = supabase
        .from('markets')
        .select('id, title, question, description, category, tags, image_url, status, total_volume, total_trades, liquidity, current_yes_price, current_no_price, probability, created_at, updated_at, last_trade_at, expires_at')
        .order(sortBy, { ascending: sortOrder })
        .range(offset, offset + limit - 1);

      if (status) {
        dbQuery = dbQuery.eq('status', status);
      }
      if (category) {
        dbQuery = dbQuery.eq('category', category);
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

  // Get single market by ID
  app.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const supabase = createServerClient();

      const { data, error } = await supabase
        .from('markets')
        .select('*, users!creator_id(username, wallet_address)')
        .eq('id', id)
        .single();

      if (error || !data) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Market not found' },
        });
      }

      return reply.send({ success: true, data });
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  // Get market stats
  app.get('/:id/stats', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const supabase = createServerClient();

      const { data, error } = await supabase
        .from('market_stats')
        .select('*')
        .eq('market_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Stats not found' },
        });
      }

      return reply.send({ success: true, data });
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  // Get market probability history
  app.get('/:id/history', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, string | undefined>;
      const interval = query.interval || '1h';
      const limit = parseInt(query.limit || '100', 10);

      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('market_probability_history')
        .select('*')
        .eq('market_id', id)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      return reply.send({ success: true, data: data || [] });
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });
}
