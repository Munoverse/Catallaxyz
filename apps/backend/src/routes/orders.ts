import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createServerClient } from '../lib/supabase.js';
import { updateLiquidityScoresForMarket } from '@catallaxyz/shared';
import { createErrorResponse, handleDatabaseError, ErrorCode, getHttpStatusCode } from '../lib/error-handler.js';
import { 
  requireAuth, 
  requireSystemAuth,
  AuthError 
} from '../lib/auth-middleware.js';
import { logger } from '../lib/logger.js';

export default async function ordersRoutes(app: FastifyInstance) {
  /**
   * Internal order creation endpoint - used by backend systems (e.g., matching engine persistence)
   * For user-facing order placement, use CLOB API (/clob-api/orders) with L2 API Key auth
   * 
   * This endpoint requires either:
   * - System authentication (ORDER_PATCH_SECRET / CRON_SECRET) for backend-to-backend calls
   * - OR user authentication for direct calls (validates user owns the order)
   */
  app.post('/orders', async (request, reply) => {
    try {
      const supabase = createServerClient();
      const body = request.body as Record<string, any>;
      const {
        marketId,
        marketAddress,
        outcomeType,
        side,
        orderType,
        price,
        amount,
        transactionSignature,
        userId: bodyUserId,  // For system calls, userId can be passed in body
      } = body;

      let resolvedUserId: string;

      // Try system auth first (for backend-to-backend calls)
      try {
        await requireSystemAuth(request);
        // System auth passed - userId must be provided in body
        if (!bodyUserId) {
          return reply.code(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'userId is required for system calls',
            },
          });
        }
        resolvedUserId = bodyUserId;
      } catch {
        // System auth failed - try user auth
        try {
          const authenticatedUser = await requireAuth(request, supabase);
          resolvedUserId = authenticatedUser.userId;
        } catch (authError: any) {
          return reply.code(authError.statusCode || 401).send({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: authError.message || 'Authentication required (system or user)',
            },
          });
        }
      }

      if (
        (!marketId && !marketAddress) ||
        !outcomeType ||
        !side ||
        !orderType ||
        !amount
      ) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message:
              'Missing required fields: marketId/marketAddress, outcomeType, side, orderType, amount',
          },
        });
      }

      if (!['limit', 'market'].includes(orderType)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'orderType must be "limit" or "market"' },
        });
      }

      if (orderType === 'limit' && !price) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Limit orders require a price' },
        });
      }

      let resolvedMarketId = marketId;
      if (!resolvedMarketId && marketAddress) {
        const { data: market, error: marketError } = await supabase
          .from('markets')
          .select('id')
          .eq('solana_market_account', marketAddress)
          .single();
        if (marketError || !market) {
          return reply.code(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Market not found for address' },
          });
        }
        resolvedMarketId = market.id;
      }

      const { data: order, error: insertError } = await supabase
        .from('orders')
        .insert([
          {
            market_id: resolvedMarketId,
            user_id: resolvedUserId,
            outcome_type: outcomeType,
            side,
            order_type: orderType,
            price: price || null,
            amount,
            remaining_amount: amount,
            transaction_signature: transactionSignature || null,
            status: 'open',
          },
        ])
        .select()
        .single();

      if (insertError) {
        logger.error('routes/orders', 'Insert error', insertError);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: 'Failed to create order' },
        });
      }

      if (resolvedMarketId) {
        try {
          await updateLiquidityScoresForMarket(supabase, resolvedMarketId);
        } catch (error) {
          logger.warn('routes/orders', 'Liquidity score update failed', error);
        }
      }

      return reply.send({
        success: true,
        data: {
          id: order.id,
          marketId: order.market_id,
          userId: order.user_id,
          outcomeType: order.outcome_type,
          side: order.side,
          orderType: order.order_type,
          price: order.price,
          amount: order.amount?.toString(),
          filledAmount: order.filled_amount?.toString(),
          remainingAmount: order.remaining_amount?.toString(),
          status: order.status,
          transactionSignature: order.transaction_signature,
          createdAt: order.created_at,
        },
      });
    } catch (error: any) {
      // SECURITY: Use safe error handler to prevent leaking internal details
      const errorResponse = createErrorResponse(
        ErrorCode.SERVER_ERROR,
        'Failed to create order',
        error
      );
      return reply.code(getHttpStatusCode(ErrorCode.SERVER_ERROR)).send(errorResponse);
    }
  });

  app.get('/orders', async (request, reply) => {
    try {
      const query = request.query as Record<string, string | undefined>;
      const marketId = query.marketId;
      const userId = query.userId;
      const status = query.status;
      // AUDIT FIX B-H4: Validate and limit pagination parameters
      const MAX_LIMIT = 100;
      const requestedLimit = parseInt(query.limit || '50', 10);
      const limit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT);
      const offset = Math.max(0, parseInt(query.offset || '0', 10));

      const supabase = createServerClient();

      let dbQuery = supabase
        .from('orders')
        .select('*, users!inner(username, wallet_address)')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (marketId) {
        dbQuery = dbQuery.eq('market_id', marketId);
      }

      if (userId) {
        dbQuery = dbQuery.eq('user_id', userId);
      }

      if (status) {
        dbQuery = dbQuery.eq('status', status);
      }

      const { data: orders, error } = await dbQuery;

      if (error) {
        const errorResponse = createErrorResponse(
          ErrorCode.SERVER_ERROR,
          'Failed to fetch orders',
          error
        );
        return reply.code(getHttpStatusCode(ErrorCode.SERVER_ERROR)).send(errorResponse);
      }

      return reply.send({
        success: true,
        data: {
          orders: (orders || []).map((order: any) => ({
            id: order.id,
            marketId: order.market_id,
            userId: order.user_id,
            username: order.users?.username,
            questionIndex: order.question_index,
            outcomeType: order.outcome_type,
            side: order.side,
            orderType: order.order_type,
            price: order.price,
            amount: order.amount?.toString(),
            filledAmount: order.filled_amount?.toString(),
            remainingAmount: order.remaining_amount?.toString(),
            status: order.status,
            transactionSignature: order.transaction_signature,
            createdAt: order.created_at,
            updatedAt: order.updated_at,
          })),
          pagination: {
            limit,
            offset,
            hasMore: orders && orders.length === limit,
          },
        },
      });
    } catch (error: any) {
      const errorResponse = createErrorResponse(
        ErrorCode.SERVER_ERROR,
        'Failed to fetch orders',
        error
      );
      return reply.code(getHttpStatusCode(ErrorCode.SERVER_ERROR)).send(errorResponse);
    }
  });

  app.get('/orders/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      if (!id) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Order ID is required' },
        });
      }

      const supabase = createServerClient();

      const { data: order, error } = await supabase
        .from('orders')
        .select('*, users!inner(username, wallet_address), markets!inner(title)')
        .eq('id', id)
        .single();

      if (error || !order) {
        const errorResponse = createErrorResponse(
          ErrorCode.NOT_FOUND,
          'Order not found',
          error
        );
        return reply.code(getHttpStatusCode(ErrorCode.NOT_FOUND)).send(errorResponse);
      }

      return reply.send({
        success: true,
        data: {
          id: order.id,
          marketId: order.market_id,
          marketTitle: order.markets?.title,
          userId: order.user_id,
          username: order.users?.username,
          questionIndex: order.question_index,
          outcomeType: order.outcome_type,
          side: order.side,
          orderType: order.order_type,
          price: order.price,
          amount: order.amount?.toString(),
          filledAmount: order.filled_amount?.toString(),
          remainingAmount: order.remaining_amount?.toString(),
          makerFee: order.maker_fee?.toString(),
          takerFee: order.taker_fee?.toString(),
          status: order.status,
          transactionSignature: order.transaction_signature,
          slot: order.slot,
          createdAt: order.created_at,
          updatedAt: order.updated_at,
          filledAt: order.filled_at,
          cancelledAt: order.cancelled_at,
        },
      });
    } catch (error: any) {
      const errorResponse = createErrorResponse(
        ErrorCode.SERVER_ERROR,
        'Failed to fetch order',
        error
      );
      return reply.code(getHttpStatusCode(ErrorCode.SERVER_ERROR)).send(errorResponse);
    }
  });

  app.patch('/orders/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;
      const { status, filledAmount, transactionSignature } = body;

      if (!id) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Order ID is required' },
        });
      }

      let isSystemRequest = false;
      try {
        await requireSystemAuth(request);
        isSystemRequest = true;
      } catch {
        isSystemRequest = false;
      }

      const supabase = createServerClient();

      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !order) {
        const errorResponse = createErrorResponse(
          ErrorCode.NOT_FOUND,
          'Order not found',
          fetchError
        );
        return reply.code(getHttpStatusCode(ErrorCode.NOT_FOUND)).send(errorResponse);
      }

      if (!isSystemRequest) {
        try {
          const authenticatedUser = await requireAuth(request, supabase);
          if (order.user_id !== authenticatedUser.userId) {
            return reply.code(403).send({
              success: false,
              error: { code: 'FORBIDDEN', message: 'You can only update your own orders' },
            });
          }
        } catch (authError: any) {
          return reply.code(authError.statusCode || 401).send({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: authError.message || 'Authentication required (system or user)',
            },
          });
        }
      }

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (status) {
        updateData.status = status;

        if (status === 'filled') {
          updateData.filled_at = new Date().toISOString();
        } else if (status === 'cancelled') {
          updateData.cancelled_at = new Date().toISOString();
        }
      }

      if (filledAmount !== undefined) {
        const filled = BigInt(filledAmount);
        const total = BigInt(order.amount);
        const remaining = total - filled;

        updateData.filled_amount = filledAmount;
        updateData.remaining_amount = remaining.toString();

        if (remaining === 0n) {
          updateData.status = 'filled';
          updateData.filled_at = new Date().toISOString();
        } else if (filled > 0n) {
          updateData.status = 'partial';
        }
      }

      if (transactionSignature) {
        updateData.transaction_signature = transactionSignature;
      }

      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        const errorResponse = handleDatabaseError(updateError, 'update order');
        return reply.code(getHttpStatusCode(errorResponse.error.code)).send(errorResponse);
      }

      try {
        await updateLiquidityScoresForMarket(supabase, order.market_id);
      } catch (error) {
        logger.warn('routes/orders', 'Liquidity score update failed', error);
      }

      return reply.send({
        success: true,
        data: {
          id: updatedOrder.id,
          status: updatedOrder.status,
          filledAmount: updatedOrder.filled_amount?.toString(),
          remainingAmount: updatedOrder.remaining_amount?.toString(),
          transactionSignature: updatedOrder.transaction_signature,
          updatedAt: updatedOrder.updated_at,
          filledAt: updatedOrder.filled_at,
          cancelledAt: updatedOrder.cancelled_at,
        },
      });
    } catch (error: any) {
      const errorResponse = createErrorResponse(
        ErrorCode.SERVER_ERROR,
        'Failed to update order',
        error
      );
      return reply.code(getHttpStatusCode(ErrorCode.SERVER_ERROR)).send(errorResponse);
    }
  });

  app.delete('/orders/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      if (!id) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Order ID is required' },
        });
      }

      const supabase = createServerClient();

      // ============================================
      // SECURITY FIX: Require authentication and verify ownership
      // Previously: userId came from query param and could be omitted to bypass auth
      // Now: userId is obtained from authenticated session
      // ============================================
      let authenticatedUser: { userId: string; walletAddress: string };
      try {
        authenticatedUser = await requireAuth(request, supabase);
      } catch (authError: any) {
        return reply.code(authError.statusCode || 401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: authError.message || 'Authentication required',
          },
        });
      }

      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !order) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Order not found' },
        });
      }

      // SECURITY: Always verify ownership using authenticated user ID
      if (order.user_id !== authenticatedUser.userId) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You can only cancel your own orders' },
        });
      }

      if (order.status === 'filled' || order.status === 'cancelled') {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Cannot cancel order with status: ${order.status}`,
          },
        });
      }

      const { data: cancelledOrder, error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        logger.error('routes/orders', 'Delete order update error', updateError);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: 'Failed to cancel order' },
        });
      }

      try {
        await updateLiquidityScoresForMarket(supabase, order.market_id);
      } catch (error) {
        logger.warn('routes/orders', 'Liquidity score update failed', error);
      }

      return reply.send({
        success: true,
        data: {
          id: cancelledOrder.id,
          status: cancelledOrder.status,
          cancelledAt: cancelledOrder.cancelled_at,
        },
      });
    } catch (error: any) {
      logger.error('routes/orders', 'Delete order unexpected error', error);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Internal server error',
        },
      });
    }
  });

  app.post('/orders/cancel', async (request, reply) => {
    try {
      const body = request.body as Record<string, any>;
      const { orderId, clientOrderId, marketAddress, walletAddress } = body;

      if (!orderId && (!marketAddress || !clientOrderId)) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Missing required fields: orderId or (marketAddress + clientOrderId)',
          },
        });
      }

      const supabase = createServerClient();

      try {
        await requireSystemAuth(request);
      } catch (authError: any) {
        const errorResponse = createErrorResponse(
          ErrorCode.UNAUTHORIZED,
          authError.message || 'Authentication required',
          authError
        );
        return reply.code(getHttpStatusCode(ErrorCode.UNAUTHORIZED)).send(errorResponse);
      }

      if (!walletAddress) {
        const errorResponse = createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          'Missing required field: walletAddress'
        );
        return reply.code(getHttpStatusCode(ErrorCode.VALIDATION_ERROR)).send(errorResponse);
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', walletAddress)
        .single();

      if (userError || !user) {
        const errorResponse = createErrorResponse(
          ErrorCode.NOT_FOUND,
          'User not found',
          userError
        );
        return reply.code(getHttpStatusCode(ErrorCode.NOT_FOUND)).send(errorResponse);
      }

      let updatedOrder;
      let updateError;

      if (orderId) {
        const result = await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)
          .eq('user_id', user.id)
          .select()
          .single();
        updatedOrder = result.data;
        updateError = result.error;
      } else {
        const { data: market, error: marketError } = await supabase
          .from('markets')
          .select('id')
          .eq('solana_market_account', marketAddress)
          .single();

        if (marketError || !market) {
          const errorResponse = createErrorResponse(
            ErrorCode.NOT_FOUND,
            'Market not found',
            marketError
          );
          return reply.code(getHttpStatusCode(ErrorCode.NOT_FOUND)).send(errorResponse);
        }

        const result = await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('market_id', market.id)
          .eq('user_id', user.id)
          .eq('client_order_id', clientOrderId)
          .select()
          .single();
        updatedOrder = result.data;
        updateError = result.error;
      }

      if (updateError || !updatedOrder) {
        const errorResponse = updateError
          ? handleDatabaseError(updateError, 'cancel order')
          : createErrorResponse(ErrorCode.NOT_FOUND, 'Order not found');
        return reply.code(getHttpStatusCode(errorResponse.error.code)).send(errorResponse);
      }

      try {
        await updateLiquidityScoresForMarket(supabase, updatedOrder.market_id);
      } catch (error) {
        logger.warn('routes/orders', 'Liquidity score update failed', error);
      }

      return reply.send({ success: true, data: { id: updatedOrder.id } });
    } catch (error: any) {
      const errorResponse = createErrorResponse(
        ErrorCode.SERVER_ERROR,
        'Failed to cancel order',
        error
      );
      return reply.code(getHttpStatusCode(ErrorCode.SERVER_ERROR)).send(errorResponse);
    }
  });

  app.post('/orders/cancel-all', async (request, reply) => {
    try {
      const body = request.body as Record<string, any>;
      const { marketAddress, walletAddress } = body;

      if (!marketAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' },
        });
      }

      const supabase = createServerClient();

      try {
        await requireSystemAuth(request);
      } catch (authError: any) {
        const errorResponse = createErrorResponse(
          ErrorCode.UNAUTHORIZED,
          authError.message || 'Authentication required',
          authError
        );
        return reply.code(getHttpStatusCode(ErrorCode.UNAUTHORIZED)).send(errorResponse);
      }

      if (!walletAddress) {
        const errorResponse = createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          'Missing required field: walletAddress'
        );
        return reply.code(getHttpStatusCode(ErrorCode.VALIDATION_ERROR)).send(errorResponse);
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', walletAddress)
        .single();

      if (userError || !user) {
        const errorResponse = createErrorResponse(
          ErrorCode.NOT_FOUND,
          'User not found',
          userError
        );
        return reply.code(getHttpStatusCode(ErrorCode.NOT_FOUND)).send(errorResponse);
      }

      const { data: market, error: marketError } = await supabase
        .from('markets')
        .select('id')
        .eq('solana_market_account', marketAddress)
        .single();

      if (marketError || !market) {
        const errorResponse = createErrorResponse(
          ErrorCode.NOT_FOUND,
          'Market not found',
          marketError
        );
        return reply.code(getHttpStatusCode(ErrorCode.NOT_FOUND)).send(errorResponse);
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('market_id', market.id)
        .eq('user_id', user.id)
        .in('status', ['open', 'partial']);

      if (updateError) {
        const errorResponse = handleDatabaseError(updateError, 'cancel all orders');
        return reply.code(getHttpStatusCode(errorResponse.error.code)).send(errorResponse);
      }

      try {
        await updateLiquidityScoresForMarket(supabase, market.id);
      } catch (error) {
        logger.warn('routes/orders', 'Liquidity score update failed', error);
      }

      return reply.send({ success: true });
    } catch (error: any) {
      const errorResponse = createErrorResponse(
        ErrorCode.SERVER_ERROR,
        'Failed to cancel orders',
        error
      );
      return reply.code(getHttpStatusCode(ErrorCode.SERVER_ERROR)).send(errorResponse);
    }
  });
}
