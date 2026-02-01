/**
 * Persist Worker
 * Syncs data from Redis to Postgres for durability
 * Redis is the source of truth for matching, Postgres is the ledger
 * 
 * AUDIT FIX HIGH-4, HIGH-8, HIGH-9: Added proper cleanup, SCAN instead of KEYS, LRU cache
 */

import { getRedisClient, REDIS_KEYS, disconnectRedis } from '../lib/redis/client.js';
import { createServerClient } from '../lib/supabase.js';
import { createNotification } from '../lib/notifications.js';
import { loadEnv } from '../lib/env.js';
import { logger } from '../lib/logger.js';

loadEnv();

// Stream consumer configuration
const CONSUMER_GROUP = 'persist-workers';
const CONSUMER_NAME = `persist-${process.pid}`;
const BATCH_SIZE = 100;
const BLOCK_MS = 5000; // Block for 5 seconds waiting for new messages
const PENDING_IDLE_MS = Number(process.env.PERSIST_PENDING_IDLE_MS || 60_000);

// AUDIT FIX HIGH-9: LRU Cache with size limit
const CACHE_MAX_SIZE = 1000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface FillEvent {
  takerOrderId: string;
  makerOrderId: string;
  takerUserId: string;
  makerUserId: string;
  marketId: string;
  outcomeType: string;
  side: string;
  price: string;
  size: string;
  timestamp: string;
}

interface OrderEvent {
  orderId: string;
  userId: string;
  marketId: string;
  outcomeType: string;
  side: string;
  orderType?: string;
  price: string;
  amount?: string;
  filledAmount?: string;
  remainingAmount?: string;
  status: string;
  timestamp: string;
}

// AUDIT FIX HIGH-9: Simple LRU cache with TTL and size limit
class LRUCache<K, V> {
  private cache = new Map<K, { value: V; timestamp: number }>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }
    
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    // Remove oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      } else {
        break;
      }
    }
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.cache.clear();
  }
}

const marketTitleCache = new LRUCache<string, string>(CACHE_MAX_SIZE, CACHE_TTL_MS);

async function getMarketTitle(marketId: string): Promise<string | null> {
  const cached = marketTitleCache.get(marketId);
  if (cached) {
    return cached;
  }

  const supabase = createServerClient();
  const { data } = await supabase
    .from('markets')
    .select('title')
    .eq('id', marketId)
    .single();

  if (data?.title) {
    marketTitleCache.set(marketId, data.title);
    return data.title;
  }

  return null;
}

/**
 * Initialize consumer group for streams
 */
async function initConsumerGroups(): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error('Redis not available');
  }

  const streams = ['stream:fills', 'stream:orders', 'stream:deposits', 'stream:withdrawals'];

  for (const stream of streams) {
    try {
      await redis.xgroup('CREATE', stream, CONSUMER_GROUP, '0', 'MKSTREAM');
      logger.info('persist-worker', `Created consumer group for ${stream}`);
    } catch (err: any) {
      // Group already exists
      if (!err.message?.includes('BUSYGROUP')) {
        logger.error('persist-worker', `Error creating consumer group for ${stream}`, err);
      }
    }
  }
}

async function readPendingMessages(
  redis: ReturnType<typeof getRedisClient>,
  stream: string
): Promise<Array<[string, string[]]>> {
  if (!redis) return [];
  try {
    const result = await (redis as any).xautoclaim(
      stream,
      CONSUMER_GROUP,
      CONSUMER_NAME,
      PENDING_IDLE_MS,
      '0-0',
      'COUNT',
      BATCH_SIZE
    );
    if (!result || !Array.isArray(result) || !Array.isArray(result[1])) {
      return [];
    }
    return result[1] as Array<[string, string[]]>;
  } catch (error) {
    logger.error('persist-worker', `Error claiming pending messages for ${stream}`, error);
    return [];
  }
}

async function processFillMessages(
  messages: Array<[string, string[]]>,
  supabase: ReturnType<typeof createServerClient>,
  redis: ReturnType<typeof getRedisClient>
): Promise<number> {
  let processed = 0;
  if (!redis) return processed;

  for (const [messageId, fields] of messages) {
    try {
      // Parse fields into object
      const fill: Partial<FillEvent> = {};
      for (let i = 0; i < fields.length; i += 2) {
        (fill as any)[fields[i]] = fields[i + 1];
      }

      // AUDIT FIX D-C1: Check idempotency before inserting to prevent duplicates from race conditions
      // First check if this fill already exists
      const { data: existingFill } = await supabase
        .from('order_fills')
        .select('id')
        .eq('maker_order_id', fill.makerOrderId)
        .eq('taker_order_id', fill.takerOrderId)
        .single();
      
      if (existingFill) {
        // Already processed, just acknowledge and skip
        await redis.xack('stream:fills', CONSUMER_GROUP, messageId);
        processed++;
        continue;
      }
      
      // Insert into order_fills with unique constraint
      const { error: fillError } = await supabase
        .from('order_fills')
        .upsert({
          maker_order_id: fill.makerOrderId,
          taker_order_id: fill.takerOrderId,
          maker_user_id: fill.makerUserId,
          taker_user_id: fill.takerUserId,
          market_id: fill.marketId,
          outcome_type: fill.outcomeType,
          side: fill.side,
          price: parseFloat(fill.price || '0') / 1_000_000,
          size: fill.size,
          total_cost: Math.floor(
            (parseFloat(fill.size || '0') * parseFloat(fill.price || '0')) / 1_000_000
          ).toString(),
          created_at: new Date(parseInt(fill.timestamp || '0')).toISOString(),
        }, {
          onConflict: 'maker_order_id,taker_order_id',
          ignoreDuplicates: true,
        });

      if (fillError) {
        logger.error('persist-worker', 'Error persisting fill', fillError);
        continue;
      }

      // Insert into trades
      await supabase
        .from('trades')
        .insert({
          market_id: fill.marketId,
          user_id: fill.takerUserId,
          maker_order_id: fill.makerOrderId,
          taker_order_id: fill.takerOrderId,
          maker_user_id: fill.makerUserId,
          taker_user_id: fill.takerUserId,
          outcome_type: fill.outcomeType,
          side: fill.side,
          amount: fill.size,
          price: parseFloat(fill.price || '0') / 1_000_000,
          total_cost: Math.floor(
            (parseFloat(fill.size || '0') * parseFloat(fill.price || '0')) / 1_000_000
          ).toString(),
          block_time: new Date(parseInt(fill.timestamp || '0')).toISOString(),
        });

      // Update market stats
      // Update market stats - ignore if RPC doesn't exist
      try {
        await supabase.rpc('update_market_stats_on_trade', {
          p_market_id: fill.marketId,
          p_settlement_index: 0,
          p_amount: fill.size,
          p_price: parseFloat(fill.price || '0') / 1_000_000,
          p_token_type: fill.outcomeType,
        });
      } catch { /* Ignore RPC errors */ }

      // Create notifications for maker and taker
      const marketTitle = await getMarketTitle(fill.marketId || '');
      const title = 'Order filled';
      const message = marketTitle
        ? `Your order in "${marketTitle}" was filled`
        : 'Your order was filled';

      if (fill.makerUserId) {
        await createNotification({
          userId: fill.makerUserId,
          type: 'trade',
          title,
          message,
          marketId: fill.marketId,
        }, supabase);
      }

      if (fill.takerUserId && fill.takerUserId !== fill.makerUserId) {
        await createNotification({
          userId: fill.takerUserId,
          type: 'trade',
          title,
          message,
          marketId: fill.marketId,
        }, supabase);
      }

      // Acknowledge message
      await redis.xack('stream:fills', CONSUMER_GROUP, messageId);
      processed++;
    } catch (err) {
      logger.error('persist-worker', 'Error processing fill message', err);
    }
  }

  return processed;
}

async function processOrderMessages(
  messages: Array<[string, string[]]>,
  supabase: ReturnType<typeof createServerClient>,
  redis: ReturnType<typeof getRedisClient>
): Promise<number> {
  let processed = 0;
  if (!redis) return processed;

  for (const [messageId, fields] of messages) {
    try {
      const order: Partial<OrderEvent> = {};
      for (let i = 0; i < fields.length; i += 2) {
        (order as any)[fields[i].replace(/_([a-z])/g, (_, l) => l.toUpperCase())] = fields[i + 1];
      }

      // Upsert order
      await supabase
        .from('orders')
        .upsert({
          id: order.orderId,
          user_id: order.userId,
          market_id: order.marketId,
          outcome_type: order.outcomeType,
          side: order.side,
          order_type: order.orderType || 'limit',
          price: parseFloat(order.price || '0') / 1_000_000,
          amount: order.amount,
          filled_amount: order.filledAmount,
          remaining_amount: order.remainingAmount,
          status: order.status,
          updated_at: new Date(parseInt(order.timestamp || '0')).toISOString(),
        }, {
          onConflict: 'id',
        });

      await redis.xack('stream:orders', CONSUMER_GROUP, messageId);
      processed++;
    } catch (err) {
      logger.error('persist-worker', 'Error processing order message', err);
    }
  }

  return processed;
}

async function processDepositMessages(
  messages: Array<[string, string[]]>,
  supabase: ReturnType<typeof createServerClient>,
  redis: ReturnType<typeof getRedisClient>
): Promise<number> {
  let processed = 0;
  if (!redis) return processed;

  for (const [messageId, fields] of messages) {
    try {
      const deposit: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        deposit[fields[i]] = fields[i + 1];
      }

      // AUDIT FIX D-C1: Check idempotency for deposits using transaction signature
      if (deposit.tx_signature) {
        const { data: existingDeposit } = await supabase
          .from('user_operations')
          .select('id')
          .eq('transaction_signature', deposit.tx_signature)
          .eq('operation_type', 'deposit')
          .single();
        
        if (existingDeposit) {
          // Already processed, just acknowledge and skip
          await redis.xack('stream:deposits', CONSUMER_GROUP, messageId);
          processed++;
          continue;
        }
      }
      
      // Record deposit operation with upsert to prevent duplicates
      await supabase
        .from('user_operations')
        .upsert({
          user_id: deposit.user_id,
          operation_type: 'deposit',
          amount: deposit.amount,
          usdc_amount: deposit.amount,
          transaction_signature: deposit.tx_signature,
          created_at: new Date(parseInt(deposit.timestamp)).toISOString(),
        }, {
          onConflict: 'transaction_signature',
          ignoreDuplicates: true,
        });

      // Update user_balances snapshot in Postgres - ignore if RPC doesn't exist
      try {
        await supabase.rpc('deposit_usdc_balance', {
          p_user_id: deposit.user_id,
          p_amount: deposit.amount,
        });
      } catch { /* Ignore RPC errors */ }

      await redis.xack('stream:deposits', CONSUMER_GROUP, messageId);
      processed++;
    } catch (err) {
      logger.error('persist-worker', 'Error processing deposit message', err);
    }
  }

  return processed;
}

/**
 * Process fill events from Redis stream
 */
async function processFills(): Promise<number> {
  const redis = getRedisClient();
  const supabase = createServerClient();
  if (!redis) return 0;

  try {
    let processed = 0;

    const pendingMessages = await readPendingMessages(redis, 'stream:fills');
    processed += await processFillMessages(pendingMessages, supabase, redis);

    const result = await redis.xreadgroup(
      'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
      'COUNT', BATCH_SIZE,
      'BLOCK', BLOCK_MS,
      'STREAMS', 'stream:fills', '>'
    );

    if (!result || result.length === 0) return processed;

    const [, messages] = result[0];
    processed += await processFillMessages(messages, supabase, redis);

    return processed;
  } catch (err) {
    logger.error('persist-worker', 'Error reading fills stream', err);
    return 0;
  }
}

/**
 * Process order events from Redis stream
 */
async function processOrders(): Promise<number> {
  const redis = getRedisClient();
  const supabase = createServerClient();
  if (!redis) return 0;

  try {
    let processed = 0;

    const pendingMessages = await readPendingMessages(redis, 'stream:orders');
    processed += await processOrderMessages(pendingMessages, supabase, redis);

    const result = await redis.xreadgroup(
      'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
      'COUNT', BATCH_SIZE,
      'BLOCK', BLOCK_MS,
      'STREAMS', 'stream:orders', '>'
    );

    if (!result || result.length === 0) return processed;

    const [, messages] = result[0];
    processed += await processOrderMessages(messages, supabase, redis);

    return processed;
  } catch (err) {
    logger.error('persist-worker', 'Error reading orders stream', err);
    return 0;
  }
}

/**
 * Process deposit events
 */
async function processDeposits(): Promise<number> {
  const redis = getRedisClient();
  const supabase = createServerClient();
  if (!redis) return 0;

  try {
    let processed = 0;

    const pendingMessages = await readPendingMessages(redis, 'stream:deposits');
    processed += await processDepositMessages(pendingMessages, supabase, redis);

    const result = await redis.xreadgroup(
      'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
      'COUNT', BATCH_SIZE,
      'BLOCK', 1000,
      'STREAMS', 'stream:deposits', '>'
    );

    if (!result || result.length === 0) return processed;

    const [, messages] = result[0];
    processed += await processDepositMessages(messages, supabase, redis);

    return processed;
  } catch (err) {
    logger.error('persist-worker', 'Error reading deposits stream', err);
    return 0;
  }
}

/**
 * AUDIT FIX HIGH-8: Use SCAN instead of KEYS to avoid blocking Redis
 * Generator function to iterate through keys matching a pattern
 */
async function* scanKeys(redis: ReturnType<typeof getRedisClient>, pattern: string): AsyncGenerator<string> {
  if (!redis) return;
  
  let cursor = '0';
  do {
    const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = result[0];
    const keys = result[1] as string[];
    for (const key of keys) {
      yield key;
    }
  } while (cursor !== '0');
}

/**
 * Sync balance snapshots from Redis to Postgres periodically
 */
async function syncBalanceSnapshots(): Promise<void> {
  const redis = getRedisClient();
  const supabase = createServerClient();
  if (!redis) return;

  try {
    let syncedCount = 0;
    const batchSize = 50;
    let batch: Array<{
      user_id: string;
      usdc_available: string;
      usdc_locked: string;
      yes_available: string;
      yes_locked: string;
      no_available: string;
      no_locked: string;
      updated_at: string;
    }> = [];

    // AUDIT FIX HIGH-8: Use SCAN instead of KEYS
    for await (const key of scanKeys(redis, 'bal:*')) {
      const userId = key.replace('bal:', '');
      const balance = await redis.hgetall(key);

      if (balance && Object.keys(balance).length > 0) {
        batch.push({
          user_id: userId,
          usdc_available: balance.usdc_available || '0',
          usdc_locked: balance.usdc_locked || '0',
          yes_available: balance.yes_available || '0',
          yes_locked: balance.yes_locked || '0',
          no_available: balance.no_available || '0',
          no_locked: balance.no_locked || '0',
          updated_at: new Date().toISOString(),
        });

        // Batch upsert for efficiency
        if (batch.length >= batchSize) {
          await supabase
            .from('user_balances')
            .upsert(batch, { onConflict: 'user_id' });
          syncedCount += batch.length;
          batch = [];
        }
      }
    }

    // Process remaining batch
    if (batch.length > 0) {
      await supabase
        .from('user_balances')
        .upsert(batch, { onConflict: 'user_id' });
      syncedCount += batch.length;
    }

    logger.info('persist-worker', `Synced ${syncedCount} balance snapshots to Postgres`);
  } catch (err) {
    logger.error('persist-worker', 'Error syncing balance snapshots', err);
  }
}

/**
 * Main worker loop
 */
async function runWorker(): Promise<void> {
  logger.info('persist-worker', `Worker starting (PID: ${process.pid})`);

  await initConsumerGroups();

  let balanceSyncCounter = 0;
  const BALANCE_SYNC_INTERVAL = 60; // Sync balances every 60 iterations (~5 minutes)

  while (true) {
    try {
      // Process all streams
      const [fills, orders, deposits] = await Promise.all([
        processFills(),
        processOrders(),
        processDeposits(),
      ]);

      if (fills + orders + deposits > 0) {
        logger.info('persist-worker', `Processed: ${fills} fills, ${orders} orders, ${deposits} deposits`);
      }

      // Periodic balance snapshot sync
      balanceSyncCounter++;
      if (balanceSyncCounter >= BALANCE_SYNC_INTERVAL) {
        await syncBalanceSnapshots();
        balanceSyncCounter = 0;
      }
    } catch (err) {
      logger.error('persist-worker', 'Worker error', err);
      // Wait before retrying on error
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// AUDIT FIX HIGH-4: Graceful shutdown with proper cleanup
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  logger.info('persist-worker', `Received ${signal}, shutting down gracefully...`);
  
  try {
    // Clear cache
    marketTitleCache.clear();
    
    // Disconnect Redis
    await disconnectRedis();
    logger.info('persist-worker', 'Redis connection closed');
  } catch (err) {
    logger.error('persist-worker', 'Error during cleanup', err);
  }
  
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start worker
runWorker().catch(err => {
  logger.error('persist-worker', 'Fatal error', err);
  process.exit(1);
});
