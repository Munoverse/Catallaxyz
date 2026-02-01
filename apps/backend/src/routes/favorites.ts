import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createServerClient } from '../lib/supabase.js';
import { 
  requireAuth, 
  verifyWalletMatch, 
  sendAuthError, 
  AuthError 
} from '../lib/auth-middleware.js';
import { logger } from '../lib/logger.js';
import { handleRouteError, handleDatabaseError } from '../lib/error-handler.js';

export default async function favoritesRoutes(app: FastifyInstance) {
  // AUDIT FIX B-01: Require authentication for favorites query
  // Users can only view their own favorites
  app.get('/favorites', async (request, reply) => {
    try {
      const supabase = createServerClient();
      
      // Require authentication - users can only view their own favorites
      let user;
      try {
        user = await requireAuth(request, supabase);
      } catch (error) {
        sendAuthError(reply, error as AuthError);
        return;
      }

      // Optional: allow query param for backwards compatibility, but verify it matches auth
      const query = request.query as Record<string, string | undefined>;
      const walletAddress = query.walletAddress;
      if (walletAddress && walletAddress !== user.walletAddress) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Can only view your own favorites' },
        });
      }

      const { data: favorites, error } = await supabase
        .from('user_favorites')
        .select(
          `
          market_id,
          created_at,
          market:market_id (
            id,
            title,
            question,
            status,
            category,
            tip_amount,
            total_volume,
            participants_count,
            created_at
          )
        `
        )
        .eq('user_id', user.userId)
        .order('created_at', { ascending: false });

      if (error) {
        const errorResponse = handleDatabaseError(error, 'fetch favorites');
        return reply.code(500).send(errorResponse);
      }

      return reply.send({
        success: true,
        data: {
          favorites: (favorites || []).map((row: any) => ({
            marketId: row.market_id,
            createdAt: row.created_at,
            market: row.market,
          })),
        },
      });
    } catch (error: any) {
      handleRouteError(reply, error, 'Failed to fetch favorites');
      return;
    }
  });

  app.post('/favorites', async (request, reply) => {
    try {
      const body = request.body as Record<string, any>;
      const { walletAddress, marketId } = body;

      if (!marketId) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'marketId is required' },
        });
      }

      const supabase = createServerClient();
      
      // Use unified auth middleware
      let user;
      try {
        user = await requireAuth(request, supabase);
        // Verify wallet address matches if provided
        if (walletAddress) {
          verifyWalletMatch(user, walletAddress);
        }
      } catch (error) {
        sendAuthError(reply, error as AuthError);
        return;
      }

      const { data, error } = await supabase
        .from('user_favorites')
        .insert({ user_id: user.userId, market_id: marketId })
        .select('id')
        .single();

      if (error) {
        if ((error as any).code === '23505') {
          return reply.send({ success: true, data: { alreadyFavorite: true } });
        }
        const errorResponse = handleDatabaseError(error, 'add favorite');
        return reply.code(500).send(errorResponse);
      }

      return reply.send({ success: true, data: { id: data?.id } });
    } catch (error: any) {
      handleRouteError(reply, error, 'Failed to add favorite');
      return;
    }
  });

  app.delete('/favorites', async (request, reply) => {
    try {
      const body = request.body as Record<string, any>;
      const { walletAddress, marketId } = body;

      if (!marketId) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'marketId is required' },
        });
      }

      const supabase = createServerClient();
      
      // Use unified auth middleware
      let user;
      try {
        user = await requireAuth(request, supabase);
        // Verify wallet address matches if provided
        if (walletAddress) {
          verifyWalletMatch(user, walletAddress);
        }
      } catch (error) {
        sendAuthError(reply, error as AuthError);
        return;
      }

      const { error } = await supabase
        .from('user_favorites')
        .delete()
        .eq('user_id', user.userId)
        .eq('market_id', marketId);

      if (error) {
        const errorResponse = handleDatabaseError(error, 'delete favorite');
        return reply.code(500).send(errorResponse);
      }

      return reply.send({ success: true });
    } catch (error: any) {
      handleRouteError(reply, error, 'Failed to delete favorite');
      return;
    }
  });
}
