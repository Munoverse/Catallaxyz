/**
 * Users Routes for Data API
 * Read-only public user data endpoints
 */

import type { FastifyInstance } from 'fastify';
import { createServerClient } from '../../lib/supabase.js';

export default async function usersRoutes(app: FastifyInstance) {
  // Get public user profile by address
  app.get('/address/:address', async (request, reply) => {
    try {
      const { address } = request.params as { address: string };

      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('users')
        .select('id, wallet_address, username, display_name, avatar_url, bio, total_trades, total_volume, total_profit_loss, win_rate, total_wins, total_losses, created_at')
        .eq('wallet_address', address)
        .single();

      if (error || !data) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
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

  // Get user by username
  app.get('/username/:username', async (request, reply) => {
    try {
      const { username } = request.params as { username: string };

      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('users')
        .select('id, wallet_address, username, display_name, avatar_url, bio, total_trades, total_volume, total_profit_loss, win_rate, total_wins, total_losses, created_at')
        .eq('username', username)
        .single();

      if (error || !data) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
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

  // Get user positions (public)
  app.get('/address/:address/positions', async (request, reply) => {
    try {
      const { address } = request.params as { address: string };
      const query = request.query as Record<string, string | undefined>;
      const status = query.status || 'active';

      const supabase = createServerClient();
      
      // First get user ID
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', address)
        .single();

      if (!user) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      const { data, error } = await supabase
        .from('stakes')
        .select('*, markets!inner(title, status)')
        .eq('user_id', user.id)
        .eq('status', status);

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      return reply.send({
        success: true,
        data: (data || []).map((s: any) => ({
          ...s,
          marketTitle: s.markets?.title,
          marketStatus: s.markets?.status,
          markets: undefined,
        })),
      });
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  // Get leaderboard
  app.get('/leaderboard', async (request, reply) => {
    try {
      const query = request.query as Record<string, string | undefined>;
      const sortBy = query.sortBy || 'total_volume';
      const limit = parseInt(query.limit || '50', 10);

      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('users')
        .select('id, wallet_address, username, avatar_url, total_trades, total_volume, total_profit_loss, win_rate')
        .order(sortBy, { ascending: false })
        .limit(limit);

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      return reply.send({
        success: true,
        data: (data || []).map((u: any, i: number) => ({
          rank: i + 1,
          ...u,
        })),
      });
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });
}
