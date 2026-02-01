/**
 * Exchange Orders Routes (Polymarket-style)
 * 
 * Routes for signed orders with atomic swap settlement.
 * These routes complement the existing CLOB routes and can be used
 * when trustless on-chain settlement is required.
 * 
 * EXCHANGE INTEGRATION: Now stores orders in Redis for matching and auto-settlement.
 */

import type { FastifyInstance } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import { requireL2Auth } from './auth.js';
import { 
  type Order, 
  type SignedOrder, 
  hashOrder, 
  validateOrder, 
  isOrderExpired,
  calculateOrderPrice,
} from '../../lib/exchange-types.js';
import { 
  submitMatchOrders, 
  getUserNonce, 
  getOrderStatus as getOnChainOrderStatus 
} from '../../lib/exchange-executor.js';
import { logger } from '../../lib/logger.js';
import { getRedisClient, REDIS_KEYS } from '../../lib/redis/client.js';
import { tryMatchSignedOrder } from '../../lib/signed-order-matching.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

// ============================================
// Signed Order Validation
// ============================================

function parseSignedOrder(data: any): SignedOrder | null {
  try {
    const order: Order = {
      salt: BigInt(data.order.salt),
      maker: new PublicKey(data.order.maker),
      signer: new PublicKey(data.order.signer),
      taker: new PublicKey(data.order.taker || PublicKey.default.toBase58()),
      market: new PublicKey(data.order.market),
      tokenId: data.order.tokenId,
      makerAmount: BigInt(data.order.makerAmount),
      takerAmount: BigInt(data.order.takerAmount),
      expiration: BigInt(data.order.expiration || 0),
      nonce: BigInt(data.order.nonce),
      feeRateBps: data.order.feeRateBps || 0,
      side: data.order.side,
    };

    // Parse signature (base58 or hex or array)
    let signature: Uint8Array;
    if (typeof data.signature === 'string') {
      signature = bs58.decode(data.signature);
    } else if (Array.isArray(data.signature)) {
      signature = new Uint8Array(data.signature);
    } else {
      return null;
    }

    if (signature.length !== 64) {
      return null;
    }

    return { order, signature };
  } catch {
    return null;
  }
}

function verifyOrderSignature(signedOrder: SignedOrder): boolean {
  try {
    const orderHash = hashOrder(signedOrder.order);
    return nacl.sign.detached.verify(
      orderHash,
      signedOrder.signature,
      signedOrder.order.signer.toBytes()
    );
  } catch {
    return false;
  }
}

// ============================================
// Routes
// ============================================

export default async function exchangeOrdersRoutes(app: FastifyInstance) {
  
  // ============================================
  // POST /exchange/orders - Submit signed order
  // ============================================
  // 
  // Accepts a signed order and queues it for matching.
  // The order is validated and signature is verified before acceptance.
  //
  app.post('/orders', async (request, reply) => {
    try {
      const apiKeyRow = await requireL2Auth(request);
      const body = request.body as any;

      // Parse signed order
      const signedOrder = parseSignedOrder(body);
      if (!signedOrder) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_ORDER', message: 'Invalid order format' },
        });
      }

      // Verify wallet matches
      if (signedOrder.order.maker.toBase58() !== apiKeyRow.wallet_address) {
        return reply.code(403).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Order maker does not match authenticated wallet' },
        });
      }

      // Validate order fields
      const validation = validateOrder(signedOrder.order);
      if (!validation.valid) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: validation.error },
        });
      }

      // Check expiration
      if (isOrderExpired(signedOrder.order, Math.floor(Date.now() / 1000))) {
        return reply.code(400).send({
          success: false,
          error: { code: 'ORDER_EXPIRED', message: 'Order has expired' },
        });
      }

      // Verify signature
      if (!verifyOrderSignature(signedOrder)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Order signature is invalid' },
        });
      }

      // Check nonce
      const currentNonce = await getUserNonce(signedOrder.order.maker);
      if (signedOrder.order.nonce < currentNonce) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_NONCE', message: 'Order nonce is too low' },
        });
      }

      // Generate order hash for tracking
      const orderHash = hashOrder(signedOrder.order);
      const orderHashBase58 = bs58.encode(orderHash);

      // ============================================
      // Store signed order in Redis
      // ============================================
      const redis = getRedisClient();
      if (!redis) {
        logger.error('exchange-orders', 'Redis not available');
        return reply.code(503).send({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Order storage not available' },
        });
      }

      const marketId = signedOrder.order.market.toBase58();
      const maker = signedOrder.order.maker.toBase58();
      const tokenId = signedOrder.order.tokenId;
      const side = signedOrder.order.side; // 0=BUY, 1=SELL

      // Serialize order data for storage
      const orderData = {
        orderHash: orderHashBase58,
        order: JSON.stringify({
          salt: signedOrder.order.salt.toString(),
          maker: maker,
          signer: signedOrder.order.signer.toBase58(),
          taker: signedOrder.order.taker.toBase58(),
          market: marketId,
          tokenId: tokenId,
          makerAmount: signedOrder.order.makerAmount.toString(),
          takerAmount: signedOrder.order.takerAmount.toString(),
          expiration: signedOrder.order.expiration.toString(),
          nonce: signedOrder.order.nonce.toString(),
          feeRateBps: signedOrder.order.feeRateBps,
          side: side,
        }),
        signature: bs58.encode(signedOrder.signature),
        status: 'open',
        createdAt: Date.now().toString(),
        filledAmount: '0',
        remainingAmount: signedOrder.order.makerAmount.toString(),
      };

      // Store order hash -> order data
      await redis.hset(REDIS_KEYS.signedOrder(orderHashBase58), orderData);

      // Add to orderbook sorted set (score = price scaled by 1e6)
      const price = calculateOrderPrice(signedOrder.order);
      const orderbookKey = side === 0 
        ? REDIS_KEYS.signedOrderbook.bids(marketId, tokenId)
        : REDIS_KEYS.signedOrderbook.asks(marketId, tokenId);
      
      // For bids, use negative price so highest price comes first
      // For asks, use positive price so lowest price comes first
      const score = side === 0 ? -Number(price) : Number(price);
      await redis.zadd(orderbookKey, score, orderHashBase58);

      // Index by user wallet
      await redis.sadd(REDIS_KEYS.signedUserOrders(maker), orderHashBase58);

      // Set expiration TTL if order has expiration
      if (signedOrder.order.expiration > 0n) {
        const ttlSeconds = Number(signedOrder.order.expiration) - Math.floor(Date.now() / 1000);
        if (ttlSeconds > 0) {
          await redis.expire(REDIS_KEYS.signedOrder(orderHashBase58), ttlSeconds);
        }
      }

      logger.info('exchange-orders', 'Signed order stored', {
        orderHash: orderHashBase58,
        maker: maker,
        market: marketId,
        side: side,
        tokenId: tokenId,
        price: price.toString(),
      });

      // ============================================
      // Trigger matching engine
      // ============================================
      let matchTriggered = false;
      try {
        matchTriggered = await tryMatchSignedOrder(signedOrder, orderHashBase58);
      } catch (matchErr) {
        // Matching failure is not critical - order is still stored
        logger.warn('exchange-orders', 'Match attempt failed', matchErr);
      }

      return reply.send({
        success: true,
        data: {
          orderHash: orderHashBase58,
          status: matchTriggered ? 'matched' : 'accepted',
          order: {
            salt: signedOrder.order.salt.toString(),
            maker: signedOrder.order.maker.toBase58(),
            market: signedOrder.order.market.toBase58(),
            tokenId: signedOrder.order.tokenId,
            side: signedOrder.order.side,
            makerAmount: signedOrder.order.makerAmount.toString(),
            takerAmount: signedOrder.order.takerAmount.toString(),
            nonce: signedOrder.order.nonce.toString(),
            feeRateBps: signedOrder.order.feeRateBps,
          },
        },
      });
    } catch (error: any) {
      logger.error('exchange-orders', 'POST /exchange/orders error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Internal error' },
      });
    }
  });

  // ============================================
  // POST /exchange/match - Match orders atomically
  // ============================================
  //
  // Matches a taker order against one or more maker orders.
  // This is an operator-only endpoint that triggers on-chain settlement.
  //
  app.post('/match', async (request, reply) => {
    try {
      // This endpoint should only be called by operators/backend
      // In production, add operator authentication
      const body = request.body as any;

      const takerOrder = parseSignedOrder(body.takerOrder);
      if (!takerOrder) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_ORDER', message: 'Invalid taker order' },
        });
      }

      const makerOrders: SignedOrder[] = [];
      for (const makerOrderData of body.makerOrders || []) {
        const makerOrder = parseSignedOrder(makerOrderData);
        if (!makerOrder) {
          return reply.code(400).send({
            success: false,
            error: { code: 'INVALID_ORDER', message: 'Invalid maker order' },
          });
        }
        makerOrders.push(makerOrder);
      }

      if (makerOrders.length === 0) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'At least one maker order required' },
        });
      }

      const takerFillAmount = BigInt(body.takerFillAmount || takerOrder.order.makerAmount.toString());
      const makerFillAmounts = (body.makerFillAmounts || []).map((a: string) => BigInt(a));

      if (makerFillAmounts.length !== makerOrders.length) {
        // Default to maker amounts
        makerFillAmounts.length = 0;
        for (const mo of makerOrders) {
          makerFillAmounts.push(mo.order.makerAmount);
        }
      }

      // Submit to chain
      const txSignature = await submitMatchOrders({
        takerOrder,
        takerFillAmount,
        makerOrders,
        makerFillAmounts,
      });

      logger.info('exchange-orders', 'Orders matched on-chain', {
        txSignature,
        takerOrderHash: bs58.encode(hashOrder(takerOrder.order)),
        makerCount: makerOrders.length,
      });

      return reply.send({
        success: true,
        data: {
          txSignature,
          takerOrderHash: bs58.encode(hashOrder(takerOrder.order)),
          makerOrderHashes: makerOrders.map(mo => bs58.encode(hashOrder(mo.order))),
        },
      });
    } catch (error: any) {
      logger.error('exchange-orders', 'POST /exchange/match error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SETTLEMENT_FAILED', message: error.message || 'Match failed' },
      });
    }
  });

  // ============================================
  // GET /exchange/orders/:orderHash - Get order status
  // ============================================
  //
  // Returns on-chain status of an order.
  //
  app.get('/orders/:orderHash', async (request, reply) => {
    try {
      const { orderHash } = request.params as { orderHash: string };

      const orderHashBuffer = Buffer.from(bs58.decode(orderHash));
      const status = await getOnChainOrderStatus(orderHashBuffer);

      if (!status) {
        return reply.send({
          success: true,
          data: {
            orderHash,
            exists: false,
            status: 'unknown',
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          orderHash,
          exists: true,
          isFilledOrCancelled: status.isFilledOrCancelled,
          remaining: status.remaining.toString(),
          status: status.isFilledOrCancelled 
            ? (status.remaining > 0n ? 'cancelled' : 'filled')
            : 'open',
        },
      });
    } catch (error: any) {
      logger.error('exchange-orders', 'GET /exchange/orders/:orderHash error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Internal error' },
      });
    }
  });

  // ============================================
  // GET /exchange/nonce/:wallet - Get user nonce
  // ============================================
  //
  // Returns the current nonce for a user wallet.
  //
  app.get('/nonce/:wallet', async (request, reply) => {
    try {
      const { wallet } = request.params as { wallet: string };

      const userPubkey = new PublicKey(wallet);
      const nonce = await getUserNonce(userPubkey);

      return reply.send({
        success: true,
        data: {
          wallet,
          nonce: nonce.toString(),
        },
      });
    } catch (error: any) {
      logger.error('exchange-orders', 'GET /exchange/nonce/:wallet error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Internal error' },
      });
    }
  });
}
