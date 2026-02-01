import type { SupabaseClient } from '@supabase/supabase-js';
import { updateLiquidityScoresForMarket } from './liquidity-score.js';

interface MarketConfig {
  id: string;
  maker_rebate_rate?: number | null;
}

export function getUtc12Window(now: Date) {
  const utc12 = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      12,
      0,
      0,
      0
    )
  );
  const periodEnd = now < utc12 ? new Date(utc12.getTime() - 24 * 60 * 60 * 1000) : utc12;
  const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);
  return { periodStart, periodEnd, rewardPeriod: periodEnd.toISOString().slice(0, 10) };
}

export async function createLiquiditySnapshot(supabase: SupabaseClient, now: Date = new Date()) {
  const { data: markets, error: marketsError } = await supabase
    .from('markets')
    .select('id')
    .in('status', ['active', 'running'])
    .eq('is_paused', false);

  if (marketsError) {
    throw new Error(`Failed to load markets: ${marketsError.message}`);
  }

  for (const market of markets || []) {
    await updateLiquidityScoresForMarket(supabase, (market as { id: string }).id, now);
  }

  return { sampledAt: now.toISOString(), marketsCount: markets?.length ?? 0 };
}

export async function distributeLiquidityRewards(supabase: SupabaseClient, now: Date = new Date()) {
  const { periodStart, periodEnd, rewardPeriod } = getUtc12Window(now);

  const { data: markets, error: marketsError } = await supabase
    .from('markets')
    .select('id')
    .in('status', ['active', 'running'])
    .eq('is_paused', false);

  if (marketsError) {
    throw new Error(`Failed to load markets: ${marketsError.message}`);
  }

  for (const market of markets || []) {
    await updateLiquidityScoresForMarket(supabase, (market as { id: string }).id, periodEnd);
  }

  const { data: states, error: statesError } = await supabase
    .from('liquidity_score_state')
    .select('market_id, user_id, accumulated_score')
    .gte('period_start', periodStart.toISOString())
    .lt('period_start', periodEnd.toISOString());

  if (statesError) {
    throw new Error(`Failed to load liquidity score state: ${statesError.message}`);
  }

  const qByMarketUser = new Map<string, number>();
  const totalQByMarket = new Map<string, number>();

  for (const row of states || []) {
    const marketId = (row as { market_id: string }).market_id;
    const userId = (row as { user_id: string }).user_id;
    const qMin = Number((row as { accumulated_score: number }).accumulated_score || 0);
    const key = `${marketId}:${userId}`;
    qByMarketUser.set(key, (qByMarketUser.get(key) || 0) + qMin);
    totalQByMarket.set(marketId, (totalQByMarket.get(marketId) || 0) + qMin);
  }

  const { data: trades, error: tradesError } = await supabase
    .from('trades')
    .select('market_id, taker_fee')
    .gte('block_time', periodStart.toISOString())
    .lt('block_time', periodEnd.toISOString());

  if (tradesError) {
    throw new Error(`Failed to load trades: ${tradesError.message}`);
  }

  const { data: marketConfigs, error: marketConfigsError } = await supabase
    .from('markets')
    .select('id, maker_rebate_rate');

  if (marketConfigsError) {
    throw new Error(`Failed to load market configs: ${marketConfigsError.message}`);
  }

  const rebateByMarket = new Map<string, number>();
  for (const market of (marketConfigs || []) as MarketConfig[]) {
    rebateByMarket.set(market.id, Number(market.maker_rebate_rate ?? 0.2));
  }

  const rewardPoolByMarket = new Map<string, number>();
  for (const trade of trades || []) {
    const marketId = (trade as { market_id: string }).market_id;
    const takerFee = Number((trade as { taker_fee: number }).taker_fee || 0);
    const rebateRate = rebateByMarket.get(marketId) ?? 0.2;
    rewardPoolByMarket.set(
      marketId,
      (rewardPoolByMarket.get(marketId) || 0) + takerFee * rebateRate
    );
  }

  const rewardRows = [];
  for (const [key, userQ] of qByMarketUser.entries()) {
    const [marketId, userId] = key.split(':');
    const totalQ = totalQByMarket.get(marketId) || 0;
    if (totalQ <= 0) {
      continue;
    }
    const pool = rewardPoolByMarket.get(marketId) || 0;
    if (pool <= 0) {
      continue;
    }
    const share = userQ / totalQ;
    const rewardAmount = Math.floor(pool * share);
    rewardRows.push({
      reward_period: rewardPeriod,
      market_id: marketId,
      user_id: userId,
      total_reward_pool: Math.floor(pool),
      total_q_epoch: totalQ,
      reward_share: share,
      reward_amount: rewardAmount,
      status: 'pending',
    });
  }

  if (rewardRows.length > 0) {
    const { error: insertError } = await supabase
      .from('liquidity_rewards')
      .upsert(rewardRows, { onConflict: 'user_id,market_id,reward_period' });
    if (insertError) {
      throw new Error(`Failed to insert liquidity rewards: ${insertError.message}`);
    }
  }

  await supabase
    .from('liquidity_score_state')
    .update({
      accumulated_score: 0,
      period_start: periodEnd.toISOString(),
      last_updated_at: periodEnd.toISOString(),
    })
    .in('market_id', (markets || []).map((m) => (m as { id: string }).id));

  return {
    rewardPeriod,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    rewardRows: rewardRows.length,
  };
}
