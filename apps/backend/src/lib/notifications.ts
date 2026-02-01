import { createServerClient } from './supabase.js';
import { publishMessage } from './redis/client.js';
import { logger } from './logger.js';

export type NotificationType = 'trade' | 'settlement' | 'comment' | 'mention' | 'system';

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
  marketId?: string;
  tradeId?: string;
  commentId?: string;
}

const walletCache = new Map<string, string>();
const marketTitleCache = new Map<string, string>();

async function getUserWalletAddress(userId: string, supabaseClient = createServerClient()) {
  if (walletCache.has(userId)) {
    return walletCache.get(userId) || null;
  }

  const { data } = await supabaseClient
    .from('users')
    .select('wallet_address')
    .eq('id', userId)
    .single();

  if (data?.wallet_address) {
    walletCache.set(userId, data.wallet_address);
    return data.wallet_address;
  }

  return null;
}

async function getMarketTitle(marketId: string, supabaseClient = createServerClient()) {
  if (marketTitleCache.has(marketId)) {
    return marketTitleCache.get(marketId) || null;
  }

  const { data } = await supabaseClient
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

export async function createNotification(
  payload: NotificationPayload,
  supabaseClient = createServerClient()
) {
  const { data, error } = await supabaseClient
    .from('notifications')
    .insert({
      user_id: payload.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message ?? null,
      market_id: payload.marketId ?? null,
      trade_id: payload.tradeId ?? null,
      comment_id: payload.commentId ?? null,
    })
    .select()
    .single();

  if (error) {
    logger.error('notifications', 'Failed to create notification', error);
    return null;
  }

  const walletAddress = await getUserWalletAddress(payload.userId, supabaseClient);
  const marketTitle = payload.marketId
    ? await getMarketTitle(payload.marketId, supabaseClient)
    : null;

  if (walletAddress) {
    await publishMessage('stream:notifications', {
      walletAddress,
      notification: {
        id: data.id,
        type: data.type,
        title: data.title,
        message: data.message,
        marketId: data.market_id,
        marketTitle,
        tradeId: data.trade_id,
        commentId: data.comment_id,
        isRead: data.is_read,
        createdAt: data.created_at,
      },
    });
  }

  return data;
}

export async function createNotificationsForUsers(
  userIds: string[],
  payload: Omit<NotificationPayload, 'userId'>,
  supabaseClient = createServerClient()
) {
  if (userIds.length === 0) return [];

  const inserts = userIds.map((userId) => ({
    user_id: userId,
    type: payload.type,
    title: payload.title,
    message: payload.message ?? null,
    market_id: payload.marketId ?? null,
    trade_id: payload.tradeId ?? null,
    comment_id: payload.commentId ?? null,
  }));

  const { data, error } = await supabaseClient.from('notifications').insert(inserts).select();

  if (error) {
    logger.error('notifications', 'Failed to create notifications', error);
    return [];
  }

  for (const row of data || []) {
    const walletAddress = await getUserWalletAddress(row.user_id, supabaseClient);
    if (!walletAddress) continue;
    const marketTitle = row.market_id
      ? await getMarketTitle(row.market_id, supabaseClient)
      : null;
    await publishMessage('stream:notifications', {
      walletAddress,
      notification: {
        id: row.id,
        type: row.type,
        title: row.title,
        message: row.message,
        marketId: row.market_id,
        marketTitle,
        tradeId: row.trade_id,
        commentId: row.comment_id,
        isRead: row.is_read,
        createdAt: row.created_at,
      },
    });
  }

  return data || [];
}

export async function getMarketParticipantIds(
  marketId: string,
  supabaseClient = createServerClient()
): Promise<string[]> {
  const { data, error } = await supabaseClient
    .from('stakes')
    .select('user_id')
    .eq('market_id', marketId)
    .gt('amount', 0);

  if (error) {
    logger.error('notifications', 'Failed to fetch market participants', error);
    return [];
  }

  const userIds = new Set<string>();
  for (const row of data || []) {
    if (row.user_id) {
      userIds.add(row.user_id);
    }
  }

  return Array.from(userIds);
}
