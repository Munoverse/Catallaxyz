import type { FastifyInstance } from 'fastify';
import { Connection } from '@solana/web3.js';
import { createServerClient } from '../lib/supabase.js';
import { updateLiquidityScoresForMarket } from '@catallaxyz/shared';
import { getWalletAuthHeaders, verifyWalletAuth } from '../lib/auth.js';
import { getSolanaRpcUrl, verifyOnChainTransaction } from '../lib/solana.js';
import { logger } from '../lib/logger.js';
import { 
  requireAuth, 
  sendAuthError, 
  AuthError 
} from '../lib/auth-middleware.js';

function isAuthorizedWallet(authWallet: string, body: Record<string, any>) {
  return body.walletAddress === authWallet;
}

export default async function tradesRoutes(app: FastifyInstance) {
  app.post('/trades', async (request, reply) => {
    try {
      const supabase = createServerClient();
      const body = request.body as Record<string, any>;
      const walletHeaders = getWalletAuthHeaders(request);

      if (!walletHeaders.address || !walletHeaders.signature || !walletHeaders.timestamp || !walletHeaders.nonce) {
        return reply.code(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing wallet auth headers' },
        });
      }

      try {
        await verifyWalletAuth({
          supabase,
          walletAddress: walletHeaders.address,
          signature: walletHeaders.signature,
          timestamp: walletHeaders.timestamp,
          nonce: walletHeaders.nonce,
        });
      } catch (error: any) {
        return reply.code(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: error.message || 'Invalid wallet signature' },
        });
      }

      if (!isAuthorizedWallet(walletHeaders.address, body)) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Wallet does not match trade payload' },
        });
      }

      const {
        walletAddress,
        marketAddress,
        outcomeType,
        side,
        amountLamports,
        price,
        totalCostLamports,
        transactionSignature,
        slot,
        blockTime,
      } = body;

      let resolvedBlockTime: string | null = blockTime || null;

      if (
        !walletAddress ||
        !marketAddress ||
        !outcomeType ||
        !side ||
        !amountLamports ||
        price == null ||
        !transactionSignature
      ) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message:
              'Missing required fields: walletAddress, marketAddress, outcomeType, side, amountLamports, price, transactionSignature',
          },
        });
      }

      if (walletAddress !== walletHeaders.address) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Wallet address mismatch' },
        });
      }

      const verification = await verifyOnChainTransaction({
        transactionSignature,
        walletAddress,
      });

      if (!verification.ok) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_TRANSACTION', message: verification.error },
        });
      }

      if (!resolvedBlockTime && (verification.blockTime || slot || verification.slot)) {
        if (verification.blockTime) {
          resolvedBlockTime = verification.blockTime;
        } else if (verification.slot || slot) {
          try {
            const connection = new Connection(getSolanaRpcUrl(), 'confirmed');
            const blockTimeSeconds = await connection.getBlockTime(
              Number(verification.slot ?? slot)
            );
            if (blockTimeSeconds) {
              resolvedBlockTime = new Date(blockTimeSeconds * 1000).toISOString();
            }
          } catch (error) {
            logger.warn('routes/trades', 'Failed to resolve block time from slot', error);
          }
        }
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', walletAddress)
        .single();

      if (userError || !user) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found. Please authenticate first.' },
        });
      }

      const { data: market, error: marketError } = await supabase
        .from('markets')
        .select('id')
        .eq('solana_market_account', marketAddress)
        .single();

      if (marketError || !market) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Market not found for the provided address.' },
        });
      }

      const { data: trade, error: insertError } = await supabase
        .from('trades')
        .insert([
          {
            market_id: market.id,
            user_id: user.id,
            outcome_type: outcomeType,
            side,
            amount: amountLamports,
            price,
            total_cost: totalCostLamports || Math.floor(amountLamports * price),
            transaction_signature: transactionSignature,
            slot: verification.slot ?? slot ?? null,
            block_time: resolvedBlockTime || new Date().toISOString(),
          },
        ])
        .select('id')
        .single();

      if (insertError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: insertError.message },
        });
      }

      try {
        const eventTime = resolvedBlockTime ? new Date(resolvedBlockTime) : new Date();
        await updateLiquidityScoresForMarket(supabase, market.id, eventTime);
      } catch (error) {
        logger.warn('routes/trades', 'Liquidity score update failed', error);
      }

      return reply.send({
        success: true,
        data: {
          tradeId: trade.id,
        },
      });
    } catch (error: any) {
      logger.error('routes/trades', 'Error in POST /api/trades', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  // AUDIT FIX B-01: Secure trades query endpoint
  // - Market trades (by marketId) are public (market activity is public info)
  // - User trades (by walletAddress) require authentication (private trading history)
  app.get('/trades', async (request, reply) => {
    try {
      const supabase = createServerClient();
      const query = request.query as Record<string, string | undefined>;

      const marketId = query.marketId;
      const walletAddress = query.walletAddress;
      const limit = Math.min(parseInt(query.limit || '50', 10), 100); // Cap at 100
      const offset = parseInt(query.offset || '0', 10);

      if (!marketId && !walletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'marketId or walletAddress is required' },
        });
      }

      // AUDIT FIX: If querying by walletAddress (user's trading history), require authentication
      // and verify the wallet belongs to the authenticated user
      let authenticatedUserId: string | null = null;
      if (walletAddress) {
        try {
          const user = await requireAuth(request, supabase);
          // Users can only query their own trading history
          if (user.walletAddress !== walletAddress) {
            return reply.code(403).send({
              success: false,
              error: { code: 'FORBIDDEN', message: 'Can only view your own trading history' },
            });
          }
          authenticatedUserId = user.userId;
        } catch (error) {
          sendAuthError(reply, error as AuthError);
          return;
        }
      }

      let dbQuery = supabase
        .from('trades')
        .select(
          `
        id,
        market_id,
        user_id,
        outcome_type,
        side,
        amount,
        price,
        total_cost,
        transaction_signature,
        slot,
        block_time,
        created_at,
        user:user_id (
          username,
          avatar_url,
          wallet_address
        )
      `
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (marketId) {
        dbQuery = dbQuery.eq('market_id', marketId);
      }

      if (authenticatedUserId) {
        // Use the authenticated user's ID directly (already verified)
        dbQuery = dbQuery.eq('user_id', authenticatedUserId);
      }

      const { data: trades, error } = await dbQuery;

      if (error) {
        logger.error('routes/trades', 'Database error in GET /api/trades', error);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: 'Failed to fetch trades' },
        });
      }

      return reply.send({
        success: true,
        data: {
          trades: trades || [],
          pagination: {
            limit,
            offset,
            total: trades?.length || 0,
          },
        },
      });
    } catch (error: any) {
      logger.error('routes/trades', 'Error in GET /api/trades', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Internal server error' },
      });
    }
  });
}
