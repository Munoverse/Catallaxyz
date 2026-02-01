/**
 * Orderbook Routes for Data API
 * Read-only orderbook snapshot endpoints
 */

import type { FastifyInstance } from 'fastify';
import { createServerClient } from '../../lib/supabase.js';
import { getRedisClient } from '../../lib/redis/client.js';
import { logger } from '../../lib/logger.js';

export default async function orderbookRoutes(app: FastifyInstance) {
  // Get orderbook for a market
  app.get('/:marketId', async (request, reply) => {
    try {
      const { marketId } = request.params as { marketId: string };
      const query = request.query as Record<string, string | undefined>;
      const outcomeType = query.outcomeType || 'yes';
      const depth = parseInt(query.depth || '20', 10);

      // Try Redis first for real-time data
      const redis = getRedisClient();
      if (redis) {
        try {
          const [bids, asks] = await Promise.all([
            redis.zrevrange(`ob:${marketId}:${outcomeType}:bids`, 0, depth - 1, 'WITHSCORES'),
            redis.zrange(`ob:${marketId}:${outcomeType}:asks`, 0, depth - 1, 'WITHSCORES'),
          ]);

          const formatOrders = (orders: string[]) => {
            const result = [];
            for (let i = 0; i < orders.length; i += 2) {
              result.push({
                orderId: orders[i],
                price: parseFloat(orders[i + 1]),
              });
            }
            return result;
          };

          return reply.send({
            success: true,
            data: {
              marketId,
              outcomeType,
              bids: formatOrders(bids),
              asks: formatOrders(asks),
              timestamp: Date.now(),
              source: 'redis',
            },
          });
        } catch (err) {
          logger.warn('data-api-orderbook', 'Redis fetch failed, falling back to Postgres', err);
        }
      }

      // Fallback to Postgres
      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('orderbook_depth')
        .select('*')
        .eq('market_id', marketId)
        .eq('outcome_type', outcomeType);

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      const bids = (data || []).filter((o: any) => o.side === 'buy').slice(0, depth);
      const asks = (data || []).filter((o: any) => o.side === 'sell').slice(0, depth);

      return reply.send({
        success: true,
        data: {
          marketId,
          outcomeType,
          bids,
          asks,
          timestamp: Date.now(),
          source: 'postgres',
        },
      });
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  // Get spread for a market
  app.get('/:marketId/spread', async (request, reply) => {
    try {
      const { marketId } = request.params as { marketId: string };
      const query = request.query as Record<string, string | undefined>;
      const outcomeType = query.outcomeType || 'yes';

      const redis = getRedisClient();
      if (redis) {
        try {
          const [bestBid, bestAsk] = await Promise.all([
            redis.zrevrange(`ob:${marketId}:${outcomeType}:bids`, 0, 0, 'WITHSCORES'),
            redis.zrange(`ob:${marketId}:${outcomeType}:asks`, 0, 0, 'WITHSCORES'),
          ]);

          const bid = bestBid.length >= 2 ? parseFloat(bestBid[1]) : null;
          const ask = bestAsk.length >= 2 ? parseFloat(bestAsk[1]) : null;
          const spread = bid && ask ? ask - bid : null;
          const midpoint = bid && ask ? (bid + ask) / 2 : null;

          return reply.send({
            success: true,
            data: {
              marketId,
              outcomeType,
              bestBid: bid,
              bestAsk: ask,
              spread,
              midpoint,
              timestamp: Date.now(),
            },
          });
        } catch (err) {
          logger.warn('data-api-orderbook', 'Redis spread fetch failed', err);
        }
      }

      // Fallback to Postgres
      const supabase = createServerClient();
      const { data: market } = await supabase
        .from('markets')
        .select('bid_price, ask_price')
        .eq('id', marketId)
        .single();

      return reply.send({
        success: true,
        data: {
          marketId,
          outcomeType,
          bestBid: market?.bid_price || null,
          bestAsk: market?.ask_price || null,
          spread: market?.bid_price && market?.ask_price ? market.ask_price - market.bid_price : null,
          midpoint: market?.bid_price && market?.ask_price ? (market.bid_price + market.ask_price) / 2 : null,
          timestamp: Date.now(),
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
