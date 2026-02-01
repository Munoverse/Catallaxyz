/**
 * Redis Matching Engine
 * Executes Lua scripts for atomic order matching
 * Redis is the single source of truth for all matching operations
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getRedisClient, REDIS_KEYS, publishMessage } from './client.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load Lua scripts
// AUDIT FIX: Removed withdraw.lua - withdrawals now handled via Phantom wallet
const luaScripts = {
  placeOrder: readFileSync(join(__dirname, 'lua', 'place-order.lua'), 'utf-8'),
  cancelOrder: readFileSync(join(__dirname, 'lua', 'cancel-order.lua'), 'utf-8'),
  cancelAll: readFileSync(join(__dirname, 'lua', 'cancel-all.lua'), 'utf-8'),
  deposit: readFileSync(join(__dirname, 'lua', 'deposit.lua'), 'utf-8'),
};

// Script SHA cache
const scriptShas: Record<string, string> = {};

/**
 * Load scripts into Redis and get their SHAs
 */
export async function loadScripts(): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    logger.warn('redis-matching', 'Redis not available, scripts not loaded');
    return;
  }

  for (const [name, script] of Object.entries(luaScripts)) {
    try {
      const sha = await redis.script('LOAD', script);
      scriptShas[name] = sha as string;
      logger.info('redis-matching', `Loaded Lua script: ${name}`);
    } catch (err) {
      logger.error('redis-matching', `Failed to load Lua script ${name}`, err);
    }
  }
}

/**
 * Execute a Lua script by name
 */
async function execScript(
  name: keyof typeof luaScripts,
  keys: string[],
  args: (string | number)[]
): Promise<any> {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error('Redis not available');
  }

  // Ensure scripts are loaded
  if (!scriptShas[name]) {
    await loadScripts();
  }

  const sha = scriptShas[name];
  if (!sha) {
    throw new Error(`Script ${name} not loaded`);
  }

  try {
    const result = await redis.evalsha(sha, keys.length, ...keys, ...args.map(String));
    return JSON.parse(result as string);
  } catch (err: any) {
    // If script not found, reload and retry
    if (err.message?.includes('NOSCRIPT')) {
      await loadScripts();
      const result = await redis.evalsha(scriptShas[name], keys.length, ...keys, ...args.map(String));
      return JSON.parse(result as string);
    }
    throw err;
  }
}

export interface PlaceOrderParams {
  userId: string;
  walletAddress: string;
  marketId: string;
  outcomeType: 'yes' | 'no';
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  price: number;
  amount: bigint;
  clientOrderId?: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
}

export interface PlaceOrderResult {
  success: boolean;
  orderId?: string;
  status?: 'open' | 'partial' | 'filled' | 'cancelled' | 'rejected';
  filledAmount?: bigint;
  remainingAmount?: bigint;
  fills?: Array<{
    makerOrderId: string;
    makerUserId: string;
    price: number;
    size: bigint;
    timestamp: string;
  }>;
  error?: string;
}

/**
 * Place a new order (atomic via Lua script)
 */
export async function placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
  const orderId = uuidv4();
  const timestamp = Date.now().toString();
  const priceScaled = Math.floor(params.price * 1_000_000);

  const keys = [
    REDIS_KEYS.balance(params.userId),
    REDIS_KEYS.order(orderId),
    REDIS_KEYS.orderbook.bids(params.marketId, params.outcomeType),
    REDIS_KEYS.orderbook.asks(params.marketId, params.outcomeType),
    REDIS_KEYS.userOrders(params.userId),
  ];

  const args = [
    orderId,
    params.userId,
    params.marketId,
    params.outcomeType,
    params.side,
    params.orderType,
    priceScaled,
    params.amount.toString(),
    timestamp,
    params.clientOrderId || '',
  ];

  const result = await execScript('placeOrder', keys, args);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  // Broadcast to WebSocket
  await publishMessage('stream:orderbook', {
    event: 'order',
    marketId: params.marketId,
    outcomeType: params.outcomeType,
    order: {
      orderId,
      side: params.side,
      price: params.price,
      amount: params.amount.toString(),
      status: result.status,
    },
  });

  return {
    success: true,
    orderId,
    status: result.status,
    filledAmount: BigInt(result.filledAmount || 0),
    remainingAmount: BigInt(result.remainingAmount || 0),
    fills: result.fills?.map((f: any) => ({
      ...f,
      size: BigInt(f.size),
    })),
  };
}

export interface CancelOrderParams {
  orderId: string;
  userId: string;
}

export interface CancelOrderResult {
  success: boolean;
  unlockedAmount?: bigint;
  error?: string;
}

/**
 * Cancel an order (atomic via Lua script)
 */
export async function cancelOrder(params: CancelOrderParams): Promise<CancelOrderResult> {
  const redis = getRedisClient();
  if (!redis) {
    return { success: false, error: 'Redis not available' };
  }

  // Get order details first to construct keys
  const orderData = await redis.hgetall(REDIS_KEYS.order(params.orderId));
  if (!orderData || !orderData.market_id) {
    return { success: false, error: 'Order not found' };
  }

  const timestamp = Date.now().toString();
  const keys = [
    REDIS_KEYS.order(params.orderId),
    REDIS_KEYS.balance(params.userId),
    REDIS_KEYS.orderbook.bids(orderData.market_id, orderData.outcome_type),
    REDIS_KEYS.orderbook.asks(orderData.market_id, orderData.outcome_type),
    REDIS_KEYS.userOrders(params.userId),
  ];

  const args = [params.orderId, params.userId, timestamp];

  const result = await execScript('cancelOrder', keys, args);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  // Broadcast to WebSocket
  await publishMessage('stream:orderbook', {
    event: 'cancel',
    marketId: orderData.market_id,
    outcomeType: orderData.outcome_type,
    orderId: params.orderId,
  });

  return {
    success: true,
    unlockedAmount: BigInt(result.unlockedAmount || 0),
  };
}

export interface CancelAllOrdersParams {
  userId: string;
  marketId: string;
  outcomeType?: 'yes' | 'no';
}

export interface CancelAllOrdersResult {
  success: boolean;
  cancelledCount?: number;
  totalUnlocked?: bigint;
  error?: string;
}

/**
 * Cancel all orders for a market (atomic via Lua script)
 */
export async function cancelAllOrders(params: CancelAllOrdersParams): Promise<CancelAllOrdersResult> {
  const timestamp = Date.now().toString();
  const keys = [
    REDIS_KEYS.userOrders(params.userId),
    REDIS_KEYS.balance(params.userId),
  ];

  const args = [
    params.userId,
    params.marketId,
    params.outcomeType || '',
    timestamp,
  ];

  const result = await execScript('cancelAll', keys, args);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    cancelledCount: result.cancelledCount,
    totalUnlocked: BigInt(
      (result.totalUnlocked?.usdc || 0) +
      (result.totalUnlocked?.yes || 0) +
      (result.totalUnlocked?.no || 0)
    ),
  };
}

/**
 * Get order status from Redis
 */
export async function getOrderStatus(orderId: string): Promise<any | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  const data = await redis.hgetall(REDIS_KEYS.order(orderId));
  if (!data || !data.id) return null;

  return {
    orderId: data.id,
    userId: data.user_id,
    marketId: data.market_id,
    outcomeType: data.outcome_type,
    side: data.side,
    orderType: data.order_type,
    price: parseFloat(data.price) / 1_000_000,
    amount: data.amount,
    filledAmount: data.filled_amount,
    remainingAmount: data.remaining_amount,
    status: data.status,
    createdAt: data.created_at,
    clientOrderId: data.client_order_id || null,
  };
}

export interface UserBalance {
  usdcAvailable: bigint;
  usdcLocked: bigint;
  yesAvailable: bigint;
  yesLocked: bigint;
  noAvailable: bigint;
  noLocked: bigint;
}

/**
 * Get user balance from Redis
 */
export async function getUserBalance(userId: string): Promise<UserBalance | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  const data = await redis.hgetall(REDIS_KEYS.balance(userId));
  if (!data || Object.keys(data).length === 0) return null;

  return {
    usdcAvailable: BigInt(data.usdc_available || 0),
    usdcLocked: BigInt(data.usdc_locked || 0),
    yesAvailable: BigInt(data.yes_available || 0),
    yesLocked: BigInt(data.yes_locked || 0),
    noAvailable: BigInt(data.no_available || 0),
    noLocked: BigInt(data.no_locked || 0),
  };
}

export interface DepositParams {
  userId: string;
  amount: bigint;
  transactionSignature: string;
  slot?: number;
}

export interface DepositResult {
  success: boolean;
  newBalance?: bigint;
  error?: string;
}

/**
 * Deposit USDC to user balance
 */
export async function depositToBalance(params: DepositParams): Promise<DepositResult> {
  const timestamp = Date.now().toString();
  const keys = [REDIS_KEYS.balance(params.userId)];
  const args = [
    params.userId,
    params.amount.toString(),
    params.transactionSignature,
    timestamp,
  ];

  const result = await execScript('deposit', keys, args);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    newBalance: BigInt(result.newBalance || 0),
  };
}

// AUDIT FIX: Removed WithdrawParams, WithdrawResult, and withdrawFromBalance
// Withdrawals now handled directly via Phantom wallet

/**
 * Initialize balance for a new user
 */
export async function initializeBalance(userId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  const exists = await redis.exists(REDIS_KEYS.balance(userId));
  if (!exists) {
    await redis.hset(REDIS_KEYS.balance(userId), {
      usdc_available: '0',
      usdc_locked: '0',
      yes_available: '0',
      yes_locked: '0',
      no_available: '0',
      no_locked: '0',
    });
  }
}
