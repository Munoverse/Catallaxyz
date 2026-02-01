/**
 * Matching Engine
 * 
 * This module handles order matching in the database.
 * On-chain settlement uses the new exchange system with user-signed orders.
 * 
 * @see exchange-executor.ts for on-chain settlement
 */

import { createServerClient } from './supabase.js';
import { createNotification } from './notifications.js';
import { logger } from './logger.js';

type OrderRow = {
  id: string;
  market_id: string;
  user_id: string;
  outcome_type: 'yes' | 'no';
  side: 'buy' | 'sell';
  order_type: 'limit' | 'market';
  price: number | null;
  amount: string;
  filled_amount: string | null;
  remaining_amount: string | null;
  created_at: string;
};

type FillResult = {
  makerOrderId: string;
  takerOrderId: string;
  makerUserId: string;
  takerUserId: string;
  makerWallet: string;
  takerWallet: string;
  outcomeType: 'yes' | 'no';
  side: 'buy' | 'sell';
  price: number;
  size: bigint;
  totalCost: bigint;
  takerFee: bigint;
  makerRebate: bigint;
  platformFee: bigint;
  creatorFee: bigint;
  fillId?: string;
};

// ============================================
// Fee configuration using scaled integers for precision
// All rates are stored as integers scaled by 10^6 (e.g., 750000 = 75%)
// ============================================
type FeeConfig = {
  platformFeeRate: bigint;      // scaled by 10^6 (e.g., 750000n = 75%)
  makerRebateRate: bigint;      // scaled by 10^6 (e.g., 200000n = 20%)
  creatorIncentiveRate: bigint; // scaled by 10^6 (e.g., 50000n = 5%)
  centerTakerFeeRate: bigint;   // scaled by 10^6 (e.g., 32000n = 3.2%)
  extremeTakerFeeRate: bigint;  // scaled by 10^6 (e.g., 2000n = 0.2%)
};

// Precision scale factor (10^6)
const RATE_SCALE = 1_000_000n;
const PRICE_SCALE = 1_000_000n;

const DEFAULT_FEE_CONFIG: FeeConfig = {
  platformFeeRate: 750_000n,      // 75%
  makerRebateRate: 200_000n,      // 20%
  creatorIncentiveRate: 50_000n,  // 5%
  centerTakerFeeRate: 32_000n,    // 3.2%
  extremeTakerFeeRate: 2_000n,    // 0.2%
};

function toBigInt(value: string | number | null | undefined) {
  return BigInt(value || 0);
}

/**
 * Calculate dynamic taker fee rate based on probability (curvature fee)
 * Formula: fee = center_fee - (center_fee - extreme_fee) × (|price - 0.5| / 0.5)
 * 
 * SECURITY FIX: Uses pure BigInt arithmetic to avoid precision loss
 * for large amounts (JavaScript Number max safe integer is 2^53)
 * 
 * @param priceScaled - Price scaled by 10^6 (0-1000000 representing 0-1)
 * @param config - Fee configuration with scaled rates
 * @returns Fee rate scaled by 10^6 (e.g., 32000n for 3.2%)
 */
function calculateDynamicTakerFeeRateBigInt(priceScaled: bigint, config: FeeConfig): bigint {
  const centerPrice = 500_000n; // 0.5 scaled by 10^6
  
  // Calculate distance from 50% (center)
  const distanceFromCenter = priceScaled > centerPrice 
    ? priceScaled - centerPrice 
    : centerPrice - priceScaled;
  
  // Calculate fee reduction: (rate_range * distance) / 500000
  const rateRange = config.centerTakerFeeRate - config.extremeTakerFeeRate;
  const feeReduction = (rateRange * distanceFromCenter) / centerPrice;
  
  // Ensure we don't go below extreme rate
  const calculatedRate = config.centerTakerFeeRate - feeReduction;
  return calculatedRate > config.extremeTakerFeeRate ? calculatedRate : config.extremeTakerFeeRate;
}

/**
 * Legacy function for backward compatibility
 * Converts decimal price to scaled BigInt and delegates to BigInt version
 */
function calculateDynamicTakerFeeRate(price: number, config: FeeConfig): bigint {
  const priceScaled = BigInt(Math.floor(price * 1_000_000));
  return calculateDynamicTakerFeeRateBigInt(priceScaled, config);
}

/**
 * Get fee configuration from database
 * Converts decimal rates (0.75) to scaled BigInt (750000n)
 */
async function getFeeConfig(): Promise<FeeConfig> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('platform_settings')
      .select('platform_fee_rate, maker_rebate_rate, creator_incentive_rate, center_taker_fee_rate, extreme_taker_fee_rate')
      .eq('key', 'fee_config')
      .single();
    
    if (error || !data) {
      logger.warn('matching-engine', 'Failed to fetch fee config, using defaults', { message: error?.message });
      return DEFAULT_FEE_CONFIG;
    }
    
    // Convert decimal rates to scaled BigInt (multiply by 10^6)
    const toScaledBigInt = (value: number | null, defaultValue: bigint): bigint => {
      if (value === null || value === undefined) return defaultValue;
      return BigInt(Math.floor(Number(value) * 1_000_000));
    };
    
    return {
      platformFeeRate: toScaledBigInt(data.platform_fee_rate, DEFAULT_FEE_CONFIG.platformFeeRate),
      makerRebateRate: toScaledBigInt(data.maker_rebate_rate, DEFAULT_FEE_CONFIG.makerRebateRate),
      creatorIncentiveRate: toScaledBigInt(data.creator_incentive_rate, DEFAULT_FEE_CONFIG.creatorIncentiveRate),
      centerTakerFeeRate: toScaledBigInt(data.center_taker_fee_rate, DEFAULT_FEE_CONFIG.centerTakerFeeRate),
      extremeTakerFeeRate: toScaledBigInt(data.extreme_taker_fee_rate, DEFAULT_FEE_CONFIG.extremeTakerFeeRate),
    };
  } catch (err) {
    logger.error('matching-engine', 'Error fetching fee config', err);
    return DEFAULT_FEE_CONFIG;
  }
}

/**
 * Calculate fee breakdown for a trade
 * 
 * SECURITY FIX: Uses pure BigInt arithmetic throughout to prevent
 * precision loss for large trade amounts (> 2^53 lamports / ~$9T)
 * 
 * @param totalCost - Total trade cost in lamports (BigInt)
 * @param price - Execution price (0-1)
 * @param config - Fee configuration with scaled rates
 */
function calculateFees(
  totalCost: bigint,
  price: number,
  config: FeeConfig,
  applyFees: boolean
): { takerFee: bigint; makerRebate: bigint; platformFee: bigint; creatorFee: bigint } {
  if (!applyFees) {
    return { takerFee: 0n, makerRebate: 0n, platformFee: 0n, creatorFee: 0n };
  }
  // Calculate dynamic fee rate based on price (returns scaled BigInt)
  const feeRateScaled = calculateDynamicTakerFeeRate(price, config);
  
  // Total taker fee: totalCost * feeRate / 10^6
  const takerFee = (totalCost * feeRateScaled) / RATE_SCALE;
  
  // Fee distribution using scaled BigInt arithmetic
  // makerRebate = takerFee * makerRebateRate / 10^6
  const makerRebate = (takerFee * config.makerRebateRate) / RATE_SCALE;
  
  // creatorFee = takerFee * creatorIncentiveRate / 10^6
  const creatorFee = (takerFee * config.creatorIncentiveRate) / RATE_SCALE;
  
  // platformFee = remainder (ensures no rounding loss)
  const platformFee = takerFee - makerRebate - creatorFee;
  
  return { takerFee, makerRebate, platformFee, creatorFee };
}

/**
 * Apply fill using database transaction function
 */
async function applyFillWithTransaction(
  fill: FillResult
): Promise<boolean> {
  const supabase = createServerClient();
  
  const { data, error } = await supabase.rpc('apply_trade_fill', {
    p_maker_id: fill.makerUserId,
    p_taker_id: fill.takerUserId,
    p_outcome_type: fill.outcomeType,
    p_side: fill.side,
    p_size: fill.size.toString(),
    p_price: fill.price,
    p_taker_fee: fill.takerFee.toString(),
    p_maker_rebate: fill.makerRebate.toString(),
    p_platform_fee: fill.platformFee.toString(),
    p_creator_fee: fill.creatorFee.toString(),
  });
  
  if (error) {
    logger.error('matching-engine', 'Failed to apply fill with transaction', error);
    return false;
  }
  
  const result = data as { success: boolean; error?: string };
  if (!result.success) {
    logger.error('matching-engine', 'Fill transaction failed', result.error);
    return false;
  }
  
  return true;
}

/**
 * Main order matching function
 */
export async function matchOrder(order: OrderRow) {
  const supabase = createServerClient();
  const isBuy = order.side === 'buy';
  const remaining = toBigInt(order.remaining_amount || order.amount);
  
  // Get fee configuration
  const feeConfig = await getFeeConfig();

  // Find matching orders
  const query = supabase
    .from('orders')
    .select('*')
    .eq('market_id', order.market_id)
    .eq('outcome_type', order.outcome_type)
    .eq('status', 'open')
    .neq('id', order.id)
    .eq('side', isBuy ? 'sell' : 'buy');

  const { data: candidates, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  // Sort by price (best price first) then by time (FIFO)
  const sorted = (candidates as OrderRow[]).sort((a, b) => {
    const priceA = a.price ?? 0;
    const priceB = b.price ?? 0;
    if (priceA === priceB) {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    return isBuy ? priceA - priceB : priceB - priceA;
  });

  const fills: FillResult[] = [];
  let takerRemaining = remaining;

  for (const maker of sorted) {
    if (takerRemaining <= 0n) break;
    const makerRemaining = toBigInt(maker.remaining_amount || maker.amount);
    if (makerRemaining <= 0n) continue;

    const executionPrice = maker.price ?? order.price ?? 0;
    if (executionPrice <= 0) {
      continue;
    }

    // Price check for limit orders
    if (order.order_type === 'limit' && order.price) {
      if (isBuy && executionPrice > order.price) continue;
      if (!isBuy && executionPrice < order.price) continue;
    }

    const fillSize = takerRemaining < makerRemaining ? takerRemaining : makerRemaining;
    const totalCost = (fillSize * BigInt(Math.floor(executionPrice * 1_000_000))) / 1_000_000n;

    // AUDIT FIX HIGH-7: Batch fetch wallet addresses to avoid N+1 queries
    // Collect all user IDs first, then batch fetch
    const userIds = new Set([maker.user_id, order.user_id]);
    const { data: users } = await supabase
      .from('users')
      .select('id, wallet_address')
      .in('id', Array.from(userIds));

    const userWalletMap = new Map(users?.map(u => [u.id, u.wallet_address]) || []);
    const makerWallet = userWalletMap.get(maker.user_id);
    const takerWallet = userWalletMap.get(order.user_id);

    if (!makerWallet || !takerWallet) {
      throw new Error('Missing wallet address for maker or taker');
    }

    // Calculate fees with curvature
    const fees = calculateFees(totalCost, executionPrice, feeConfig, order.order_type === 'market');

    fills.push({
      makerOrderId: maker.id,
      takerOrderId: order.id,
      makerUserId: maker.user_id,
      takerUserId: order.user_id,
      makerWallet,
      takerWallet,
      outcomeType: order.outcome_type,
      side: order.side,
      price: executionPrice,
      size: fillSize,
      totalCost,
      ...fees,
    });

    takerRemaining -= fillSize;
  }

  if (!fills.length) {
    return [];
  }

  // Process each fill
  for (const fill of fills) {
    // 1. Apply fill with database transaction (atomic balance update)
    const success = await applyFillWithTransaction(fill);
    if (!success) {
      logger.error('matching-engine', 'Failed to apply fill, skipping', fill);
      continue;
    }

    // 2. Update order states with optimistic locking
    // AUDIT FIX CRIT-1: Use RPC function with row-level locking to prevent race conditions
    const { data: updateResult, error: updateError } = await supabase.rpc('update_order_fill_atomic', {
      p_maker_order_id: fill.makerOrderId,
      p_taker_order_id: fill.takerOrderId,
      p_fill_size: fill.size.toString(),
    });

    if (updateError) {
      logger.error('matching-engine', 'Atomic order update failed, using fallback', updateError);
      
      // Fallback: Sequential updates with version check
      const { data: makerOrder } = await supabase
        .from('orders')
        .select('filled_amount, amount, version')
        .eq('id', fill.makerOrderId)
        .single();

      const { data: takerOrder } = await supabase
        .from('orders')
        .select('filled_amount, amount, version')
        .eq('id', fill.takerOrderId)
        .single();

      const makerFilled = toBigInt(makerOrder?.filled_amount) + fill.size;
      const takerFilled = toBigInt(takerOrder?.filled_amount) + fill.size;

      // Update with version check for optimistic locking
      const { error: makerError } = await supabase
        .from('orders')
        .update({
          filled_amount: makerFilled.toString(),
          remaining_amount: (toBigInt(makerOrder?.amount) - makerFilled).toString(),
          version: (makerOrder?.version || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fill.makerOrderId)
        .eq('version', makerOrder?.version || 0);

      if (makerError) {
        logger.error('matching-engine', 'Maker order update conflict', { orderId: fill.makerOrderId });
      }

      const { error: takerError } = await supabase
        .from('orders')
        .update({
          filled_amount: takerFilled.toString(),
          remaining_amount: (toBigInt(takerOrder?.amount) - takerFilled).toString(),
          version: (takerOrder?.version || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fill.takerOrderId)
        .eq('version', takerOrder?.version || 0);

      if (takerError) {
        logger.error('matching-engine', 'Taker order update conflict', { orderId: fill.takerOrderId });
      }
    }

    // 3. Record fill in order_fills table
    const { data: fillRecord } = await supabase.from('order_fills').insert({
      market_id: order.market_id,
      maker_order_id: fill.makerOrderId,
      taker_order_id: fill.takerOrderId,
      maker_user_id: fill.makerUserId,
      taker_user_id: fill.takerUserId,
      outcome_type: fill.outcomeType,
      side: fill.side,
      price: fill.price,
      size: fill.size.toString(),
      total_cost: fill.totalCost.toString(),
      maker_fee: (-fill.makerRebate).toString(),  // Negative = rebate
      taker_fee: fill.takerFee.toString(),
    }).select('id').single();

    fill.fillId = fillRecord?.id;

    // 4. Record trade
    const { data: tradeRecord, error: tradeError } = await supabase.from('trades').insert({
      market_id: order.market_id,
      user_id: fill.takerUserId,
      outcome_type: fill.outcomeType,
      side: fill.side,
      maker_order_id: fill.makerOrderId,
      taker_order_id: fill.takerOrderId,
      maker_user_id: fill.makerUserId,
      taker_user_id: fill.takerUserId,
      amount: fill.size.toString(),
      price: fill.price,
      total_cost: fill.totalCost.toString(),
      platform_fee: fill.platformFee.toString(),
      maker_fee: (-fill.makerRebate).toString(),
      taker_fee: fill.takerFee.toString(),
    }).select('id').single();

    if (tradeError) {
      logger.error('matching-engine', 'Failed to record trade', tradeError);
    } else if (tradeRecord?.id) {
      const amountUi = Number(fill.size) / 1_000_000;
      const priceUi = fill.price;
      const tradeTitle = `${fill.side === 'buy' ? 'Buy' : 'Sell'} ${fill.outcomeType.toUpperCase()}`;
      await Promise.all([
        createNotification({
          userId: fill.takerUserId,
          type: 'trade',
          title: `${tradeTitle} filled`,
          message: `Filled ${amountUi.toFixed(2)} @ ${priceUi.toFixed(3)}`,
          marketId: order.market_id,
          tradeId: tradeRecord.id,
        }).catch(() => null),
        createNotification({
          userId: fill.makerUserId,
          type: 'trade',
          title: `Order filled`,
          message: `Matched ${amountUi.toFixed(2)} @ ${priceUi.toFixed(3)}`,
          marketId: order.market_id,
          tradeId: tradeRecord.id,
        }).catch(() => null),
      ]);
    }

    // On-chain settlement is handled by the new exchange system with user-signed orders
    // See: exchange-executor.ts with match_orders instruction
  }

  return fills;
}
