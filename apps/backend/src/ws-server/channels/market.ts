/**
 * Market Channel - Public market data streaming
 * Orderbook updates, trades, price changes
 */

import { getRedisClient } from '../../lib/redis/client.js';
import { logger } from '../../lib/logger.js';

interface MarketSubscription {
  socket: any;
  marketId: string;
}

const subscriptions = new Map<string, Set<any>>();

export const marketChannel = {
  async subscribe(socket: any, channel: string): Promise<void> {
    // channel format: market:{marketId}
    const marketId = channel.replace('market:', '');
    
    if (!subscriptions.has(marketId)) {
      subscriptions.set(marketId, new Set());
    }
    subscriptions.get(marketId)!.add(socket);

    // Send current orderbook snapshot
    const redis = getRedisClient();
    if (redis) {
      try {
        const [yesBids, yesAsks, noBids, noAsks] = await Promise.all([
          redis.zrevrange(`ob:${marketId}:yes:bids`, 0, 19, 'WITHSCORES'),
          redis.zrange(`ob:${marketId}:yes:asks`, 0, 19, 'WITHSCORES'),
          redis.zrevrange(`ob:${marketId}:no:bids`, 0, 19, 'WITHSCORES'),
          redis.zrange(`ob:${marketId}:no:asks`, 0, 19, 'WITHSCORES'),
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

        socket.send(JSON.stringify({
          channel,
          event: 'snapshot',
          data: {
            marketId,
            yes: {
              bids: formatOrders(yesBids),
              asks: formatOrders(yesAsks),
            },
            no: {
              bids: formatOrders(noBids),
              asks: formatOrders(noAsks),
            },
          },
          timestamp: Date.now(),
        }));
      } catch (err) {
        logger.error('ws-market-channel', 'Failed to send orderbook snapshot', err);
      }
    }
  },

  unsubscribe(socket: any, channel: string): void {
    const marketId = channel.replace('market:', '');
    const subs = subscriptions.get(marketId);
    if (subs) {
      subs.delete(socket);
      if (subs.size === 0) {
        subscriptions.delete(marketId);
      }
    }
  },

  broadcast(marketId: string, event: string, data: any): void {
    const subs = subscriptions.get(marketId);
    if (!subs) return;

    const message = JSON.stringify({
      channel: `market:${marketId}`,
      event,
      data,
      timestamp: Date.now(),
    });

    for (const socket of subs) {
      try {
        socket.send(message);
      } catch (err) {
        logger.error('ws-market-channel', 'Failed to broadcast to market channel', err);
      }
    }
  },

  // Broadcast orderbook update
  broadcastOrderbookUpdate(marketId: string, outcomeType: string, side: string, updates: any[]): void {
    this.broadcast(marketId, 'orderbook', {
      outcomeType,
      side,
      updates,
    });
  },

  // Broadcast new trade
  broadcastTrade(marketId: string, trade: any): void {
    this.broadcast(marketId, 'trade', trade);
  },

  // Broadcast price update
  broadcastPrice(marketId: string, prices: { yesPrice: number; noPrice: number }): void {
    this.broadcast(marketId, 'price', prices);
  },
};
