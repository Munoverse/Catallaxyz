import type { FastifyInstance } from 'fastify';
import { createServerClient } from '../lib/supabase.js';
import {
  requireAuth,
  sendAuthError,
  verifyWalletMatch,
  AuthError,
  type AuthenticatedUser,
} from '../lib/auth-middleware.js';
import { logger } from '../lib/logger.js';
import { sanitizeComment } from '../lib/sanitize.js';
import { createErrorResponse, handleDatabaseError, ErrorCode, getHttpStatusCode } from '../lib/error-handler.js';

export default async function commentsRoutes(app: FastifyInstance) {
  app.get('/comments', async (request, reply) => {
    try {
      const supabase = createServerClient();
      const query = request.query as Record<string, string | undefined>;
      const marketId = query.market_id;
      const sort = query.sort || 'time';
      const order = query.order || 'desc';

      if (!marketId) {
        return reply.code(400).send({ error: 'market_id is required' });
      }

      let queryBuilder = supabase
        .from('comments')
        .select(
          `
        *,
        user:user_id (
          id,
          wallet_address,
          username,
          avatar_url
        )
      `
        )
        .eq('market_id', marketId);

      if (sort === 'tip') {
        queryBuilder = queryBuilder
          .order('tip_amount', { ascending: false })
          .order('created_at', { ascending: false });
      } else {
        queryBuilder = queryBuilder.order('created_at', { ascending: order === 'asc' });
      }

      const { data, error } = await queryBuilder;

      if (error) {
        // AUDIT FIX B-H2: Use safe error handler to prevent leaking internal details
        const errorResponse = handleDatabaseError(error, 'fetch comments');
        return reply.code(getHttpStatusCode(errorResponse.error.code)).send(errorResponse);
      }

      return reply.send({ comments: data || [] });
    } catch (error: any) {
      logger.error('comments', 'Failed to fetch comments', error);
      return reply.code(500).send({ error: 'Failed to fetch comments' });
    }
  });

  app.post('/comments', async (request, reply) => {
    try {
      const supabase = createServerClient();
      
      // AUDIT FIX B-32: Use unified auth middleware
      let user: AuthenticatedUser;
      try {
        user = await requireAuth(request, supabase);
      } catch (error) {
        sendAuthError(reply, error as AuthError);
        return;
      }

      const body = request.body as Record<string, any>;

      if (!body.market_id || !body.content) {
        return reply.code(400).send({ error: 'market_id and content are required' });
      }

      // AUDIT FIX B-H1: Sanitize comment content to prevent XSS
      const sanitizedContent = sanitizeComment(body.content);
      
      // Validate content length after sanitization
      if (sanitizedContent.length === 0) {
        return reply.code(400).send({ 
          error: 'Comment content cannot be empty after sanitization' 
        });
      }
      if (sanitizedContent.length > 5000) {
        return reply.code(400).send({ 
          error: 'Comment content exceeds maximum length of 5000 characters' 
        });
      }

      const { data, error } = await supabase
        .from('comments')
        .insert([
          {
            user_id: user.userId,
            market_id: body.market_id,
            parent_id: body.parent_id || null,
            content: sanitizedContent,
          },
        ])
        .select()
        .single();

      if (error) {
        return reply.code(500).send({ error: error.message });
      }

      return reply.send({ comment: data });
    } catch (error: any) {
      logger.error('comments', 'Failed to create comment', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  app.patch('/comments/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;
      const supabase = createServerClient();

      const { content, walletAddress } = body;

      // AUDIT FIX B-32: Use unified auth middleware
      let user: AuthenticatedUser;
      try {
        user = await requireAuth(request, supabase);
        verifyWalletMatch(user, walletAddress);
      } catch (error) {
        sendAuthError(reply, error as AuthError);
        return;
      }

      if (!content) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'content is required' },
        });
      }

      if (content.length === 0 || content.length > 2000) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Content must be between 1 and 2000 characters',
          },
        });
      }

      const { data: comment } = await supabase
        .from('comments')
        .select('user_id')
        .eq('id', id)
        .single();

      if (!comment) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Comment not found' },
        });
      }

      if (comment.user_id !== user.userId) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not authorized to edit this comment' },
        });
      }

      const { data: updatedComment, error: updateError } = await supabase
        .from('comments')
        .update({ content })
        .eq('id', id)
        .select(
          `
        *,
        user:user_id (
          id,
          wallet_address,
          username,
          avatar_url
        )
      `
        )
        .single();

      if (updateError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: updateError.message },
        });
      }

      return reply.send({ success: true, data: updatedComment });
    } catch (error: any) {
      logger.error('comments', 'Failed to update comment', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.delete('/comments/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, string | undefined>;
      const walletAddress = query.walletAddress;
      const supabase = createServerClient();

      // AUDIT FIX B-32: Use unified auth middleware
      let user: AuthenticatedUser;
      try {
        user = await requireAuth(request, supabase);
        verifyWalletMatch(user, walletAddress);
      } catch (error) {
        sendAuthError(reply, error as AuthError);
        return;
      }

      const { data: comment } = await supabase
        .from('comments')
        .select('user_id')
        .eq('id', id)
        .single();

      if (!comment) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Comment not found' },
        });
      }

      if (comment.user_id !== user.userId) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not authorized to delete this comment' },
        });
      }

      const { error: deleteError } = await supabase.from('comments').delete().eq('id', id);

      if (deleteError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: deleteError.message },
        });
      }

      return reply.send({
        success: true,
        data: { message: 'Comment deleted successfully' },
      });
    } catch (error: any) {
      logger.error('comments', 'Failed to delete comment', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.post('/comments/:id/like', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const supabase = createServerClient();

      // AUDIT FIX B-32: Use unified auth middleware
      let user: AuthenticatedUser;
      try {
        user = await requireAuth(request, supabase);
      } catch (error) {
        sendAuthError(reply, error as AuthError);
        return;
      }

      const { data: comment } = await supabase
        .from('comments')
        .select('id, likes_count')
        .eq('id', id)
        .single();

      if (!comment) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Comment not found' },
        });
      }

      const { data: existingLike } = await supabase
        .from('comment_likes')
        .select('id')
        .eq('comment_id', id)
        .eq('user_id', user.userId)
        .single();

      if (existingLike) {
        return reply.send({
          success: true,
          data: { message: 'Already liked', alreadyLiked: true },
        });
      }

      // AUDIT FIX v1.2.9 [B-17]: Use atomic increment and handle failures gracefully
      // Insert like first
      const { error: likeError } = await supabase.from('comment_likes').insert([
        {
          comment_id: id,
          user_id: user.userId,
        },
      ]);

      if (likeError) {
        // Check for duplicate constraint violation (concurrent like attempt)
        if (likeError.code === '23505') {
          return reply.send({
            success: true,
            data: { message: 'Already liked', alreadyLiked: true },
          });
        }
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: likeError.message },
        });
      }

      // Use atomic SQL increment to avoid race conditions
      const { data: updatedComment, error: updateError } = await supabase
        .rpc('increment_comment_likes', { comment_id: id });

      // Fallback to direct update if RPC doesn't exist
      if (updateError && updateError.code === 'PGRST202') {
        // RPC function not found, use direct update (less safe but works)
        const { data: fallbackUpdate, error: fallbackError } = await supabase
          .from('comments')
          .update({ likes_count: (comment.likes_count || 0) + 1 })
          .eq('id', id)
          .select()
          .single();
        
        if (fallbackError) {
          // Rollback the like insert on failure
          await supabase.from('comment_likes').delete().eq('comment_id', id).eq('user_id', user.userId);
          return reply.code(500).send({
            success: false,
            error: { code: 'SERVER_ERROR', message: fallbackError.message },
          });
        }
        
        return reply.send({
          success: true,
          data: {
            message: 'Comment liked successfully',
            likes_count: fallbackUpdate.likes_count,
          },
        });
      }

      if (updateError) {
        // Rollback the like insert on failure
        await supabase.from('comment_likes').delete().eq('comment_id', id).eq('user_id', user.userId);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: updateError.message },
        });
      }

      return reply.send({
        success: true,
        data: {
          message: 'Comment liked successfully',
          likes_count: updatedComment.likes_count,
        },
      });
    } catch (error: any) {
      logger.error('comments', 'Failed to like comment', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.delete('/comments/:id/like', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, string | undefined>;
      const walletAddress = query.walletAddress;
      const supabase = createServerClient();

      // AUDIT FIX B-32: Use unified auth middleware
      let user: AuthenticatedUser;
      try {
        user = await requireAuth(request, supabase);
        verifyWalletMatch(user, walletAddress);
      } catch (error) {
        sendAuthError(reply, error as AuthError);
        return;
      }

      const { data: comment } = await supabase
        .from('comments')
        .select('id, likes_count')
        .eq('id', id)
        .single();

      if (!comment) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Comment not found' },
        });
      }

      const { error: deleteError } = await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', id)
        .eq('user_id', user.userId);

      if (deleteError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: deleteError.message },
        });
      }

      // AUDIT FIX B-02: Use atomic decrement to avoid race conditions
      // Use the database RPC function instead of direct update
      const { data: updatedComment, error: updateError } = await supabase
        .rpc('decrement_comment_likes', { comment_id: id });

      // Fallback to direct update if RPC doesn't exist
      if (updateError && updateError.code === 'PGRST202') {
        // RPC function not found, use direct update with Math.max for safety
        const { data: fallbackUpdate, error: fallbackError } = await supabase
          .from('comments')
          .update({ likes_count: Math.max((comment.likes_count || 0) - 1, 0) })
          .eq('id', id)
          .select()
          .single();
        
        if (fallbackError) {
          logger.error('comments', 'Failed to decrement likes count', fallbackError);
          return reply.code(500).send({
            success: false,
            error: { code: 'SERVER_ERROR', message: 'Failed to update likes count' },
          });
        }
        
        return reply.send({
          success: true,
          data: {
            message: 'Like removed successfully',
            likes_count: fallbackUpdate.likes_count,
          },
        });
      }

      if (updateError) {
        logger.error('comments', 'Failed to decrement likes count', updateError);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: 'Failed to update likes count' },
        });
      }

      return reply.send({
        success: true,
        data: {
          message: 'Like removed successfully',
          likes_count: updatedComment?.likes_count ?? Math.max((comment.likes_count || 0) - 1, 0),
        },
      });
    } catch (error: any) {
      logger.error('comments', 'Failed to unlike comment', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });
}
