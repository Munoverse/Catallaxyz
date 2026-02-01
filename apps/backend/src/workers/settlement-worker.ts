/**
 * Settlement Worker
 * 
 * Processes matched orders and submits them for on-chain settlement.
 * Runs as a separate process, polling the match queue and executing settlements.
 * 
 * Features:
 * - Batch processing of matched orders (up to 5 makers per tx)
 * - Automatic retry with exponential backoff
 * - Graceful shutdown handling
 * - Detailed logging for monitoring
 */

import { loadEnv } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { connectRedis, disconnectRedis } from '../lib/redis/client.js';
import { submitMatchOrders } from '../lib/exchange-executor.js';
import {
  loadSignedOrder,
  getPendingMatch,
  updateOrderStatuses,
  requeueFailedMatch,
  type MatchResult,
} from '../lib/signed-order-matching.js';

// Load environment variables
loadEnv();

// ============================================
// Configuration
// ============================================

const CONFIG = {
  // Polling interval when queue is empty (ms)
  pollIntervalMs: parseInt(process.env.SETTLEMENT_POLL_INTERVAL_MS || '1000', 10),
  
  // Max retries for failed settlements
  maxRetries: parseInt(process.env.SETTLEMENT_MAX_RETRIES || '3', 10),
  
  // Base delay for exponential backoff (ms)
  baseRetryDelayMs: parseInt(process.env.SETTLEMENT_RETRY_DELAY_MS || '2000', 10),
  
  // Timeout for settlement operations (ms)
  settlementTimeoutMs: parseInt(process.env.SETTLEMENT_TIMEOUT_MS || '60000', 10),
};

// ============================================
// Worker State
// ============================================

let isRunning = false;
let isShuttingDown = false;
let processedCount = 0;
let failedCount = 0;

// ============================================
// Settlement Processing
// ============================================

/**
 * Process a single match from the queue
 */
async function processMatch(match: MatchResult, retryCount = 0): Promise<boolean> {
  const startTime = Date.now();
  
  logger.info('settlement-worker', 'Processing match', {
    takerOrderHash: match.takerOrderHash,
    makerCount: match.makerOrderHashes.length,
    retryCount,
  });

  try {
    // Load the taker order
    const takerOrder = await loadSignedOrder(match.takerOrderHash);
    if (!takerOrder) {
      logger.error('settlement-worker', 'Taker order not found', {
        takerOrderHash: match.takerOrderHash,
      });
      await updateOrderStatuses(match, 'failed');
      failedCount++;
      return false;
    }

    // Load all maker orders
    const makerOrders = await Promise.all(
      match.makerOrderHashes.map(hash => loadSignedOrder(hash))
    );

    // Check if any maker orders are missing
    const validMakerOrders = makerOrders.filter((o): o is NonNullable<typeof o> => o !== null);
    if (validMakerOrders.length !== match.makerOrderHashes.length) {
      logger.error('settlement-worker', 'Some maker orders not found', {
        expected: match.makerOrderHashes.length,
        found: validMakerOrders.length,
      });
      
      // If we lost makers, we need to recalculate or fail
      if (validMakerOrders.length === 0) {
        await updateOrderStatuses(match, 'failed');
        failedCount++;
        return false;
      }
      
      // Update match to only include valid makers
      const validIndices = makerOrders
        .map((o, i) => o ? i : -1)
        .filter(i => i >= 0);
      
      match.makerOrderHashes = validIndices.map(i => match.makerOrderHashes[i]);
      match.makerFillAmounts = validIndices.map(i => match.makerFillAmounts[i]);
    }

    // Submit to chain with timeout
    const settlementPromise = submitMatchOrders({
      takerOrder,
      takerFillAmount: BigInt(match.takerFillAmount),
      makerOrders: validMakerOrders,
      makerFillAmounts: match.makerFillAmounts.map(a => BigInt(a)),
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Settlement timeout')), CONFIG.settlementTimeoutMs);
    });

    const txSignature = await Promise.race([settlementPromise, timeoutPromise]);

    const duration = Date.now() - startTime;
    logger.info('settlement-worker', 'Settlement successful', {
      takerOrderHash: match.takerOrderHash,
      txSignature,
      durationMs: duration,
    });

    // Update order statuses to settled
    await updateOrderStatuses(match, 'settled', txSignature);
    processedCount++;
    return true;

  } catch (err: any) {
    const duration = Date.now() - startTime;
    logger.error('settlement-worker', 'Settlement failed', {
      takerOrderHash: match.takerOrderHash,
      error: err.message,
      durationMs: duration,
      retryCount,
    });

    // Retry with exponential backoff
    if (retryCount < CONFIG.maxRetries) {
      const delay = CONFIG.baseRetryDelayMs * Math.pow(2, retryCount);
      logger.info('settlement-worker', `Retrying in ${delay}ms`, {
        takerOrderHash: match.takerOrderHash,
        nextRetry: retryCount + 1,
      });
      
      await sleep(delay);
      return processMatch(match, retryCount + 1);
    }

    // Max retries reached, mark as failed and queue for later
    logger.error('settlement-worker', 'Max retries reached, marking as failed', {
      takerOrderHash: match.takerOrderHash,
    });
    
    await updateOrderStatuses(match, 'failed');
    await requeueFailedMatch(match);
    failedCount++;
    return false;
  }
}

/**
 * Main worker loop
 */
async function runWorker(): Promise<void> {
  logger.info('settlement-worker', 'Starting worker', {
    pid: process.pid,
    config: CONFIG,
  });

  isRunning = true;

  while (isRunning && !isShuttingDown) {
    try {
      // Get next match from queue
      const match = await getPendingMatch();

      if (!match) {
        // No pending matches, wait and try again
        await sleep(CONFIG.pollIntervalMs);
        continue;
      }

      // Process the match
      await processMatch(match);

    } catch (err) {
      logger.error('settlement-worker', 'Worker loop error', err);
      await sleep(CONFIG.pollIntervalMs * 2);
    }
  }

  logger.info('settlement-worker', 'Worker stopped', {
    processedCount,
    failedCount,
  });
}

// ============================================
// Utility Functions
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Graceful Shutdown
// ============================================

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('settlement-worker', `Received ${signal}, shutting down gracefully...`);

  // Stop the worker loop
  isRunning = false;

  // Allow current settlement to complete (max 10 seconds)
  const shutdownTimeout = setTimeout(() => {
    logger.warn('settlement-worker', 'Shutdown timeout, forcing exit');
    process.exit(1);
  }, 10000);

  try {
    // Wait a bit for current operation to complete
    await sleep(2000);

    // Disconnect from Redis
    await disconnectRedis();

    logger.info('settlement-worker', 'Shutdown complete', {
      processedCount,
      failedCount,
    });

    clearTimeout(shutdownTimeout);
    process.exit(0);
  } catch (err) {
    logger.error('settlement-worker', 'Error during shutdown', err);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================
// Startup
// ============================================

async function main(): Promise<void> {
  try {
    // Connect to Redis
    const redisConnected = await connectRedis();
    if (!redisConnected) {
      logger.error('settlement-worker', 'Failed to connect to Redis');
      process.exit(1);
    }

    // Start the worker
    await runWorker();
  } catch (err) {
    logger.error('settlement-worker', 'Fatal error', err);
    process.exit(1);
  }
}

// Run the worker
main().catch(err => {
  logger.error('settlement-worker', 'Unhandled error', err);
  process.exit(1);
});
