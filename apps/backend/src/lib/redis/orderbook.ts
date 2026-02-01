/**
 * Redis Orderbook - Sorted Set based orderbook operations
 */

import { getRedisClient, REDIS_KEYS, publishMessage } from './client.js';

export interface OrderbookLevel {
  price: number;
  size: bigint;
  orderCount: number;
}

export interface OrderbookSnapshot {
  marketId: string;
  outcomeType: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
}

/**
 * Add an order to the orderbook
 */
export async function addToOrderbook(
  marketId: string,
  outcomeType: string,
  side: 'buy' | 'sell',
  orderId: string,
  price: number,
  amount: bigint
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) throw new Error('Redis not available');

  const key = side === 'buy'
    ? REDIS_KEYS.orderbook.bids(marketId, outcomeType)
    : REDIS_KEYS.orderbook.asks(marketId, outcomeType);

  // For bids, we use negative price so higher bids come first
  // For asks, we use positive price so lower asks come first
  const score = side === 'buy' ? -price : price;

  // Store order ID with price as score
  // The amount is stored in the order details hash
  await redis.zadd(key, score, orderId);

  // Publish orderbook update
  await publishMessage('stream:orderbook', {
    event: 'add',
    marketId,
    outcomeType,
    side,
    orderId,
    price,
    amount: amount.toString(),
  });
}

/**
 * Remove an order from the orderbook
 */
export async function removeFromOrderbook(
  marketId: string,
  outcomeType: string,
  side: 'buy' | 'sell',
  orderId: string
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) throw new Error('Redis not available');

  const key = side === 'buy'
    ? REDIS_KEYS.orderbook.bids(marketId, outcomeType)
    : REDIS_KEYS.orderbook.asks(marketId, outcomeType);

  await redis.zrem(key, orderId);

  // Publish orderbook update
  await publishMessage('stream:orderbook', {
    event: 'remove',
    marketId,
    outcomeType,
    side,
    orderId,
  });
}

/**
 * Get the best bid (highest buy price)
 */
export async function getBestBid(
  marketId: string,
  outcomeType: string
): Promise<{ orderId: string; price: number } | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  const key = REDIS_KEYS.orderbook.bids(marketId, outcomeType);
  const result = await redis.zrange(key, 0, 0, 'WITHSCORES');

  if (result.length < 2) return null;

  return {
    orderId: result[0],
    price: -parseFloat(result[1]), // Negate because we stored negative
  };
}

/**
 * Get the best ask (lowest sell price)
 */
export async function getBestAsk(
  marketId: string,
  outcomeType: string
): Promise<{ orderId: string; price: number } | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  const key = REDIS_KEYS.orderbook.asks(marketId, outcomeType);
  const result = await redis.zrange(key, 0, 0, 'WITHSCORES');

  if (result.length < 2) return null;

  return {
    orderId: result[0],
    price: parseFloat(result[1]),
  };
}

/**
 * Get orderbook depth
 */
export async function getOrderbookDepth(
  marketId: string,
  outcomeType: string,
  depth: number = 20
): Promise<OrderbookSnapshot> {
  const redis = getRedisClient();
  if (!redis) {
    return {
      marketId,
      outcomeType,
      bids: [],
      asks: [],
      timestamp: Date.now(),
    };
  }

  const [bidsRaw, asksRaw] = await Promise.all([
    redis.zrange(REDIS_KEYS.orderbook.bids(marketId, outcomeType), 0, depth - 1, 'WITHSCORES'),
    redis.zrange(REDIS_KEYS.orderbook.asks(marketId, outcomeType), 0, depth - 1, 'WITHSCORES'),
  ]);

  const parseBids = (raw: string[]) => {
    const result: Array<{ orderId: string; price: number }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      result.push({
        orderId: raw[i],
        price: -parseFloat(raw[i + 1]), // Negate for bids
      });
    }
    return result;
  };

  const parseAsks = (raw: string[]) => {
    const result: Array<{ orderId: string; price: number }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      result.push({
        orderId: raw[i],
        price: parseFloat(raw[i + 1]),
      });
    }
    return result;
  };

  // We need to aggregate by price level and get sizes from order hashes
  const bids = parseBids(bidsRaw);
  const asks = parseAsks(asksRaw);

  const orderIds = [...bids, ...asks].map((entry) => entry.orderId);
  const orderSizes = new Map<string, bigint>();

  if (orderIds.length > 0) {
    const pipeline = redis.multi();
    for (const orderId of orderIds) {
      pipeline.hget(REDIS_KEYS.order(orderId), 'remaining_amount');
    }
    const results = await pipeline.exec();
    for (let i = 0; i < orderIds.length; i += 1) {
      const [, value] = results?.[i] || [];
      if (value == null) continue;
      try {
        orderSizes.set(orderIds[i], BigInt(value));
      } catch {
        orderSizes.set(orderIds[i], 0n);
      }
    }
  }

  const aggregateLevels = (entries: Array<{ orderId: string; price: number }>) => {
    const levelMap = new Map<string, { price: number; size: bigint; orderCount: number }>();
    const order = [] as string[];
    for (const entry of entries) {
      const size = orderSizes.get(entry.orderId);
      if (size == null) continue;
      const key = entry.price.toString();
      if (!levelMap.has(key)) {
        levelMap.set(key, { price: entry.price, size: 0n, orderCount: 0 });
        order.push(key);
      }
      const level = levelMap.get(key)!;
      level.size += size;
      level.orderCount += 1;
    }
    return order.map((key) => levelMap.get(key)!);
  };

  return {
    marketId,
    outcomeType,
    bids: aggregateLevels(bids),
    asks: aggregateLevels(asks),
    timestamp: Date.now(),
  };
}

/**
 * Get spread (best bid - best ask)
 */
export async function getSpread(
  marketId: string,
  outcomeType: string
): Promise<{ bid: number | null; ask: number | null; spread: number | null }> {
  const [bestBid, bestAsk] = await Promise.all([
    getBestBid(marketId, outcomeType),
    getBestAsk(marketId, outcomeType),
  ]);

  const bid = bestBid?.price ?? null;
  const ask = bestAsk?.price ?? null;
  const spread = bid !== null && ask !== null ? ask - bid : null;

  return { bid, ask, spread };
}

/**
 * Get all order IDs at a price level
 */
export async function getOrdersAtPrice(
  marketId: string,
  outcomeType: string,
  side: 'buy' | 'sell',
  price: number
): Promise<string[]> {
  const redis = getRedisClient();
  if (!redis) return [];

  const key = side === 'buy'
    ? REDIS_KEYS.orderbook.bids(marketId, outcomeType)
    : REDIS_KEYS.orderbook.asks(marketId, outcomeType);

  const score = side === 'buy' ? -price : price;

  // Get all orders at this exact price
  return redis.zrangebyscore(key, score, score);
}

/**
 * Clear orderbook for a market (used for market settlement)
 */
export async function clearOrderbook(
  marketId: string,
  outcomeType?: string
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  const outcomes = outcomeType ? [outcomeType] : ['yes', 'no'];

  for (const outcome of outcomes) {
    await Promise.all([
      redis.del(REDIS_KEYS.orderbook.bids(marketId, outcome)),
      redis.del(REDIS_KEYS.orderbook.asks(marketId, outcome)),
    ]);
  }
}
