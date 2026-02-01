import type { SupabaseClient } from '@supabase/supabase-js';
import { getUtc12Window } from './liquidity-rewards.js';

const DEFAULT_MAX_SPREAD = 0.03;
const DEFAULT_MIN_SIZE = 1_000_000;
const DEFAULT_C_FACTOR = 3.0;

interface MarketConfig {
  id: string;
  probability: number | null;
  max_incentive_spread: number | null;
  min_incentive_size: number | null;
}

interface OrderRow {
  user_id: string | null;
  outcome_type: 'yes' | 'no';
  side: 'buy' | 'sell';
  order_type: 'limit' | 'market';
  price: number | null;
  amount: number;
  filled_amount: number | null;
  remaining_amount: number | null;
  status: 'open' | 'partial' | 'filled' | 'cancelled';
}

interface ScoreStateRow {
  id: string;
  user_id: string;
  last_q_min: number;
  accumulated_score: number;
  last_updated_at: string;
  period_start: string | null;
}

function getRemainingAmount(order: OrderRow) {
  if (order.remaining_amount !== null && order.remaining_amount !== undefined) {
    return Math.max(Number(order.remaining_amount), 0);
  }
  const filled = order.filled_amount ?? 0;
  return Math.max(Number(order.amount) - Number(filled), 0);
}

function calculateS(maxSpread: number, spread: number) {
  if (spread >= maxSpread) {
    return 0;
  }
  const ratio = (maxSpread - spread) / maxSpread;
  return ratio * ratio;
}

function getMidpoint(
  bestBidYes?: number | null,
  bestAskYes?: number | null,
  bestBidNo?: number | null,
  bestAskNo?: number | null,
  fallback?: number | null
) {
  if (bestBidYes !== null && bestBidYes !== undefined && bestAskYes !== null && bestAskYes !== undefined) {
    return (bestBidYes + bestAskYes) / 2;
  }
  if (bestBidNo !== null && bestBidNo !== undefined && bestAskNo !== null && bestAskNo !== undefined) {
    return 1 - (bestBidNo + bestAskNo) / 2;
  }
  if (fallback !== null && fallback !== undefined) {
    return Math.max(0, Math.min(1, fallback));
  }
  return 0.5;
}

export async function updateLiquidityScoresForMarket(
  supabase: SupabaseClient,
  marketId: string,
  eventTime: Date = new Date()
) {
  const { data: market, error: marketError } = await supabase
    .from('markets')
    .select('id, probability, max_incentive_spread, min_incentive_size')
    .eq('id', marketId)
    .single();

  if (marketError || !market) {
    throw new Error(`Market not found: ${marketError?.message || marketId}`);
  }

  const marketConfig = market as MarketConfig;
  const maxSpread = marketConfig.max_incentive_spread ?? DEFAULT_MAX_SPREAD;
  const minSize = marketConfig.min_incentive_size ?? DEFAULT_MIN_SIZE;

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('user_id, outcome_type, side, order_type, price, amount, filled_amount, remaining_amount, status')
    .eq('market_id', marketId)
    .in('status', ['open', 'partial'])
    .eq('order_type', 'limit');

  if (ordersError) {
    throw new Error(`Failed to load orders: ${ordersError.message}`);
  }

  const typedOrders = (orders || []) as OrderRow[];

  const bestBidYes = Math.max(
    ...typedOrders
      .filter((o) => o.outcome_type === 'yes' && o.side === 'buy' && o.price !== null)
      .map((o) => Number(o.price)),
    -Infinity
  );
  const bestAskYes = Math.min(
    ...typedOrders
      .filter((o) => o.outcome_type === 'yes' && o.side === 'sell' && o.price !== null)
      .map((o) => Number(o.price)),
    Infinity
  );
  const bestBidNo = Math.max(
    ...typedOrders
      .filter((o) => o.outcome_type === 'no' && o.side === 'buy' && o.price !== null)
      .map((o) => Number(o.price)),
    -Infinity
  );
  const bestAskNo = Math.min(
    ...typedOrders
      .filter((o) => o.outcome_type === 'no' && o.side === 'sell' && o.price !== null)
      .map((o) => Number(o.price)),
    Infinity
  );

  const midpoint = getMidpoint(
    Number.isFinite(bestBidYes) ? bestBidYes : null,
    Number.isFinite(bestAskYes) ? bestAskYes : null,
    Number.isFinite(bestBidNo) ? bestBidNo : null,
    Number.isFinite(bestAskNo) ? bestAskNo : null,
    marketConfig.probability
  );

  const userScores = new Map<string, { qOne: number; qTwo: number }>();

  for (const order of typedOrders) {
    if (!order.user_id || order.price === null || order.price === undefined) {
      continue;
    }
    const remaining = getRemainingAmount(order);
    if (remaining < minSize) {
      continue;
    }
    const price = Number(order.price);
    const spread = Math.abs(price - midpoint);
    if (spread > maxSpread) {
      continue;
    }
    const score = calculateS(maxSpread, spread);
    if (score <= 0) {
      continue;
    }
    const contribution = score * remaining;
    const entry = userScores.get(order.user_id) || { qOne: 0, qTwo: 0 };

    if (order.outcome_type === 'yes' && order.side === 'buy') {
      entry.qOne += contribution;
    } else if (order.outcome_type === 'yes' && order.side === 'sell') {
      entry.qTwo += contribution;
    } else if (order.outcome_type === 'no' && order.side === 'sell') {
      entry.qOne += contribution;
    } else if (order.outcome_type === 'no' && order.side === 'buy') {
      entry.qTwo += contribution;
    }

    userScores.set(order.user_id, entry);
  }

  const inRange = midpoint >= 0.1 && midpoint <= 0.9;
  const qMinByUser = new Map<string, number>();
  for (const [userId, score] of userScores.entries()) {
    const qOne = score.qOne;
    const qTwo = score.qTwo;
    let qMin = Math.min(qOne, qTwo);
    if (inRange) {
      qMin = Math.max(qMin, Math.max(qOne / DEFAULT_C_FACTOR, qTwo / DEFAULT_C_FACTOR));
    }
    qMinByUser.set(userId, qMin);
  }

  const { data: states, error: stateError } = await supabase
    .from('liquidity_score_state')
    .select('id, user_id, last_q_min, accumulated_score, last_updated_at, period_start')
    .eq('market_id', marketId);

  if (stateError) {
    throw new Error(`Failed to load score state: ${stateError.message}`);
  }

  const nowIso = eventTime.toISOString();
  const { periodStart } = getUtc12Window(eventTime);
  const periodStartIso = periodStart.toISOString();

  const existingStates = (states || []) as ScoreStateRow[];
  const existingByUser = new Map(existingStates.map((state) => [state.user_id, state]));

  const updates = [];
  const inserts = [];

  for (const state of existingStates) {
    const newQMin = qMinByUser.get(state.user_id) || 0;
    const lastUpdated = new Date(state.last_updated_at);
    const effectiveStart = new Date(state.period_start ? state.period_start : periodStartIso);
    const baseline = lastUpdated < effectiveStart ? effectiveStart : lastUpdated;
    const deltaMinutes = Math.max(0, (eventTime.getTime() - baseline.getTime()) / 60000);
    const accumulated = Number(state.accumulated_score || 0) + Number(state.last_q_min || 0) * deltaMinutes;

    updates.push({
      id: state.id,
      market_id: marketId,
      user_id: state.user_id,
      last_q_min: newQMin,
      accumulated_score: accumulated,
      last_updated_at: nowIso,
      period_start: state.period_start || periodStartIso,
    });
  }

  for (const [userId, qMin] of qMinByUser.entries()) {
    if (!existingByUser.has(userId)) {
      inserts.push({
        market_id: marketId,
        user_id: userId,
        last_q_min: qMin,
        accumulated_score: 0,
        last_updated_at: nowIso,
        period_start: periodStartIso,
      });
    }
  }

  if (updates.length > 0) {
    const { error: updateError } = await supabase
      .from('liquidity_score_state')
      .upsert(updates, { onConflict: 'id' });
    if (updateError) {
      throw new Error(`Failed to update score state: ${updateError.message}`);
    }
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase
      .from('liquidity_score_state')
      .insert(inserts);
    if (insertError) {
      throw new Error(`Failed to insert score state: ${insertError.message}`);
    }
  }

  return {
    marketId,
    midpoint,
    updated: updates.length,
    inserted: inserts.length,
  };
}
