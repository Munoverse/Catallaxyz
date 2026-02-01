/**
 * Signed Order Matching Engine
 * 
 * Matches signed orders against each other and queues matches for on-chain settlement.
 * 
 * Key concepts:
 * - BUY orders: maker provides USDC, wants tokens (YES/NO)
 * - SELL orders: maker provides tokens, wants USDC
 * - Price matching: BUY price >= SELL price means they can match
 * - Contract limit: max 5 makers per transaction
 */

import { PublicKey } from '@solana/web3.js';
import { getRedisClient, REDIS_KEYS } from './redis/client.js';
import { 
  type Order, 
  type SignedOrder, 
  calculateOrderPrice,
  SIDE,
} from './exchange-types.js';
import { logger } from './logger.js';
import bs58 from 'bs58';

// Maximum makers per match (contract limit)
const MAX_MAKERS_PER_MATCH = 5;

// Lock timeout in milliseconds
const LOCK_TIMEOUT_MS = 5000;

// ============================================
// Types
// ============================================

export interface MatchResult {
  takerOrderHash: string;
  makerOrderHashes: string[];
  takerFillAmount: string;
  makerFillAmounts: string[];
  market: string;
  tokenId: number;
}

interface StoredOrderData {
  orderHash: string;
  order: string; // JSON stringified Order
  signature: string;
  status: string;
  createdAt: string;
  filledAmount: string;
  remainingAmount: string;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Parse stored order data back into SignedOrder
 */
function parseStoredOrder(data: StoredOrderData): SignedOrder | null {
  try {
    const orderJson = JSON.parse(data.order);
    const order: Order = {
      salt: BigInt(orderJson.salt),
      maker: new PublicKey(orderJson.maker),
      signer: new PublicKey(orderJson.signer),
      taker: new PublicKey(orderJson.taker),
      market: new PublicKey(orderJson.market),
      tokenId: orderJson.tokenId,
      makerAmount: BigInt(orderJson.makerAmount),
      takerAmount: BigInt(orderJson.takerAmount),
      expiration: BigInt(orderJson.expiration),
      nonce: BigInt(orderJson.nonce),
      feeRateBps: orderJson.feeRateBps,
      side: orderJson.side,
    };

    return {
      order,
      signature: bs58.decode(data.signature),
    };
  } catch (err) {
    logger.error('signed-order-matching', 'Failed to parse stored order', err);
    return null;
  }
}

/**
 * Load a signed order from Redis by hash
 */
export async function loadSignedOrder(orderHash: string): Promise<SignedOrder | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  const data = await redis.hgetall(REDIS_KEYS.signedOrder(orderHash)) as StoredOrderData;
  if (!data || !data.order) return null;

  return parseStoredOrder(data);
}

/**
 * Load stored order data (without parsing)
 */
async function loadStoredOrderData(orderHash: string): Promise<StoredOrderData | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  const data = await redis.hgetall(REDIS_KEYS.signedOrder(orderHash)) as StoredOrderData;
  if (!data || !data.order) return null;

  return data;
}

/**
 * Acquire a lock for order matching to prevent double-matching
 */
async function acquireLock(orderHash: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;

  const lockKey = REDIS_KEYS.matchLock(orderHash);
  const result = await redis.set(lockKey, '1', 'PX', LOCK_TIMEOUT_MS, 'NX');
  return result === 'OK';
}

/**
 * Release a lock for order matching
 */
async function releaseLock(orderHash: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  await redis.del(REDIS_KEYS.matchLock(orderHash));
}

// ============================================
// Main Matching Function
// ============================================

/**
 * Try to match a signed order against the opposite side of the orderbook.
 * 
 * @param takerOrder - The incoming order to match
 * @param takerOrderHash - Hash of the taker order
 * @returns true if a match was queued, false otherwise
 */
export async function tryMatchSignedOrder(
  takerOrder: SignedOrder,
  takerOrderHash: string
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    logger.warn('signed-order-matching', 'Redis not available');
    return false;
  }

  // Acquire lock to prevent concurrent matching
  if (!await acquireLock(takerOrderHash)) {
    logger.debug('signed-order-matching', 'Could not acquire lock', { takerOrderHash });
    return false;
  }

  try {
    const market = takerOrder.order.market.toBase58();
    const tokenId = takerOrder.order.tokenId;
    const takerSide = takerOrder.order.side;
    const takerPrice = calculateOrderPrice(takerOrder.order);

    // Determine opposite orderbook
    // If taker is BUY (side=0), we look at SELL orders (asks)
    // If taker is SELL (side=1), we look at BUY orders (bids)
    const oppositeOrderbookKey = takerSide === SIDE.BUY
      ? REDIS_KEYS.signedOrderbook.asks(market, tokenId)
      : REDIS_KEYS.signedOrderbook.bids(market, tokenId);

    // Get crossing orders from opposite orderbook
    // For asks (SELL), we want lowest price first (positive scores, ascending)
    // For bids (BUY), we want highest price first (negative scores, ascending)
    let crossingOrderHashes: string[];
    
    if (takerSide === SIDE.BUY) {
      // Taker wants to BUY at takerPrice
      // Match against SELL orders where sellPrice <= takerPrice
      // Asks are stored with positive scores, lowest first
      crossingOrderHashes = await redis.zrangebyscore(
        oppositeOrderbookKey,
        '-inf',
        Number(takerPrice),
        'LIMIT',
        0,
        MAX_MAKERS_PER_MATCH
      );
    } else {
      // Taker wants to SELL at takerPrice
      // Match against BUY orders where buyPrice >= takerPrice
      // Bids are stored with negative scores (so highest price has most negative score)
      // We need orders where -buyPrice <= -takerPrice, i.e., buyPrice >= takerPrice
      crossingOrderHashes = await redis.zrangebyscore(
        oppositeOrderbookKey,
        '-inf',
        -Number(takerPrice),
        'LIMIT',
        0,
        MAX_MAKERS_PER_MATCH
      );
    }

    if (crossingOrderHashes.length === 0) {
      logger.debug('signed-order-matching', 'No crossing orders found', {
        takerOrderHash,
        market,
        tokenId,
        takerSide,
        takerPrice: takerPrice.toString(),
      });
      return false;
    }

    logger.info('signed-order-matching', 'Found crossing orders', {
      takerOrderHash,
      crossingCount: crossingOrderHashes.length,
    });

    // Load maker orders and calculate fill amounts
    const makerOrderHashes: string[] = [];
    const makerFillAmounts: string[] = [];
    let takerRemainingAmount = takerOrder.order.makerAmount;

    for (const makerOrderHash of crossingOrderHashes) {
      if (takerRemainingAmount <= 0n) break;

      // Load maker order data
      const makerData = await loadStoredOrderData(makerOrderHash);
      if (!makerData || makerData.status !== 'open') {
        continue;
      }

      const makerRemainingAmount = BigInt(makerData.remainingAmount);
      if (makerRemainingAmount <= 0n) {
        continue;
      }

      // Calculate fill amount (min of taker remaining and maker remaining)
      const fillAmount = takerRemainingAmount < makerRemainingAmount
        ? takerRemainingAmount
        : makerRemainingAmount;

      makerOrderHashes.push(makerOrderHash);
      makerFillAmounts.push(fillAmount.toString());
      takerRemainingAmount -= fillAmount;
    }

    if (makerOrderHashes.length === 0) {
      logger.debug('signed-order-matching', 'No valid makers to match', { takerOrderHash });
      return false;
    }

    // Calculate total taker fill amount
    const takerFillAmount = (takerOrder.order.makerAmount - takerRemainingAmount).toString();

    // Create match result
    const matchResult: MatchResult = {
      takerOrderHash,
      makerOrderHashes,
      takerFillAmount,
      makerFillAmounts,
      market,
      tokenId,
    };

    // Update order statuses to 'matching' to prevent double-matching
    const pipeline = redis.multi();
    
    // Update taker order status
    pipeline.hset(REDIS_KEYS.signedOrder(takerOrderHash), 'status', 'matching');
    
    // Update maker order statuses
    for (const makerHash of makerOrderHashes) {
      pipeline.hset(REDIS_KEYS.signedOrder(makerHash), 'status', 'matching');
    }
    
    await pipeline.exec();

    // Queue match for settlement worker
    await redis.rpush(REDIS_KEYS.matchQueue, JSON.stringify(matchResult));

    logger.info('signed-order-matching', 'Match queued for settlement', {
      takerOrderHash,
      makerCount: makerOrderHashes.length,
      takerFillAmount,
    });

    return true;
  } catch (err) {
    logger.error('signed-order-matching', 'Matching failed', err);
    return false;
  } finally {
    await releaseLock(takerOrderHash);
  }
}

/**
 * Update order statuses after settlement
 */
export async function updateOrderStatuses(
  match: MatchResult,
  status: 'settled' | 'failed',
  txSignature?: string
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  const pipeline = redis.multi();

  // Update taker order
  const takerKey = REDIS_KEYS.signedOrder(match.takerOrderHash);
  if (status === 'settled') {
    pipeline.hset(takerKey, {
      status: 'filled',
      filledAmount: match.takerFillAmount,
      txSignature: txSignature || '',
    });
    
    // Remove from orderbook
    const takerData = await loadStoredOrderData(match.takerOrderHash);
    if (takerData) {
      const takerOrder = JSON.parse(takerData.order);
      const orderbookKey = takerOrder.side === SIDE.BUY
        ? REDIS_KEYS.signedOrderbook.bids(match.market, match.tokenId)
        : REDIS_KEYS.signedOrderbook.asks(match.market, match.tokenId);
      pipeline.zrem(orderbookKey, match.takerOrderHash);
    }
  } else {
    // Revert to open on failure
    pipeline.hset(takerKey, 'status', 'open');
  }

  // Update maker orders
  for (let i = 0; i < match.makerOrderHashes.length; i++) {
    const makerHash = match.makerOrderHashes[i];
    const makerKey = REDIS_KEYS.signedOrder(makerHash);
    
    if (status === 'settled') {
      const fillAmount = BigInt(match.makerFillAmounts[i]);
      const makerData = await loadStoredOrderData(makerHash);
      
      if (makerData) {
        const prevFilled = BigInt(makerData.filledAmount);
        const prevRemaining = BigInt(makerData.remainingAmount);
        const newFilled = prevFilled + fillAmount;
        const newRemaining = prevRemaining - fillAmount;
        
        pipeline.hset(makerKey, {
          status: newRemaining <= 0n ? 'filled' : 'partial',
          filledAmount: newFilled.toString(),
          remainingAmount: newRemaining.toString(),
          txSignature: txSignature || '',
        });

        // Remove from orderbook if fully filled
        if (newRemaining <= 0n) {
          const makerOrder = JSON.parse(makerData.order);
          const orderbookKey = makerOrder.side === SIDE.BUY
            ? REDIS_KEYS.signedOrderbook.bids(match.market, match.tokenId)
            : REDIS_KEYS.signedOrderbook.asks(match.market, match.tokenId);
          pipeline.zrem(orderbookKey, makerHash);
        }
      }
    } else {
      // Revert to open on failure
      pipeline.hset(makerKey, 'status', 'open');
    }
  }

  await pipeline.exec();

  logger.info('signed-order-matching', 'Order statuses updated', {
    status,
    takerOrderHash: match.takerOrderHash,
    makerCount: match.makerOrderHashes.length,
    txSignature,
  });
}

/**
 * Get pending matches from the queue
 */
export async function getPendingMatch(): Promise<MatchResult | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  const data = await redis.lpop(REDIS_KEYS.matchQueue);
  if (!data) return null;

  try {
    return JSON.parse(data) as MatchResult;
  } catch {
    logger.error('signed-order-matching', 'Failed to parse match data', { data });
    return null;
  }
}

/**
 * Re-queue a failed match for retry
 */
export async function requeueFailedMatch(match: MatchResult): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  await redis.rpush(REDIS_KEYS.failedMatches, JSON.stringify(match));
}
