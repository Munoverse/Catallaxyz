/**
 * Trade Sync Service
 * AUDIT FIX: Syncs on-chain trade events to database
 * 
 * This service monitors the Solana blockchain for trade settlement events
 * and syncs them to the PostgreSQL database for orderbook consistency.
 */

import { PoolClient } from 'pg';
import { Connection, PublicKey } from '@solana/web3.js';
import { validateServiceEnv, parseBool, parseNum } from '../utils/env-validation';
import { createLogger } from '../utils/logger';
// AUDIT FIX v1.2.1: Use centralized database utilities
import { transactionWithRetry } from '../utils/db-retry';
import { createPool, closePool } from '../utils/db-pool';

// Initialize
const logger = createLogger('sync-trades');

// Validate environment
// AUDIT FIX v1.1.0: Correct service name
validateServiceEnv('syncTrades');

// Configuration
const BATCH_SIZE = parseNum('SYNC_BATCH_SIZE', 100, { min: 10, max: 1000 });
const SYNC_INTERVAL_MS = parseNum('SYNC_INTERVAL_MS', 10000, { min: 1000 });
const DRY_RUN = parseBool('DRY_RUN', false);

// AUDIT FIX v1.2.1: Use centralized pool configuration
const pool = createPool();

// AUDIT FIX v1.2.6: Solana connection with timeout configuration
const RPC_TIMEOUT_MS = parseNum('SOLANA_RPC_TIMEOUT_MS', 30000, { min: 5000, max: 120000 });

// Custom fetch with timeout
const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const connection = new Connection(
  process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
  {
    commitment: 'confirmed',
    fetch: fetchWithTimeout,
    confirmTransactionInitialTimeout: RPC_TIMEOUT_MS,
  }
);

// AUDIT FIX v1.2.0: Validate PROGRAM_ID before use
const programIdStr = process.env.NEXT_PUBLIC_PROGRAM_ID;
if (!programIdStr || programIdStr === '11111111111111111111111111111111') {
  throw new Error('NEXT_PUBLIC_PROGRAM_ID environment variable is required and must be valid');
}
const PROGRAM_ID = new PublicKey(programIdStr);

// ============================================
// Types
// ============================================

interface TradeEvent {
  market: string;
  maker: string;
  taker: string;
  outcomeType: number;
  side: number;
  price: number;
  size: number;
  signature: string;
  slot: number;
  timestamp: number;
}

interface SyncState {
  lastSlot: number;
  lastSignature: string | null;
}

// ============================================
// Database Functions
// ============================================

async function getSyncState(client: PoolClient): Promise<SyncState> {
  const result = await client.query<{ last_slot: string; last_signature: string | null }>(
    `SELECT last_slot, last_signature FROM public.sync_state WHERE service = 'trades' LIMIT 1`
  );
  
  if (result.rows.length === 0) {
    // Initialize sync state
    await client.query(
      `INSERT INTO public.sync_state (service, last_slot, last_signature) VALUES ('trades', 0, NULL)`
    );
    return { lastSlot: 0, lastSignature: null };
  }
  
  return {
    lastSlot: Number(result.rows[0].last_slot),
    lastSignature: result.rows[0].last_signature,
  };
}

async function updateSyncState(client: PoolClient, state: SyncState): Promise<void> {
  await client.query(
    `UPDATE public.sync_state SET last_slot = $1, last_signature = $2, updated_at = NOW() WHERE service = 'trades'`,
    [state.lastSlot, state.lastSignature]
  );
}

async function insertTrade(client: PoolClient, trade: TradeEvent): Promise<void> {
  // Get or create user IDs
  const makerResult = await client.query<{ id: string }>(
    `INSERT INTO public.users (wallet_address, auth_provider) VALUES ($1, 'wallet')
     ON CONFLICT (wallet_address) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [trade.maker]
  );
  
  const takerResult = await client.query<{ id: string }>(
    `INSERT INTO public.users (wallet_address, auth_provider) VALUES ($1, 'wallet')
     ON CONFLICT (wallet_address) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [trade.taker]
  );

  // Get market ID
  const marketResult = await client.query<{ id: string }>(
    `SELECT id FROM public.markets WHERE solana_market_account = $1`,
    [trade.market]
  );
  
  if (marketResult.rows.length === 0) {
    logger.warn('Market not found, skipping trade', { market: trade.market });
    return;
  }

  const marketId = marketResult.rows[0].id;
  const makerId = makerResult.rows[0].id;
  const takerId = takerResult.rows[0].id;

  // Insert trade
  // AUDIT FIX v1.2.5: Use correct field names (maker_user_id, taker_user_id) to match database schema
  // AUDIT FIX v1.2.9 [D-12]: Add total_cost field (required NOT NULL) to match schema
  const priceDecimal = trade.price / 1_000_000;
  const totalCost = Math.floor(trade.size * priceDecimal);
  
  await client.query(
    `INSERT INTO public.trades 
     (market_id, maker_user_id, taker_user_id, outcome_type, side, price, amount, total_cost, transaction_signature, slot, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, to_timestamp($11))
     ON CONFLICT (transaction_signature) DO NOTHING`,
    [
      marketId,
      makerId,
      takerId,
      trade.outcomeType === 0 ? 'yes' : 'no',
      trade.side === 0 ? 'buy' : 'sell',
      priceDecimal,
      trade.size,
      totalCost,
      trade.signature,
      trade.slot,
      trade.timestamp,
    ]
  );

  // Update market stats
  await client.query(
    `UPDATE public.markets SET 
       total_trades = total_trades + 1,
       total_volume = total_volume + $2,
       last_trade_at = to_timestamp($3),
       updated_at = NOW()
     WHERE id = $1`,
    [marketId, trade.size, trade.timestamp]
  );
}

// ============================================
// Blockchain Functions
// ============================================

// AUDIT FIX v1.1.2: Implement actual trade event parsing
const TRADING_FEE_COLLECTED_DISCRIMINATOR = 'Program log: TradingFeeCollected';

/**
 * Parse TradingFeeCollected event from program logs
 * AUDIT FIX v2.1 (HIGH-14): Updated event structure with complete fields
 * Event structure (updated):
 *   market: Pubkey
 *   maker: Pubkey
 *   taker: Pubkey
 *   user: Pubkey (fee payer)
 *   outcome_type: u8
 *   side: u8
 *   size: u64
 *   fee_amount: u64
 *   fee_rate: u32
 *   price: u64
 *   slot: u64
 *   timestamp: i64
 */
function parseTradeEventFromLogs(
  logs: string[],
  signature: string,
  slot: number,
  blockTime: number | null
): TradeEvent | null {
  // Look for TradingFeeCollected event in logs
  const eventLog = logs.find(log => log.includes(TRADING_FEE_COLLECTED_DISCRIMINATOR));
  if (!eventLog) return null;
  
  // Parse base64 encoded event data after "Program data:"
  const dataLog = logs.find(log => log.startsWith('Program data:'));
  if (!dataLog) return null;
  
  try {
    const base64Data = dataLog.replace('Program data:', '').trim();
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Skip 8-byte discriminator
    let offset = 8;
    
    // Parse market (32 bytes)
    const market = new PublicKey(buffer.slice(offset, offset + 32)).toString();
    offset += 32;
    
    // AUDIT FIX v2.1 (HIGH-14): Parse maker and taker from event data
    // Check if buffer has the new format with maker/taker fields
    if (buffer.length >= 8 + 32 + 32 + 32 + 32 + 1 + 1 + 8 + 8 + 4 + 8 + 8 + 8) {
      // New format with maker, taker, outcome_type, side, size fields
      const maker = new PublicKey(buffer.slice(offset, offset + 32)).toString();
      offset += 32;
      
      const taker = new PublicKey(buffer.slice(offset, offset + 32)).toString();
      offset += 32;
      
      // Parse user (fee payer, 32 bytes)
      const user = new PublicKey(buffer.slice(offset, offset + 32)).toString();
      offset += 32;
      
      // Parse outcome_type (1 byte, u8)
      const outcomeType = buffer.readUInt8(offset);
      offset += 1;
      
      // Parse side (1 byte, u8)
      const side = buffer.readUInt8(offset);
      offset += 1;
      
      // Parse size (8 bytes, u64)
      const size = buffer.readBigUInt64LE(offset);
      offset += 8;
      
      // Parse fee_amount (8 bytes, u64)
      const feeAmount = buffer.readBigUInt64LE(offset);
      offset += 8;
      
      // Parse fee_rate (4 bytes, u32)
      const feeRate = buffer.readUInt32LE(offset);
      offset += 4;
      
      // Parse price (8 bytes, u64)
      const price = buffer.readBigUInt64LE(offset);
      offset += 8;
      
      // Parse slot (8 bytes, u64)
      const eventSlot = buffer.readBigUInt64LE(offset);
      offset += 8;
      
      // Parse timestamp (8 bytes, i64)
      const eventTimestamp = buffer.readBigInt64LE(offset);
      
      return {
        market,
        maker,
        taker,
        outcomeType,
        side,
        price: Number(price),
        size: Number(size),
        signature,
        slot,
        timestamp: blockTime || Number(eventTimestamp),
      };
    }
    
    // Legacy format fallback (for backward compatibility)
    // Parse user (32 bytes)
    const user = new PublicKey(buffer.slice(offset, offset + 32)).toString();
    offset += 32;
    
    // Parse fee_amount (8 bytes, u64)
    const feeAmount = buffer.readBigUInt64LE(offset);
    offset += 8;
    
    // Parse fee_rate (4 bytes, u32)
    const feeRate = buffer.readUInt32LE(offset);
    offset += 4;
    
    // Parse price (8 bytes, u64)
    const price = buffer.readBigUInt64LE(offset);
    offset += 8;
    
    // Parse slot (8 bytes, u64)
    const eventSlot = buffer.readBigUInt64LE(offset);
    offset += 8;
    
    // Parse timestamp (8 bytes, i64)
    const eventTimestamp = buffer.readBigInt64LE(offset);
    
    // Legacy format: estimate size from fee amount (assuming ~10% fee rate)
    const estimatedSize = feeRate > 0 ? Number(feeAmount) * 1_000_000 / feeRate : Number(feeAmount) * 10;
    
    logger.debug('Using legacy event format', { signature, market });
    
    return {
      market,
      maker: user, // Best effort in legacy format
      taker: user,
      outcomeType: 0, // Unknown in legacy format
      side: 0, // Unknown in legacy format
      price: Number(price),
      size: estimatedSize,
      signature,
      slot,
      timestamp: blockTime || Number(eventTimestamp),
    };
  } catch (err: unknown) {
    // AUDIT FIX v2.1 (MED-25): Proper error type handling
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn('Failed to parse trade event', { signature, error: message });
    return null;
  }
}

// AUDIT FIX v1.2.6: Add retry logic for RPC calls
const RPC_MAX_RETRIES = parseNum('SOLANA_RPC_MAX_RETRIES', 3, { min: 1, max: 10 });
const RPC_RETRY_DELAY_MS = parseNum('SOLANA_RPC_RETRY_DELAY_MS', 1000, { min: 100, max: 10000 });

async function rpcWithRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < RPC_MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isRetryable = lastError.name === 'AbortError' || 
        lastError.message.includes('timeout') ||
        lastError.message.includes('429') ||
        lastError.message.includes('503');
      
      if (!isRetryable || attempt === RPC_MAX_RETRIES - 1) {
        throw lastError;
      }
      
      const delay = RPC_RETRY_DELAY_MS * Math.pow(2, attempt);
      logger.warn(`RPC ${operationName} failed, retrying in ${delay}ms`, { 
        attempt: attempt + 1, 
        maxRetries: RPC_MAX_RETRIES,
        error: lastError.message 
      });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function fetchTradeEvents(afterSlot: number): Promise<TradeEvent[]> {
  logger.debug('Fetching trade events', { afterSlot });
  
  try {
    // Get recent signatures for the program with retry
    const signatures = await rpcWithRetry(
      () => connection.getSignaturesForAddress(
        PROGRAM_ID,
        { limit: BATCH_SIZE },
        'confirmed'
      ),
      'getSignaturesForAddress'
    );
    
    // Filter signatures after the last processed slot
    const newSignatures = signatures.filter(sig => sig.slot > afterSlot);
    
    if (newSignatures.length === 0) {
      logger.debug('No new signatures found');
      return [];
    }
    
    logger.info('Found new signatures', { count: newSignatures.length });
    
    const trades: TradeEvent[] = [];
    
    // Batch fetch transactions (max 100 at a time)
    const batchSize = 100;
    for (let i = 0; i < newSignatures.length; i += batchSize) {
      const batch = newSignatures.slice(i, i + batchSize);
      const signatureStrings = batch.map(s => s.signature);
      
      // Fetch transactions with logs and retry
      const transactions = await rpcWithRetry(
        () => connection.getTransactions(signatureStrings, {
          maxSupportedTransactionVersion: 0,
        }),
        'getTransactions'
      );
      
      for (let j = 0; j < transactions.length; j++) {
        const tx = transactions[j];
        const sig = batch[j];
        
        if (!tx || !tx.meta?.logMessages) continue;
        
        // Check if this transaction involves our program and has trade events
        const logs = tx.meta.logMessages;
        const hasTradeEvent = logs.some(log => log.includes(TRADING_FEE_COLLECTED_DISCRIMINATOR));
        
        if (!hasTradeEvent) continue;
        
        const tradeEvent = parseTradeEventFromLogs(
          logs,
          sig.signature,
          sig.slot,
          tx.blockTime
        );
        
        if (tradeEvent) {
          trades.push(tradeEvent);
          logger.debug('Parsed trade event', { 
            signature: sig.signature,
            market: tradeEvent.market,
          });
        }
      }
    }
    
    logger.info('Parsed trade events', { count: trades.length });
    return trades;
  } catch (error) {
    logger.error('Failed to fetch trade events', error);
    return [];
  }
}

// ============================================
// Main Sync Loop
// ============================================

// AUDIT FIX v1.2.0: Use transactionWithRetry for database operations
async function syncTrades(): Promise<number> {
  if (!pool) {
    throw new Error('DATABASE_URL not configured');
  }

  const result = await transactionWithRetry(
    pool,
    async (client) => {
      let syncedCount = 0;
      
      const state = await getSyncState(client);
      logger.info('Starting trade sync', { lastSlot: state.lastSlot });
      
      const trades = await fetchTradeEvents(state.lastSlot);
      
      if (trades.length === 0) {
        logger.debug('No new trades found');
        return 0;
      }
      
      for (const trade of trades) {
        if (DRY_RUN) {
          logger.info('DRY_RUN: Would insert trade', { trade });
          continue;
        }
        
        try {
          await insertTrade(client, trade);
          syncedCount++;
          
          // Update state after each successful insert
          state.lastSlot = Math.max(state.lastSlot, trade.slot);
          state.lastSignature = trade.signature;
        } catch (error) {
          logger.error('Failed to insert trade', error, { trade });
        }
      }
      
      // Update state once at the end (batch update)
      await updateSyncState(client, state);
      
      logger.info('Trade sync completed', { syncedCount });
      return syncedCount;
    },
    {
      operation: 'sync-trades',
      maxRetries: 3,
      initialDelayMs: 500,
    }
  );
  
  return result;
}

// ============================================
// Entry Point
// ============================================

async function main() {
  logger.info('Trade sync service starting', { 
    batchSize: BATCH_SIZE,
    intervalMs: SYNC_INTERVAL_MS,
    dryRun: DRY_RUN,
  });

  // Ensure sync_state table exists
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.sync_state (
          service TEXT PRIMARY KEY,
          last_slot BIGINT DEFAULT 0,
          last_signature TEXT,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
    } finally {
      client.release();
    }
  }

  // Run once if not in continuous mode
  if (process.env.SYNC_ONCE === 'true') {
    await syncTrades();
    return;
  }

  // Continuous sync loop
  const runSync = async () => {
    try {
      await syncTrades();
    } catch (error) {
      logger.error('Sync iteration failed', error);
    }
  };

  await runSync();
  setInterval(runSync, SYNC_INTERVAL_MS);
}

main()
  .then(() => {
    if (process.env.SYNC_ONCE === 'true') {
      logger.info('Single sync completed, exiting');
      // AUDIT FIX v1.2.1: Use centralized pool close
      return closePool(pool);
    }
    logger.info('Continuous sync running');
  })
  .catch(async (err) => {
    logger.error('Trade sync service failed', err);
    await closePool(pool);
    process.exit(1);
  });
