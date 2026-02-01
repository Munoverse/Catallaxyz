/**
 * Orders Routes for CLOB API
 * Order placement, cancellation, and management
 * All matching happens in Redis via Lua scripts
 */

import type { FastifyInstance } from 'fastify';
import { requireL2Auth } from './auth.js';
import { placeOrder, cancelOrder, cancelAllOrders, getOrderStatus } from '../../lib/redis/matching.js';
import { createServerClient } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

export default async function ordersRoutes(app: FastifyInstance) {
  // Place a new order
  app.post('/', async (request, reply) => {
    try {
      const apiKeyRow = await requireL2Auth(request);
      const body = request.body as Record<string, any>;
      const {
        marketId,
        outcomeType,
        side,
        orderType,
        price,
        amount,
        clientOrderId,
        timeInForce = 'GTC', // GTC, IOC, FOK
      } = body;

      if (!marketId || !outcomeType || !side || !orderType || !amount) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' },
        });
      }

      if (!['yes', 'no'].includes(outcomeType)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'outcomeType must be "yes" or "no"' },
        });
      }

      if (!['buy', 'sell'].includes(side)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'side must be "buy" or "sell"' },
        });
      }

      if (!['limit', 'market'].includes(orderType)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'orderType must be "limit" or "market"' },
        });
      }

      if (orderType === 'limit' && (price === undefined || price === null)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Limit orders require a price' },
        });
      }

      if (orderType === 'limit' && (price < 0 || price > 1)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Price must be between 0 and 1' },
        });
      }

      // Place order via Redis matching engine
      const result = await placeOrder({
        userId: apiKeyRow.user_id,
        walletAddress: apiKeyRow.wallet_address,
        marketId,
        outcomeType,
        side,
        orderType,
        price: price ?? 0,
        amount: BigInt(amount),
        clientOrderId,
        timeInForce,
      });

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: { code: 'ORDER_REJECTED', message: result.error || 'Order rejected' },
        });
      }

      return reply.send({
        success: true,
        data: {
          orderId: result.orderId,
          status: result.status,
          filledAmount: result.filledAmount?.toString(),
          remainingAmount: result.remainingAmount?.toString(),
          fills: result.fills?.map((f: any) => ({
            price: f.price,
            size: f.size.toString(),
            timestamp: f.timestamp,
          })),
        },
      });
    } catch (error: any) {
      logger.error('clob-orders', 'POST /orders error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Internal error' },
      });
    }
  });

  // Cancel an order
  app.delete('/:orderId', async (request, reply) => {
    try {
      const apiKeyRow = await requireL2Auth(request);
      const { orderId } = request.params as { orderId: string };

      const result = await cancelOrder({
        orderId,
        userId: apiKeyRow.user_id,
      });

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: { code: 'CANCEL_FAILED', message: result.error || 'Cancel failed' },
        });
      }

      return reply.send({
        success: true,
        data: {
          orderId,
          status: 'cancelled',
          unlockedAmount: result.unlockedAmount?.toString(),
        },
      });
    } catch (error: any) {
      logger.error('clob-orders', 'DELETE /orders/:orderId error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Internal error' },
      });
    }
  });

  // Cancel all orders for a market
  app.post('/cancel-all', async (request, reply) => {
    try {
      const apiKeyRow = await requireL2Auth(request);
      const body = request.body as Record<string, any>;
      const { marketId, outcomeType } = body;

      if (!marketId) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'marketId is required' },
        });
      }

      const result = await cancelAllOrders({
        userId: apiKeyRow.user_id,
        marketId,
        outcomeType,
      });

      return reply.send({
        success: true,
        data: {
          cancelledCount: result.cancelledCount,
          totalUnlocked: result.totalUnlocked?.toString(),
        },
      });
    } catch (error: any) {
      logger.error('clob-orders', 'POST /orders/cancel-all error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Internal error' },
      });
    }
  });

  // Get order status
  app.get('/:orderId', async (request, reply) => {
    try {
      const apiKeyRow = await requireL2Auth(request);
      const { orderId } = request.params as { orderId: string };

      const result = await getOrderStatus(orderId);

      if (!result) {
        // Fallback to Postgres for historical orders
        const supabase = createServerClient();
        const orderFields = 'id, market_id, user_id, outcome_type, side, order_type, price, amount, filled_amount, remaining_amount, status, created_at';
        const { data: order } = await supabase
          .from('orders')
          .select(orderFields)
          .eq('id', orderId)
          .eq('user_id', apiKeyRow.user_id)
          .single();

        if (!order) {
          return reply.code(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Order not found' },
          });
        }

        return reply.send({
          success: true,
          data: {
            orderId: order.id,
            marketId: order.market_id,
            outcomeType: order.outcome_type,
            side: order.side,
            orderType: order.order_type,
            price: order.price,
            amount: order.amount?.toString(),
            filledAmount: order.filled_amount?.toString(),
            remainingAmount: order.remaining_amount?.toString(),
            status: order.status,
            createdAt: order.created_at,
            source: 'postgres',
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          ...result,
          source: 'redis',
        },
      });
    } catch (error: any) {
      logger.error('clob-orders', 'GET /orders/:orderId error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Internal error' },
      });
    }
  });

  // Get all open orders for user
  app.get('/', async (request, reply) => {
    try {
      const apiKeyRow = await requireL2Auth(request);
      const query = request.query as Record<string, string | undefined>;
      const marketId = query.marketId;
      const status = query.status || 'open';

      // For open orders, check Redis first
      // For historical, use Postgres
      const supabase = createServerClient();
      const orderFields = 'id, market_id, user_id, outcome_type, side, order_type, price, amount, filled_amount, remaining_amount, status, client_order_id, created_at, updated_at';
      let dbQuery = supabase
        .from('orders')
        .select(orderFields)
        .eq('user_id', apiKeyRow.user_id)
        .order('created_at', { ascending: false });

      if (marketId) {
        dbQuery = dbQuery.eq('market_id', marketId);
      }

      if (status === 'open') {
        dbQuery = dbQuery.in('status', ['open', 'partial']);
      } else if (status !== 'all') {
        dbQuery = dbQuery.eq('status', status);
      }

      const { data, error } = await dbQuery;

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      return reply.send({
        success: true,
        data: (data || []).map((o: any) => ({
          orderId: o.id,
          marketId: o.market_id,
          outcomeType: o.outcome_type,
          side: o.side,
          orderType: o.order_type,
          price: o.price,
          amount: o.amount?.toString(),
          filledAmount: o.filled_amount?.toString(),
          remainingAmount: o.remaining_amount?.toString(),
          status: o.status,
          createdAt: o.created_at,
        })),
      });
    } catch (error: any) {
      logger.error('clob-orders', 'GET /orders error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Internal error' },
      });
    }
  });
}
