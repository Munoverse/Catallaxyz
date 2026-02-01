import type { FastifyInstance } from 'fastify';
import { createServerClient } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

export default async function leaderboardRoutes(app: FastifyInstance) {
  app.get('/leaderboard', async (request, reply) => {
    try {
      const query = request.query as Record<string, string | undefined>;
      const period = query.period || 'week';
      const metric = query.metric || 'profit';

      const now = new Date();
      let startDate: Date;

      switch (period) {
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
          startDate = new Date(0);
          break;
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      const supabase = createServerClient();

      if (metric === 'created') {
        const { data: markets, error } = await supabase
          .from('markets')
          .select(
            `
            creator_id,
            created_at,
            users:creator_id (
              username,
              avatar_url,
              total_terminations
            )
          `
          )
          .gte('created_at', startDate.toISOString());

        if (error) {
          logger.error('leaderboard', 'Error fetching markets', error);
          return reply.send({ leaderboard: [] });
        }

        const counts = new Map<string, { count: number; username: string; avatar?: string; terminationsCount: number }>();
        for (const rowData of markets || []) {
          const row = rowData as any;
          if (!row.creator_id) continue;
          // Supabase returns joined relations as arrays, get the first element
          const user = Array.isArray(row.users) ? row.users[0] : row.users;
          const current = counts.get(row.creator_id) || {
            count: 0,
            username: user?.username || 'Anonymous',
            avatar: user?.avatar_url,
            terminationsCount: user?.total_terminations || 0,
          };
          current.count += 1;
          counts.set(row.creator_id, current);
        }

        const leaderboard = Array.from(counts.entries())
          .map(([userId, stats]) => ({
            rank: 0,
            userId,
            username: stats.username,
            avatar: stats.avatar,
            terminationsCount: stats.terminationsCount,
            profit: 0,
            profitPercentage: 0,
            volume: 0,
            trades: 0,
            winRate: 0,
            marketsCreated: stats.count,
          }))
          .sort((a, b) => (b.marketsCreated || 0) - (a.marketsCreated || 0))
          .map((entry, index) => ({ ...entry, rank: index + 1 }))
          .slice(0, 100);

        return reply.send({ leaderboard });
      }

      if (metric === 'terminated') {
        const { data: settlements, error } = await supabase
          .from('market_settlements')
          .select(
            `
            last_trader_id,
            settled_at,
            users:last_trader_id (
              username,
              avatar_url,
              total_terminations
            )
          `
          )
          .gte('settled_at', startDate.toISOString());

        if (error) {
          logger.error('leaderboard', 'Error fetching settlements', error);
          return reply.send({ leaderboard: [] });
        }

        const counts = new Map<string, { count: number; username: string; avatar?: string; terminationsCount: number }>();
        for (const rowData of settlements || []) {
          const row = rowData as any;
          if (!row.last_trader_id) continue;
          // Supabase returns joined relations as arrays, get the first element
          const user = Array.isArray(row.users) ? row.users[0] : row.users;
          const current = counts.get(row.last_trader_id) || {
            count: 0,
            username: user?.username || 'Anonymous',
            avatar: user?.avatar_url,
            terminationsCount: user?.total_terminations || 0,
          };
          current.count += 1;
          counts.set(row.last_trader_id, current);
        }

        const leaderboard = Array.from(counts.entries())
          .map(([userId, stats]) => ({
            rank: 0,
            userId,
            username: stats.username,
            avatar: stats.avatar,
            terminationsCount: stats.count,
            profit: 0,
            profitPercentage: 0,
            volume: 0,
            trades: 0,
            winRate: 0,
          }))
          .sort((a, b) => b.terminationsCount - a.terminationsCount)
          .map((entry, index) => ({ ...entry, rank: index + 1 }))
          .slice(0, 100);

        return reply.send({ leaderboard });
      }

      const { data: trades, error } = await supabase
        .from('trades')
        .select(
          `
          user_id,
          amount,
          price,
          side,
          created_at,
          users:user_id (
            username,
            avatar_url,
            total_terminations
          )
        `
        )
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('leaderboard', 'Error fetching trades', error);
        return reply.send({ leaderboard: [] });
      }

      const userStats = new Map<
        string,
        {
          userId: string;
          username: string;
          avatar?: string;
          terminationsCount: number;
          profit: number;
          volume: number;
          trades: number;
          wins: number;
        }
      >();

      trades?.forEach((trade: any) => {
        const userId = trade.user_id;
        const stats = userStats.get(userId) || {
          userId,
          username: trade.users?.username || 'Anonymous',
          avatar: trade.users?.avatar_url,
          terminationsCount: trade.users?.total_terminations || 0,
          profit: 0,
          volume: 0,
          trades: 0,
          wins: 0,
        };

        const tradeValue = trade.amount * trade.price;
        stats.volume += Math.abs(tradeValue);
        stats.trades += 1;

        if (trade.side === 'buy') {
          stats.profit -= tradeValue;
        } else if (trade.side === 'sell') {
          stats.profit += tradeValue;
        }

        if (stats.profit > 0) {
          stats.wins += 1;
        }

        userStats.set(userId, stats);
      });

      const leaderboard = Array.from(userStats.values())
        .map((stats) => ({
          rank: 0,
          userId: stats.userId,
          username: stats.username,
          avatar: stats.avatar,
          terminationsCount: stats.terminationsCount,
          profit: stats.profit,
          profitPercentage: stats.volume > 0 ? (stats.profit / stats.volume) * 100 : 0,
          volume: stats.volume,
          trades: stats.trades,
          winRate: stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0,
        }))
        .sort((a, b) => (metric === 'volume' ? b.volume - a.volume : b.profit - a.profit))
        .map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }))
        .slice(0, 100);

      return reply.send({ leaderboard });
    } catch (error) {
      logger.error('leaderboard', 'Leaderboard API error', error);
      return reply.code(500).send({ error: 'Failed to fetch leaderboard' });
    }
  });
}
