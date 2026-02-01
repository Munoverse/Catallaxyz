import type { FastifyInstance } from 'fastify';
import { createServerClient } from '../lib/supabase.js';
import { getWalletAuthHeaders, verifyWalletAuth } from '../lib/auth.js';
import { verifyOnChainTransaction } from '../lib/solana.js';
import { logger } from '../lib/logger.js';

export default async function redemptionsRoutes(app: FastifyInstance) {
  app.post('/redemptions', async (request, reply) => {
    try {
      const body = request.body as Record<string, any>;
      const {
        walletAddress,
        marketId,
        redemptionType,
        yesTokensBurned,
        noTokensBurned,
        usdcRedeemed,
        yesPrice,
        noPrice,
        transactionSignature,
        slot,
      } = body;

      if (!walletAddress || !marketId || !redemptionType || !usdcRedeemed || !transactionSignature) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'walletAddress, marketId, redemptionType, usdcRedeemed, transactionSignature are required',
          },
        });
      }

      const supabase = createServerClient();
      const walletHeaders = getWalletAuthHeaders(request);
      if (
        !walletHeaders.address ||
        !walletHeaders.signature ||
        !walletHeaders.timestamp ||
        !walletHeaders.nonce
      ) {
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

      if (walletHeaders.address !== walletAddress) {
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

      const { data, error } = await supabase
        .from('redemptions')
        .insert([
          {
            user_id: user.id,
            market_id: marketId,
            redemption_type: redemptionType,
            yes_tokens_burned: yesTokensBurned || 0,
            no_tokens_burned: noTokensBurned || 0,
            usdc_redeemed: usdcRedeemed,
            yes_price: yesPrice ?? null,
            no_price: noPrice ?? null,
            transaction_signature: transactionSignature,
            slot: verification.slot ?? slot ?? null,
          },
        ])
        .select('id')
        .single();

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      return reply.send({ success: true, data });
    } catch (error: any) {
      logger.error('routes/redemptions', 'POST /api/redemptions error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });
}
