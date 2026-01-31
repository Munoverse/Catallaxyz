/**
 * Event Indexer Service
 * 
 * Comprehensive event indexer that syncs all on-chain events to the database.
 * This service ensures data consistency between on-chain state and off-chain database.
 * 
 * Events indexed:
 * - MarketCreated, MarketSettled, MarketTerminated, MarketPaused, MarketResumed
 * - OrderFilled, OrderCancelled, OrdersMatched
 * - PositionSplit, PositionMerged, CtfTokensRedeemed
 * - NonceIncremented
 * - TradingFeeCollected (handled by sync-trades.ts)
 * - GlobalFeeRatesUpdated, GlobalTradingPaused, GlobalTradingUnpaused
 */

import { PoolClient } from 'pg';
import { Connection, PublicKey } from '@solana/web3.js';
import { BorshCoder, EventParser } from '@coral-xyz/anchor';
import { validateServiceEnv, parseBool, parseNum } from '../utils/env-validation';
import { createLogger } from '../utils/logger';
import { transactionWithRetry } from '../utils/db-retry';
import { createPool, closePool } from '../utils/db-pool';
import IDL from '../../target/idl/catallaxyz.json' with { type: 'json' };

const logger = createLogger('sync-events');

// Validate environment
validateServiceEnv('syncEvents');

// Configuration
const BATCH_SIZE = parseNum('SYNC_BATCH_SIZE', 100, { min: 10, max: 1000 });
const SYNC_INTERVAL_MS = parseNum('SYNC_INTERVAL_MS', 10000, { min: 1000 });
const DRY_RUN = parseBool('DRY_RUN', false);

const pool = createPool();

// Solana connection
const RPC_TIMEOUT_MS = parseNum('SOLANA_RPC_TIMEOUT_MS', 30000, { min: 5000, max: 120000 });

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

const programIdStr = process.env.NEXT_PUBLIC_PROGRAM_ID;
if (!programIdStr || programIdStr === '11111111111111111111111111111111') {
  throw new Error('NEXT_PUBLIC_PROGRAM_ID environment variable is required');
}
const PROGRAM_ID = new PublicKey(programIdStr);

// Event parser using Anchor
const coder = new BorshCoder(IDL as any);
const eventParser = new EventParser(PROGRAM_ID, coder);

// ============================================
// Types
// ============================================

interface ParsedEvent {
  name: string;
  data: any;
  signature: string;
  slot: number;
  blockTime: number | null;
}

interface SyncState {
  lastSlot: number;
  lastSignature: string | null;
  eventsProcessed: number;
}

// ============================================
// Database Functions
// ============================================

async function getSyncState(client: PoolClient, service: string): Promise<SyncState> {
  const result = await client.query<{ 
    last_slot: string; 
    last_signature: string | null;
    events_processed: string;
  }>(
    `SELECT last_slot, last_signature, events_processed FROM public.sync_state WHERE service = $1 LIMIT 1`,
    [service]
  );
  
  if (result.rows.length === 0) {
    await client.query(
      `INSERT INTO public.sync_state (service, last_slot, last_signature, events_processed) 
       VALUES ($1, 0, NULL, 0)`,
      [service]
    );
    return { lastSlot: 0, lastSignature: null, eventsProcessed: 0 };
  }
  
  return {
    lastSlot: Number(result.rows[0].last_slot),
    lastSignature: result.rows[0].last_signature,
    eventsProcessed: Number(result.rows[0].events_processed),
  };
}

async function updateSyncState(client: PoolClient, service: string, state: SyncState): Promise<void> {
  await client.query(
    `UPDATE public.sync_state 
     SET last_slot = $2, last_signature = $3, events_processed = $4, updated_at = NOW() 
     WHERE service = $1`,
    [service, state.lastSlot, state.lastSignature, state.eventsProcessed]
  );
}

async function logEvent(client: PoolClient, event: ParsedEvent, marketId: string | null, userId: string | null): Promise<void> {
  await client.query(
    `INSERT INTO public.event_log 
     (event_type, transaction_signature, slot, block_time, program_id, market_id, user_id, event_data, processed)
     VALUES ($1, $2, $3, to_timestamp($4), $5, $6, $7, $8, false)
     ON CONFLICT (transaction_signature, event_type) DO NOTHING`,
    [
      event.name,
      event.signature,
      event.slot,
      event.blockTime,
      PROGRAM_ID.toString(),
      marketId,
      userId,
      JSON.stringify(event.data),
    ]
  );
}

async function ensureUser(client: PoolClient, walletAddress: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO public.users (wallet_address, auth_provider) VALUES ($1, 'wallet')
     ON CONFLICT (wallet_address) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [walletAddress]
  );
  return result.rows[0].id;
}

async function getMarketIdByAddress(client: PoolClient, marketAddress: string): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM public.markets WHERE solana_market_account = $1`,
    [marketAddress]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

// ============================================
// Event Handlers
// ============================================

async function handleMarketCreated(client: PoolClient, event: ParsedEvent): Promise<void> {
  const { market, creator, question, description, createdAt } = event.data;
  
  const creatorId = await ensureUser(client, creator.toString());
  
  await client.query(
    `INSERT INTO public.markets 
     (creator_id, question, description, solana_market_account, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'active', to_timestamp($5), NOW())
     ON CONFLICT (solana_market_account) DO UPDATE SET
       question = COALESCE(EXCLUDED.question, public.markets.question),
       description = COALESCE(EXCLUDED.description, public.markets.description),
       updated_at = NOW()`,
    [creatorId, question, description, market.toString(), createdAt]
  );
  
  const marketId = await getMarketIdByAddress(client, market.toString());
  await logEvent(client, event, marketId, creatorId);
  
  logger.info('Processed MarketCreated', { market: market.toString() });
}

async function handleMarketSettled(client: PoolClient, event: ParsedEvent): Promise<void> {
  const { market, settlementIndex, winningOutcome, referenceAgent, yesPrice, noPrice, settledAt } = event.data;
  
  const marketId = await getMarketIdByAddress(client, market.toString());
  if (!marketId) {
    logger.warn('Market not found for settlement', { market: market.toString() });
    return;
  }
  
  const lastTraderId = referenceAgent ? await ensureUser(client, referenceAgent.toString()) : null;
  
  // Update market status
  await client.query(
    `UPDATE public.markets SET
       status = 'settled',
       winning_outcome = $2,
       final_yes_price = $3,
       final_no_price = $4,
       can_redeem = true,
       settled_at = to_timestamp($5),
       updated_at = NOW()
     WHERE id = $1`,
    [
      marketId,
      winningOutcome === 0 ? 'yes' : 'no',
      Number(yesPrice) / 1_000_000,
      Number(noPrice) / 1_000_000,
      settledAt,
    ]
  );
  
  // Create settlement record
  await client.query(
    `INSERT INTO public.market_settlements 
     (market_id, settlement_type, settlement_index, winning_outcome, yes_price, no_price, last_trader_id, settled_at)
     VALUES ($1, 'normal', $2, $3, $4, $5, $6, to_timestamp($7))
     ON CONFLICT DO NOTHING`,
    [
      marketId,
      settlementIndex,
      winningOutcome === 0 ? 'yes' : 'no',
      Number(yesPrice) / 1_000_000,
      Number(noPrice) / 1_000_000,
      lastTraderId,
      settledAt,
    ]
  );
  
  await logEvent(client, event, marketId, lastTraderId);
  
  logger.info('Processed MarketSettled', { market: market.toString(), winningOutcome });
}

async function handleMarketTerminated(client: PoolClient, event: ParsedEvent): Promise<void> {
  const { market, reason, finalYesPrice, finalNoPrice, lastTrader, terminatedAt } = event.data;
  
  const marketId = await getMarketIdByAddress(client, market.toString());
  if (!marketId) {
    logger.warn('Market not found for termination', { market: market.toString() });
    return;
  }
  
  const lastTraderId = lastTrader ? await ensureUser(client, lastTrader.toString()) : null;
  const isVrf = reason === 0;
  
  // Determine winning outcome based on final prices
  const yesPrice = Number(finalYesPrice) / 1_000_000;
  const noPrice = Number(finalNoPrice) / 1_000_000;
  const winningOutcome = yesPrice >= 0.5 ? 'yes' : 'no';
  
  await client.query(
    `UPDATE public.markets SET
       status = 'terminated',
       is_randomly_terminated = $2,
       final_yes_price = $3,
       final_no_price = $4,
       winning_outcome = $5,
       can_redeem = true,
       termination_triggered_at = to_timestamp($6),
       updated_at = NOW()
     WHERE id = $1`,
    [marketId, isVrf, yesPrice, noPrice, winningOutcome, terminatedAt]
  );
  
  // Create settlement record
  await client.query(
    `INSERT INTO public.market_settlements 
     (market_id, settlement_type, winning_outcome, yes_price, no_price, last_trader_id, settled_at)
     VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7))
     ON CONFLICT DO NOTHING`,
    [
      marketId,
      isVrf ? 'random_vrf' : 'auto_terminated',
      winningOutcome,
      yesPrice,
      noPrice,
      lastTraderId,
      terminatedAt,
    ]
  );
  
  // Increment user termination count if VRF
  if (isVrf && lastTraderId) {
    await client.query(
      `UPDATE public.users SET termination_count = COALESCE(termination_count, 0) + 1 WHERE id = $1`,
      [lastTraderId]
    );
  }
  
  await logEvent(client, event, marketId, lastTraderId);
  
  logger.info('Processed MarketTerminated', { market: market.toString(), reason: isVrf ? 'VRF' : 'inactivity' });
}

async function handleMarketPaused(client: PoolClient, event: ParsedEvent): Promise<void> {
  const { market, pausedBy, timestamp, reason } = event.data;
  
  const marketId = await getMarketIdByAddress(client, market.toString());
  if (!marketId) return;
  
  await client.query(
    `UPDATE public.markets SET
       is_paused = true,
       paused_at = to_timestamp($2),
       paused_reason = $3,
       updated_at = NOW()
     WHERE id = $1`,
    [marketId, timestamp, reason || 'Admin paused']
  );
  
  await logEvent(client, event, marketId, null);
  
  logger.info('Processed MarketPaused', { market: market.toString() });
}

async function handleMarketResumed(client: PoolClient, event: ParsedEvent): Promise<void> {
  const { market, resumedBy, timestamp } = event.data;
  
  const marketId = await getMarketIdByAddress(client, market.toString());
  if (!marketId) return;
  
  await client.query(
    `UPDATE public.markets SET
       is_paused = false,
       paused_at = NULL,
       paused_reason = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [marketId]
  );
  
  await logEvent(client, event, marketId, null);
  
  logger.info('Processed MarketResumed', { market: market.toString() });
}

async function handleOrderFilled(client: PoolClient, event: ParsedEvent): Promise<void> {
  const { orderHash, maker, taker, market, outcomeType, side, price, filledSize, remainingSize, slot, timestamp } = event.data;
  
  const marketId = await getMarketIdByAddress(client, market.toString());
  const makerId = await ensureUser(client, maker.toString());
  const takerId = await ensureUser(client, taker.toString());
  
  const orderHashHex = Buffer.from(orderHash).toString('hex');
  const priceDecimal = Number(price) / 1_000_000;
  
  // Update order status
  await client.query(
    `UPDATE public.orders SET
       filled_amount = filled_amount + $2,
       remaining_amount = $3,
       status = CASE WHEN $3 = 0 THEN 'filled' ELSE 'partial' END,
       filled_at = CASE WHEN $3 = 0 THEN to_timestamp($4) ELSE filled_at END,
       updated_at = NOW()
     WHERE order_hash = $1`,
    [orderHashHex, filledSize, remainingSize, timestamp]
  );
  
  // Update order_status table
  await client.query(
    `INSERT INTO public.order_status (order_hash, is_filled_or_cancelled, remaining, last_synced_slot)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (order_hash) DO UPDATE SET
       is_filled_or_cancelled = EXCLUDED.is_filled_or_cancelled,
       remaining = EXCLUDED.remaining,
       last_synced_slot = EXCLUDED.last_synced_slot,
       updated_at = NOW()`,
    [orderHashHex, Number(remainingSize) === 0, remainingSize, slot]
  );
  
  // Create order fill record
  if (marketId) {
    await client.query(
      `INSERT INTO public.order_fills 
       (market_id, maker_user_id, taker_user_id, outcome_type, side, price, amount, slot, block_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9))`,
      [
        marketId,
        makerId,
        takerId,
        outcomeType === 0 ? 'yes' : 'no',
        side === 0 ? 'buy' : 'sell',
        priceDecimal,
        filledSize,
        slot,
        timestamp,
      ]
    );
  }
  
  await logEvent(client, event, marketId, makerId);
  
  logger.debug('Processed OrderFilled', { orderHash: orderHashHex.slice(0, 16) });
}

async function handleOrderCancelled(client: PoolClient, event: ParsedEvent): Promise<void> {
  const { orderHash, maker, market, remainingSize, slot, timestamp } = event.data;
  
  const orderHashHex = Buffer.from(orderHash).toString('hex');
  const makerId = await ensureUser(client, maker.toString());
  const marketId = market ? await getMarketIdByAddress(client, market.toString()) : null;
  
  // Update order status
  await client.query(
    `UPDATE public.orders SET
       status = 'cancelled',
       cancelled_at = to_timestamp($2),
       updated_at = NOW()
     WHERE order_hash = $1`,
    [orderHashHex, timestamp]
  );
  
  // Update order_status table
  await client.query(
    `INSERT INTO public.order_status (order_hash, is_filled_or_cancelled, remaining, last_synced_slot)
     VALUES ($1, true, 0, $2)
     ON CONFLICT (order_hash) DO UPDATE SET
       is_filled_or_cancelled = true,
       remaining = 0,
       last_synced_slot = EXCLUDED.last_synced_slot,
       updated_at = NOW()`,
    [orderHashHex, slot]
  );
  
  await logEvent(client, event, marketId, makerId);
  
  logger.debug('Processed OrderCancelled', { orderHash: orderHashHex.slice(0, 16) });
}

async function handleNonceIncremented(client: PoolClient, event: ParsedEvent): Promise<void> {
  const { user, newNonce, timestamp } = event.data;
  
  const walletAddress = user.toString();
  const userId = await ensureUser(client, walletAddress);
  
  // Update user nonce
  await client.query(
    `INSERT INTO public.user_nonces (user_id, wallet_address, current_nonce)
     VALUES ($1, $2, $3)
     ON CONFLICT (wallet_address) DO UPDATE SET
       current_nonce = GREATEST(public.user_nonces.current_nonce, EXCLUDED.current_nonce),
       updated_at = NOW()`,
    [userId, walletAddress, newNonce]
  );
  
  // Cancel all orders with nonce < newNonce
  await client.query(
    `UPDATE public.orders SET
       status = 'cancelled',
       cancelled_at = NOW(),
       updated_at = NOW()
     WHERE user_id = $1 AND status IN ('open', 'partial') AND (nonce IS NULL OR nonce < $2)`,
    [userId, newNonce]
  );
  
  await logEvent(client, event, null, userId);
  
  logger.info('Processed NonceIncremented', { user: walletAddress, newNonce: newNonce.toString() });
}

async function handlePositionSplit(client: PoolClient, event: ParsedEvent): Promise<void> {
  const { market, user, amount, yesAmount, noAmount, slot } = event.data;
  
  const marketId = await getMarketIdByAddress(client, market.toString());
  if (!marketId) return;
  
  const userId = await ensureUser(client, user.toString());
  
  // Update stakes
  await client.query(
    `INSERT INTO public.stakes (user_id, market_id, outcome_type, amount)
     VALUES ($1, $2, 'yes', $3)
     ON CONFLICT (user_id, market_id, outcome_type) DO UPDATE SET
       amount = public.stakes.amount + EXCLUDED.amount,
       updated_at = NOW()`,
    [userId, marketId, yesAmount]
  );
  
  await client.query(
    `INSERT INTO public.stakes (user_id, market_id, outcome_type, amount)
     VALUES ($1, $2, 'no', $3)
     ON CONFLICT (user_id, market_id, outcome_type) DO UPDATE SET
       amount = public.stakes.amount + EXCLUDED.amount,
       updated_at = NOW()`,
    [userId, marketId, noAmount]
  );
  
  // Log operation
  await client.query(
    `INSERT INTO public.user_operations (user_id, market_id, operation_type, amount, metadata)
     VALUES ($1, $2, 'split', $3, $4)`,
    [userId, marketId, amount, JSON.stringify({ yesAmount: yesAmount.toString(), noAmount: noAmount.toString() })]
  );
  
  await logEvent(client, event, marketId, userId);
  
  logger.debug('Processed PositionSplit', { market: market.toString(), user: user.toString() });
}

async function handlePositionMerged(client: PoolClient, event: ParsedEvent): Promise<void> {
  const { market, user, amount, yesAmount, noAmount, slot } = event.data;
  
  const marketId = await getMarketIdByAddress(client, market.toString());
  if (!marketId) return;
  
  const userId = await ensureUser(client, user.toString());
  
  // Update stakes (reduce)
  await client.query(
    `UPDATE public.stakes SET
       amount = GREATEST(0, amount - $3),
       updated_at = NOW()
     WHERE user_id = $1 AND market_id = $2 AND outcome_type = 'yes'`,
    [userId, marketId, yesAmount]
  );
  
  await client.query(
    `UPDATE public.stakes SET
       amount = GREATEST(0, amount - $3),
       updated_at = NOW()
     WHERE user_id = $1 AND market_id = $2 AND outcome_type = 'no'`,
    [userId, marketId, noAmount]
  );
  
  // Log operation
  await client.query(
    `INSERT INTO public.user_operations (user_id, market_id, operation_type, amount, metadata)
     VALUES ($1, $2, 'merge', $3, $4)`,
    [userId, marketId, amount, JSON.stringify({ yesAmount: yesAmount.toString(), noAmount: noAmount.toString() })]
  );
  
  await logEvent(client, event, marketId, userId);
  
  logger.debug('Processed PositionMerged', { market: market.toString(), user: user.toString() });
}

async function handleCtfTokensRedeemed(client: PoolClient, event: ParsedEvent): Promise<void> {
  const { market, user, winningOutcome, tokensBurned, usdcReceived, slot } = event.data;
  
  const marketId = await getMarketIdByAddress(client, market.toString());
  if (!marketId) return;
  
  const userId = await ensureUser(client, user.toString());
  
  // Create redemption record
  await client.query(
    `INSERT INTO public.redemptions (user_id, market_id, outcome_type, amount, usdc_received)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, marketId, winningOutcome === 0 ? 'yes' : 'no', tokensBurned, usdcReceived]
  );
  
  // Zero out redeemed position
  await client.query(
    `UPDATE public.stakes SET amount = 0, updated_at = NOW()
     WHERE user_id = $1 AND market_id = $2 AND outcome_type = $3`,
    [userId, marketId, winningOutcome === 0 ? 'yes' : 'no']
  );
  
  await logEvent(client, event, marketId, userId);
  
  logger.info('Processed CtfTokensRedeemed', { market: market.toString(), user: user.toString(), usdc: usdcReceived.toString() });
}

async function handleGlobalFeeRatesUpdated(client: PoolClient, event: ParsedEvent): Promise<void> {
  const { 
    updatedBy, centerTakerFeeRate, extremeTakerFeeRate, platformFeeRate, makerRebateRate, creatorIncentiveRate, timestamp 
  } = event.data;
  
  // Update platform settings
  await client.query(
    `UPDATE public.platform_settings SET
       center_taker_fee_rate = $1,
       extreme_taker_fee_rate = $2,
       platform_fee_rate = $3,
       maker_rebate_rate = $4,
       creator_incentive_rate = $5,
       updated_at = NOW()
     WHERE key = 'fee_config'`,
    [
      Number(centerTakerFeeRate) / 1_000_000,
      Number(extremeTakerFeeRate) / 1_000_000,
      Number(platformFeeRate) / 1_000_000,
      Number(makerRebateRate) / 1_000_000,
      Number(creatorIncentiveRate) / 1_000_000,
    ]
  );
  
  // Update global state
  await client.query(
    `UPDATE public.global_state SET
       center_taker_fee_rate = $1,
       extreme_taker_fee_rate = $2,
       platform_fee_rate = $3,
       maker_rebate_rate = $4,
       creator_incentive_rate = $5,
       updated_at = NOW()`,
    [centerTakerFeeRate, extremeTakerFeeRate, platformFeeRate, makerRebateRate, creatorIncentiveRate]
  );
  
  await logEvent(client, event, null, null);
  
  logger.info('Processed GlobalFeeRatesUpdated');
}

async function handleGlobalTradingPaused(client: PoolClient, event: ParsedEvent): Promise<void> {
  const { pausedBy, timestamp } = event.data;
  
  await client.query(
    `UPDATE public.global_state SET trading_paused = true, updated_at = NOW()`
  );
  
  await logEvent(client, event, null, null);
  
  logger.info('Processed GlobalTradingPaused');
}

async function handleGlobalTradingUnpaused(client: PoolClient, event: ParsedEvent): Promise<void> {
  const { unpausedBy, timestamp } = event.data;
  
  await client.query(
    `UPDATE public.global_state SET trading_paused = false, updated_at = NOW()`
  );
  
  await logEvent(client, event, null, null);
  
  logger.info('Processed GlobalTradingUnpaused');
}

// ============================================
// Event Router
// ============================================

const eventHandlers: Record<string, (client: PoolClient, event: ParsedEvent) => Promise<void>> = {
  'MarketCreated': handleMarketCreated,
  'MarketSettled': handleMarketSettled,
  'MarketTerminated': handleMarketTerminated,
  'MarketPaused': handleMarketPaused,
  'MarketResumed': handleMarketResumed,
  'OrderFilled': handleOrderFilled,
  'OrderCancelled': handleOrderCancelled,
  'NonceIncremented': handleNonceIncremented,
  'PositionSplit': handlePositionSplit,
  'PositionMerged': handlePositionMerged,
  'CtfTokensRedeemed': handleCtfTokensRedeemed,
  'GlobalFeeRatesUpdated': handleGlobalFeeRatesUpdated,
  'GlobalTradingPaused': handleGlobalTradingPaused,
  'GlobalTradingUnpaused': handleGlobalTradingUnpaused,
  // Note: TradingFeeCollected is handled by sync-trades.ts
};

// ============================================
// Blockchain Functions
// ============================================

const RPC_MAX_RETRIES = parseNum('SOLANA_RPC_MAX_RETRIES', 3, { min: 1, max: 10 });
const RPC_RETRY_DELAY_MS = parseNum('SOLANA_RPC_RETRY_DELAY_MS', 1000, { min: 100, max: 10000 });

async function rpcWithRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
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
      logger.warn(`RPC ${operationName} failed, retrying in ${delay}ms`, { attempt: attempt + 1 });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function fetchAndParseEvents(afterSlot: number): Promise<ParsedEvent[]> {
  logger.debug('Fetching events', { afterSlot });
  
  try {
    const signatures = await rpcWithRetry(
      () => connection.getSignaturesForAddress(PROGRAM_ID, { limit: BATCH_SIZE }, 'confirmed'),
      'getSignaturesForAddress'
    );
    
    const newSignatures = signatures.filter(sig => sig.slot > afterSlot);
    
    if (newSignatures.length === 0) {
      return [];
    }
    
    logger.info('Found new signatures', { count: newSignatures.length });
    
    const events: ParsedEvent[] = [];
    
    // Batch fetch transactions
    const batchSize = 100;
    for (let i = 0; i < newSignatures.length; i += batchSize) {
      const batch = newSignatures.slice(i, i + batchSize);
      const signatureStrings = batch.map(s => s.signature);
      
      const transactions = await rpcWithRetry(
        () => connection.getTransactions(signatureStrings, { maxSupportedTransactionVersion: 0 }),
        'getTransactions'
      );
      
      for (let j = 0; j < transactions.length; j++) {
        const tx = transactions[j];
        const sig = batch[j];
        
        if (!tx || !tx.meta?.logMessages) continue;
        
        // Parse events using Anchor event parser
        try {
          const parsedEvents = eventParser.parseLogs(tx.meta.logMessages);
          for (const event of parsedEvents) {
            // Skip TradingFeeCollected as it's handled by sync-trades.ts
            if (event.name === 'TradingFeeCollected') continue;
            
            events.push({
              name: event.name,
              data: event.data,
              signature: sig.signature,
              slot: sig.slot,
              blockTime: tx.blockTime,
            });
          }
        } catch (parseError) {
          logger.debug('Failed to parse events from tx', { signature: sig.signature });
        }
      }
    }
    
    logger.info('Parsed events', { count: events.length });
    return events;
  } catch (error) {
    logger.error('Failed to fetch events', error);
    return [];
  }
}

// ============================================
// Main Sync Loop
// ============================================

async function syncEvents(): Promise<number> {
  if (!pool) {
    throw new Error('DATABASE_URL not configured');
  }

  const result = await transactionWithRetry(
    pool,
    async (client) => {
      let processedCount = 0;
      
      const state = await getSyncState(client, 'events');
      logger.info('Starting event sync', { lastSlot: state.lastSlot, totalProcessed: state.eventsProcessed });
      
      const events = await fetchAndParseEvents(state.lastSlot);
      
      if (events.length === 0) {
        logger.debug('No new events found');
        return 0;
      }
      
      // Sort events by slot to process in order
      events.sort((a, b) => a.slot - b.slot);
      
      for (const event of events) {
        if (DRY_RUN) {
          logger.info('DRY_RUN: Would process event', { name: event.name, slot: event.slot });
          continue;
        }
        
        const handler = eventHandlers[event.name];
        if (!handler) {
          logger.debug('No handler for event', { name: event.name });
          continue;
        }
        
        try {
          await handler(client, event);
          processedCount++;
          
          state.lastSlot = Math.max(state.lastSlot, event.slot);
          state.lastSignature = event.signature;
          state.eventsProcessed++;
        } catch (error) {
          logger.error('Failed to process event', error, { event: event.name, signature: event.signature });
          
          // Log failed event for later retry
          try {
            await client.query(
              `UPDATE public.event_log SET error = $2, processed = false WHERE transaction_signature = $1 AND event_type = $3`,
              [event.signature, String(error), event.name]
            );
          } catch {}
        }
      }
      
      await updateSyncState(client, 'events', state);
      
      logger.info('Event sync completed', { processedCount, totalProcessed: state.eventsProcessed });
      return processedCount;
    },
    {
      operation: 'sync-events',
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
  logger.info('Event indexer service starting', { 
    batchSize: BATCH_SIZE,
    intervalMs: SYNC_INTERVAL_MS,
    dryRun: DRY_RUN,
    handlers: Object.keys(eventHandlers),
  });

  // Run once if not in continuous mode
  if (process.env.SYNC_ONCE === 'true') {
    await syncEvents();
    return;
  }

  // Continuous sync loop
  const runSync = async () => {
    try {
      await syncEvents();
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
      return closePool(pool);
    }
    logger.info('Continuous event sync running');
  })
  .catch(async (err) => {
    logger.error('Event indexer service failed', err);
    await closePool(pool);
    process.exit(1);
  });
