import type { FastifyInstance } from 'fastify';
import { createServerClient } from '../lib/supabase.js';
import { buildCacheKey, getCache, setCache, clearCachePrefix } from '../lib/cache.js';
import { getAuthContext } from '../lib/auth.js';
import { isValidSolanaAddress } from '../lib/solana.js';
import { logger } from '../lib/logger.js';

const NOTIFICATIONS_CACHE_TTL_MS = 10_000;

export default async function notificationsRoutes(app: FastifyInstance) {
  app.get('/notifications', async (request, reply) => {
    try {
      const query = request.query as Record<string, string | undefined>;
      const walletAddress = query.walletAddress;
      const limit = parseInt(query.limit || '20', 10);
      const offset = parseInt(query.offset || '0', 10);

      if (!walletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'walletAddress is required' },
        });
      }
      if (!isValidSolanaAddress(walletAddress)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid wallet address' },
        });
      }

      const supabase = createServerClient();

      // SECURITY FIX: Require authentication and verify wallet ownership
      const auth = await getAuthContext({ request, supabase });
      if (auth.walletAddress !== walletAddress) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Wallet address mismatch' },
        });
      }

      const cacheKey = buildCacheKey('notifications:list', { walletAddress, limit, offset });
      const cached = getCache(cacheKey);
      if (cached) {
        return reply.send(cached);
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', walletAddress)
        .single();

      if (userError || !user) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      const { data: notifications, error } = await supabase
        .from('notifications')
        .select(
          `
          id,
          type,
          title,
          message,
          market_id,
          trade_id,
          comment_id,
          is_read,
          created_at,
          markets:market_id (
            id,
            title
          )
        `
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      const { count: unreadCount } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      const response = {
        success: true,
        data: {
          notifications: (notifications || []).map((n: any) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            marketId: n.market_id,
            marketTitle: n.markets?.title || null,
            tradeId: n.trade_id,
            commentId: n.comment_id,
            isRead: n.is_read,
            createdAt: n.created_at,
          })),
          unreadCount: unreadCount || 0,
          pagination: {
            limit,
            offset,
            hasMore: notifications && notifications.length === limit,
          },
        },
      };

      setCache(cacheKey, response, NOTIFICATIONS_CACHE_TTL_MS);
      return reply.send(response);
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: error.message || 'Authentication required' },
        });
      }
      logger.error('notifications', 'Error in GET /api/notifications', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Internal error' },
      });
    }
  });

  app.post('/notifications/mark-read', async (request, reply) => {
    try {
      const body = request.body as Record<string, any>;
      const { walletAddress, notificationIds } = body;

      if (!walletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'walletAddress is required' },
        });
      }

      const supabase = createServerClient();

      // SECURITY FIX: Require authentication and verify wallet ownership
      const auth = await getAuthContext({ request, supabase });
      if (auth.walletAddress !== walletAddress) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Wallet address mismatch' },
        });
      }

      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', auth.walletAddress)
        .single();
      const userId = userData?.id || null;

      if (!userId) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      const user = { id: userId };

      let updateQuery = supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id);

      if (Array.isArray(notificationIds) && notificationIds.length > 0) {
        updateQuery = updateQuery.in('id', notificationIds);
      }

      const { error: updateError } = await updateQuery;

      if (updateError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: updateError.message },
        });
      }

      clearCachePrefix('notifications:list');
      return reply.send({ success: true });
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: error.message || 'Authentication required' },
        });
      }
      logger.error('notifications', 'Error in POST /api/notifications/mark-read', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Internal error' },
      });
    }
  });
}
