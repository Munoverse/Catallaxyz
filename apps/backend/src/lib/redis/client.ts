/**
 * Redis Client - Connection pool and client management
 * Supports both regular operations and Pub/Sub
 */

import IORedis from 'ioredis';
import { logger } from '../logger.js';

// Use any type to avoid complex ioredis typing issues
type RedisClient = any;
let redisClient: RedisClient | null = null;
let redisSubscriber: RedisClient | null = null;

// Cast to constructor for ESM compatibility
const Redis = IORedis.default || IORedis;

/**
 * AUDIT FIX v2.0.3: Enhanced Redis configuration with auto-reconnect strategy
 */
// AUDIT FIX D-H4: Warn if Redis password not configured in production
const redisPassword = process.env.REDIS_PASSWORD;
if (process.env.NODE_ENV === 'production' && !redisPassword) {
  logger.warn('redis', 'REDIS_PASSWORD not configured in production environment');
}

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: redisPassword || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  maxRetriesPerRequest: 3,
  enableOfflineQueue: true,
  connectTimeout: 10000,
  lazyConnect: true,
  // Connection pool settings
  family: 4, // IPv4
  keepAlive: 30000,
  
  // AUDIT FIX: Auto-reconnect strategy with exponential backoff
  retryStrategy: (times: number) => {
    if (times > 10) {
      // Stop retrying after 10 attempts
      logger.error('redis', 'Max reconnection attempts reached, giving up');
      return null;
    }
    // Exponential backoff: min 50ms, max 30s
    const delay = Math.min(Math.pow(2, times) * 50, 30000);
    logger.warn('redis', `Reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },
  
  // Reconnect on certain errors
  reconnectOnError: (err: Error) => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    const shouldReconnect = targetErrors.some(e => err.message.includes(e));
    if (shouldReconnect) {
      logger.warn('redis', `Reconnecting due to error: ${err.message}`);
    }
    return shouldReconnect;
  },
};

/**
 * Get or create the main Redis client
 */
export function getRedisClient(): RedisClient | null {
  if (!process.env.REDIS_HOST && !process.env.REDIS_URL) {
    return null;
  }

  if (!redisClient) {
    if (process.env.REDIS_URL) {
      redisClient = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: REDIS_CONFIG.maxRetriesPerRequest,
        enableOfflineQueue: REDIS_CONFIG.enableOfflineQueue,
        connectTimeout: REDIS_CONFIG.connectTimeout,
        lazyConnect: REDIS_CONFIG.lazyConnect,
      });
    } else {
      redisClient = new Redis(REDIS_CONFIG);
    }

    redisClient.on('error', (err: any) => {
      logger.error('redis', 'Client error', err);
    });

    redisClient.on('connect', () => {
      logger.info('redis', 'Client connected');
    });

    redisClient.on('ready', () => {
      logger.info('redis', 'Client ready');
    });

    redisClient.on('close', () => {
      logger.info('redis', 'Client connection closed');
    });

    // AUDIT FIX: Handle reconnection events
    redisClient.on('reconnecting', (delay: number) => {
      logger.info('redis', `Reconnecting in ${delay}ms`);
    });

    redisClient.on('end', () => {
      logger.warn('redis', 'Connection ended, will not reconnect');
    });
  }

  return redisClient;
}

/**
 * Get or create the Redis subscriber client (for Pub/Sub)
 */
export function getRedisSubscriber(): RedisClient | null {
  if (!process.env.REDIS_HOST && !process.env.REDIS_URL) {
    return null;
  }

  if (!redisSubscriber) {
    if (process.env.REDIS_URL) {
      redisSubscriber = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: REDIS_CONFIG.maxRetriesPerRequest,
        enableOfflineQueue: REDIS_CONFIG.enableOfflineQueue,
        connectTimeout: REDIS_CONFIG.connectTimeout,
        lazyConnect: REDIS_CONFIG.lazyConnect,
      });
    } else {
      redisSubscriber = new Redis(REDIS_CONFIG);
    }

    redisSubscriber.on('error', (err: any) => {
      logger.error('redis', 'Subscriber error', err);
    });

    redisSubscriber.on('connect', () => {
      logger.info('redis', 'Subscriber connected');
    });
  }

  return redisSubscriber;
}

/**
 * Connect to Redis (call on startup)
 */
export async function connectRedis(): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!client) {
      logger.warn('redis', 'Redis not configured, skipping connection');
      return false;
    }

    await client.connect();
    await client.ping();
    logger.info('redis', 'Connection established');
    return true;
  } catch (err) {
    logger.error('redis', 'Failed to connect', err);
    return false;
  }
}

/**
 * Disconnect from Redis (call on shutdown)
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
  if (redisSubscriber) {
    await redisSubscriber.quit();
    redisSubscriber = null;
  }
  logger.info('redis', 'Connections closed');
}

/**
 * Execute a Redis transaction
 */
export async function executeTransaction(
  commands: Array<[string, ...any[]]>
): Promise<any[]> {
  const client = getRedisClient();
  if (!client) {
    throw new Error('Redis not available');
  }

  const pipeline = client.multi();
  for (const [cmd, ...args] of commands) {
    (pipeline as any)[cmd](...args);
  }
  return pipeline.exec();
}

/**
 * Publish a message to a channel
 */
export async function publishMessage(channel: string, message: any): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    logger.warn('redis', 'Redis not available, message not published');
    return;
  }

  await client.publish(channel, JSON.stringify(message));
}

/**
 * Get Redis info (for health checks)
 */
export async function getRedisInfo(): Promise<{ connected: boolean; info?: string }> {
  const client = getRedisClient();
  if (!client) {
    return { connected: false };
  }

  try {
    const info = await client.info('server');
    return { connected: true, info };
  } catch (err) {
    return { connected: false };
  }
}

// Key patterns for the matching engine
export const REDIS_KEYS = {
  // Orderbook keys (legacy CLOB)
  orderbook: {
    bids: (marketId: string, outcome: string) => `ob:${marketId}:${outcome}:bids`,
    asks: (marketId: string, outcome: string) => `ob:${marketId}:${outcome}:asks`,
  },
  // Order details (legacy CLOB)
  order: (orderId: string) => `order:${orderId}`,
  // User orders index (legacy CLOB)
  userOrders: (userId: string) => `user:${userId}:orders`,
  // User balance
  balance: (userId: string) => `bal:${userId}`,
  // Fill record
  fill: (fillId: string) => `fill:${fillId}`,
  // Market data
  market: (marketId: string) => `market:${marketId}`,
  // Streams
  streams: {
    fills: 'stream:fills',
    orders: 'stream:orders',
    orderbook: 'stream:orderbook',
  },
  // Withdrawals queue
  withdrawals: 'queue:withdrawals',

  // ============================================
  // Signed Order Keys (Exchange/Polymarket-style)
  // ============================================
  
  // Signed order data (hash contains full order + signature)
  // Fields: orderHash, order (JSON), signature, status, createdAt, filledAmount, remainingAmount
  signedOrder: (orderHash: string) => `sorder:${orderHash}`,
  
  // Signed orderbook sorted sets (score = price scaled by 1e6)
  // tokenId: 1=YES, 2=NO
  // side: 'bids' for BUY orders, 'asks' for SELL orders
  signedOrderbook: {
    bids: (marketId: string, tokenId: number) => `sob:${marketId}:${tokenId}:bids`,
    asks: (marketId: string, tokenId: number) => `sob:${marketId}:${tokenId}:asks`,
  },
  
  // User's signed orders index (set of order hashes)
  signedUserOrders: (wallet: string) => `suser:${wallet}:orders`,
  
  // Match queue for settlement worker (list of match data JSON)
  matchQueue: 'queue:matches',
  
  // Failed matches for retry (list)
  failedMatches: 'queue:failed_matches',
  
  // Lock key for order matching (prevent double-matching)
  matchLock: (orderHash: string) => `lock:match:${orderHash}`,
};
