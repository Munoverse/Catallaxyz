/**
 * Rewards Routes
 * AUDIT FIX v2.0.4: API endpoints for liquidity rewards
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createServerClient } from '../lib/supabase.js';
import { requireAuth, sendAuthError, AuthError } from '../lib/auth-middleware.js';
import { logger } from '../lib/logger.js';
import { handleRouteError, handleDatabaseError } from '../lib/error-handler.js';

interface RewardSummary {
  totalEarned: number;
  totalPending: number;
  totalClaimed: number;
  rewardsCount: number;
}

interface RewardEntry {
  id: string;
  rewardPeriod: string;
  marketId: string;
  marketTitle?: string;
  rewardAmount: number;
  rewardShare: number;
  status: 'pending' | 'distributed' | 'claimed';
  createdAt: string;
}

export default async function rewardsRoutes(app: FastifyInstance) {
  /**
   * Get user's reward summary
   */
  app.get('/rewards/summary', async (request, reply) => {
    try {
      const supabase = createServerClient();

      // Require authentication
      let user;
      try {
        user = await requireAuth(request, supabase);
      } catch (error) {
        sendAuthError(reply, error as AuthError);
        return;
      }

      // Get reward summary
      const { data: rewards, error } = await supabase
        .from('liquidity_rewards')
        .select('reward_amount, status')
        .eq('user_id', user.userId);

      if (error) {
        const errorResponse = handleDatabaseError(error, 'fetch reward summary');
        return reply.code(500).send(errorResponse);
      }

      const summary: RewardSummary = {
        totalEarned: 0,
        totalPending: 0,
        totalClaimed: 0,
        rewardsCount: rewards?.length || 0,
      };

      for (const reward of rewards || []) {
        const amount = Number(reward.reward_amount || 0);
        summary.totalEarned += amount;
        
        if (reward.status === 'pending') {
          summary.totalPending += amount;
        } else if (reward.status === 'claimed' || reward.status === 'distributed') {
          summary.totalClaimed += amount;
        }
      }

      return reply.send({
        success: true,
        data: summary,
      });
    } catch (error: any) {
      handleRouteError(reply, error, 'Failed to fetch reward summary');
      return;
    }
  });

  /**
   * Get user's reward history
   */
  app.get('/rewards', async (request, reply) => {
    try {
      const supabase = createServerClient();
      const query = request.query as Record<string, string | undefined>;
      const { status, limit = '50', offset = '0' } = query;

      // Require authentication
      let user;
      try {
        user = await requireAuth(request, supabase);
      } catch (error) {
        sendAuthError(reply, error as AuthError);
        return;
      }

      // Build query
      let dbQuery = supabase
        .from('liquidity_rewards')
        .select(`
          id,
          reward_period,
          market_id,
          reward_amount,
          reward_share,
          status,
          created_at,
          markets!inner(title)
        `)
        .eq('user_id', user.userId)
        .order('reward_period', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      // Filter by status if provided
      if (status && ['pending', 'distributed', 'claimed'].includes(status)) {
        dbQuery = dbQuery.eq('status', status);
      }

      const { data: rewards, error } = await dbQuery;

      if (error) {
        const errorResponse = handleDatabaseError(error, 'fetch rewards');
        return reply.code(500).send(errorResponse);
      }

      const formattedRewards: RewardEntry[] = (rewards || []).map((row: any) => ({
        id: row.id,
        rewardPeriod: row.reward_period,
        marketId: row.market_id,
        marketTitle: row.markets?.title || 'Unknown Market',
        rewardAmount: Number(row.reward_amount || 0),
        rewardShare: Number(row.reward_share || 0),
        status: row.status,
        createdAt: row.created_at,
      }));

      return reply.send({
        success: true,
        data: {
          rewards: formattedRewards,
          total: formattedRewards.length,
        },
      });
    } catch (error: any) {
      handleRouteError(reply, error, 'Failed to fetch rewards');
      return;
    }
  });

  /**
   * Get rewards by market (for market detail page)
   */
  app.get('/rewards/market/:marketId', async (request, reply) => {
    try {
      const supabase = createServerClient();
      const params = request.params as { marketId: string };
      const { marketId } = params;

      if (!marketId) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'marketId is required' },
        });
      }

      // Require authentication
      let user;
      try {
        user = await requireAuth(request, supabase);
      } catch (error) {
        sendAuthError(reply, error as AuthError);
        return;
      }

      const { data: rewards, error } = await supabase
        .from('liquidity_rewards')
        .select('id, reward_period, reward_amount, reward_share, status, created_at')
        .eq('user_id', user.userId)
        .eq('market_id', marketId)
        .order('reward_period', { ascending: false });

      if (error) {
        const errorResponse = handleDatabaseError(error, 'fetch market rewards');
        return reply.code(500).send(errorResponse);
      }

      return reply.send({
        success: true,
        data: {
          rewards: (rewards || []).map((row: any) => ({
            id: row.id,
            rewardPeriod: row.reward_period,
            rewardAmount: Number(row.reward_amount || 0),
            rewardShare: Number(row.reward_share || 0),
            status: row.status,
            createdAt: row.created_at,
          })),
        },
      });
    } catch (error: any) {
      handleRouteError(reply, error, 'Failed to fetch market rewards');
      return;
    }
  });

  /**
   * Get leaderboard of top reward earners
   */
  app.get('/rewards/leaderboard', async (request, reply) => {
    try {
      const supabase = createServerClient();
      const query = request.query as Record<string, string | undefined>;
      const { period = 'all', limit = '20' } = query;

      // Build date filter
      let dateFilter: string | null = null;
      const now = new Date();
      
      switch (period) {
        case 'day':
          dateFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'week':
          dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'month':
          dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
      }

      // Get aggregated rewards by user
      let dbQuery = supabase.rpc('get_rewards_leaderboard', {
        p_limit: parseInt(limit),
        p_date_filter: dateFilter,
      });

      const { data, error } = await dbQuery;

      if (error) {
        // Fallback: use simple query if RPC doesn't exist
        logger.warn('rewards', 'RPC not available, using fallback query');
        
        let fallbackQuery = supabase
          .from('liquidity_rewards')
          .select(`
            user_id,
            users!inner(wallet_address, username, avatar_url)
          `)
          .limit(parseInt(limit));

        if (dateFilter) {
          fallbackQuery = fallbackQuery.gte('created_at', dateFilter);
        }

        const { data: fallbackData, error: fallbackError } = await fallbackQuery;

        if (fallbackError) {
          const errorResponse = handleDatabaseError(fallbackError, 'fetch rewards leaderboard');
          return reply.code(500).send(errorResponse);
        }

        // Aggregate manually
        const userRewards = new Map<string, { userId: string; user: any; totalRewards: number; rewardsCount: number }>();
        
        for (const row of fallbackData || []) {
          const existing = userRewards.get(row.user_id);
          if (existing) {
            existing.rewardsCount++;
          } else {
            userRewards.set(row.user_id, {
              userId: row.user_id,
              user: row.users,
              totalRewards: 0,
              rewardsCount: 1,
            });
          }
        }

        const leaderboard = Array.from(userRewards.values())
          .sort((a, b) => b.rewardsCount - a.rewardsCount)
          .slice(0, parseInt(limit))
          .map((entry, index) => ({
            rank: index + 1,
            userId: entry.userId,
            walletAddress: entry.user?.wallet_address,
            username: entry.user?.username,
            avatarUrl: entry.user?.avatar_url,
            totalRewards: entry.totalRewards,
            rewardsCount: entry.rewardsCount,
          }));

        return reply.send({
          success: true,
          data: { leaderboard },
        });
      }

      return reply.send({
        success: true,
        data: {
          leaderboard: (data || []).map((row: any, index: number) => ({
            rank: index + 1,
            userId: row.user_id,
            walletAddress: row.wallet_address,
            username: row.username,
            avatarUrl: row.avatar_url,
            totalRewards: Number(row.total_rewards || 0),
            rewardsCount: row.rewards_count || 0,
          })),
        },
      });
    } catch (error: any) {
      handleRouteError(reply, error, 'Failed to fetch rewards leaderboard');
      return;
    }
  });
}
