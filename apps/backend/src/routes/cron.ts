import type { FastifyInstance } from 'fastify';
import { createServerClient } from '../lib/supabase.js';
import { getCronSecretToken } from '../lib/keeper/terminate-inactive.js';
import { INACTIVITY_TIMEOUT_DAYS, distributeLiquidityRewards } from '@catallaxyz/shared';
import { processLiquidityPayouts } from '../lib/keeper/liquidity-payout.js';
import { syncMarketPositions, findDiscrepancies } from '../lib/sync-onchain.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import IDL from '../generated/catallaxyz/catallaxyz.json' with { type: 'json' };
import { logger } from '../lib/logger.js';
import { loadKeeperKeypair } from '../lib/solana.js';
import { toScaled } from '@catallaxyz/shared';

const ALLOWED_DAYS = new Set([3, 5, 7]);

function getFeeConfigFallback() {
  return {
    platformFeeRate: 0.75,
    makerRebateRate: 0.2,
    creatorIncentiveRate: 0.05,
    centerTakerFeeRate: 0.032,
    extremeTakerFeeRate: 0.002,
  };
}

function verifyCronAuth(headers: Record<string, string | string[] | undefined>) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return { status: 500, body: { error: 'CRON_SECRET is not configured' } };
  }
  if (getCronSecretToken(headers) !== cronSecret) {
    return { status: 401, body: { error: 'Unauthorized' } };
  }
  return null;
}

async function runTerminateInactive(headers: Record<string, string | string[] | undefined>) {
  const authError = verifyCronAuth(headers);
  if (authError) {
    return authError;
  }

  const supabase = createServerClient();
  const configuredDays = Number(process.env.INACTIVITY_CRON_DAYS);
  const inactivityDays = ALLOWED_DAYS.has(configuredDays) ? configuredDays : INACTIVITY_TIMEOUT_DAYS;

  const { error } = await supabase.rpc('refresh_inactive_market_candidates', {
    p_inactivity_days: inactivityDays,
  });

  if (error) {
    return {
      status: 500,
      body: { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
    };
  }

  return { status: 200, body: { success: true, inactivityDays } };
}

async function runLiquidityPayout(headers: Record<string, string | string[] | undefined>) {
  const authError = verifyCronAuth(headers);
  if (authError) {
    return authError;
  }

  const supabase = createServerClient();
  const result = await processLiquidityPayouts(supabase);
  return { status: 200, body: { success: true, result } };
}

async function runLiquidityDistribute(headers: Record<string, string | string[] | undefined>) {
  const authError = verifyCronAuth(headers);
  if (authError) {
    return authError;
  }

  const supabase = createServerClient();
  const result = await distributeLiquidityRewards(supabase);
  return { status: 200, body: { success: true, result } };
}

export default async function cronRoutes(app: FastifyInstance) {
  app.post('/cron/terminate-inactive', async (request, reply) => {
    try {
      const result = await runTerminateInactive(request.headers as any);
      return reply.code(result.status).send(result.body);
    } catch (error: any) {
      logger.error('cron', 'terminate-inactive failed', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.post('/cron/liquidity-payout', async (request, reply) => {
    try {
      const result = await runLiquidityPayout(request.headers as any);
      return reply.code(result.status).send(result.body);
    } catch (error: any) {
      logger.error('cron', 'liquidity-payout failed', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.post('/cron/liquidity-distribute', async (request, reply) => {
    try {
      const result = await runLiquidityDistribute(request.headers as any);
      return reply.code(result.status).send(result.body);
    } catch (error: any) {
      logger.error('cron', 'liquidity-distribute failed', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.post('/cron/sync-fee-split', async (request, reply) => {
    const authError = verifyCronAuth(request.headers as any);
    if (authError) {
      return reply.code(authError.status).send(authError.body);
    }

    try {
      const supabase = createServerClient();
      const { data: config } = await supabase
        .from('platform_settings')
        .select(
          'platform_fee_rate, maker_rebate_rate, creator_incentive_rate, center_taker_fee_rate, extreme_taker_fee_rate'
        )
        .eq('key', 'fee_config')
        .single();

      const fallback = getFeeConfigFallback();
      const platformRate = Number(config?.platform_fee_rate ?? fallback.platformFeeRate);
      const makerRate = Number(config?.maker_rebate_rate ?? fallback.makerRebateRate);
      const creatorRate = Number(config?.creator_incentive_rate ?? fallback.creatorIncentiveRate);
      const centerRate = Number(config?.center_taker_fee_rate ?? fallback.centerTakerFeeRate);
      const extremeRate = Number(config?.extreme_taker_fee_rate ?? fallback.extremeTakerFeeRate);

      const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
      const programId = process.env.PROGRAM_ID;
      if (!programId) {
        throw new Error('PROGRAM_ID is not configured');
      }

      const keeperKeypair = loadKeeperKeypair();
      const connection = new Connection(rpcUrl, 'confirmed');
      const provider = new AnchorProvider(connection, new Wallet(keeperKeypair), {
        commitment: 'confirmed',
      });
      const program = new Program(IDL as any, provider);
      const [globalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('global')],
        program.programId
      );

      await program.methods
        .updateFeeRates({
          centerTakerFeeRate: toScaled(centerRate),
          extremeTakerFeeRate: toScaled(extremeRate),
          platformFeeRate: toScaled(platformRate),
          makerRebateRate: toScaled(makerRate),
          creatorIncentiveRate: toScaled(creatorRate),
        })
        .accounts({
          authority: keeperKeypair.publicKey,
          global: globalPda,
        })
        .signers([keeperKeypair])
        .rpc();

      return reply.send({
        success: true,
        data: {
          platformRate,
          makerRate,
          creatorRate,
          centerRate,
          extremeRate,
        },
      });
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  // Sync on-chain positions for a specific market
  app.post('/cron/sync-positions', async (request, reply) => {
    const authError = verifyCronAuth(request.headers as any);
    if (authError) {
      return reply.code(authError.status).send(authError.body);
    }

    try {
      const body = request.body as { marketId?: string } | undefined;
      const supabase = createServerClient();

      if (body?.marketId) {
        // Sync specific market
        const synced = await syncMarketPositions(body.marketId);
        return reply.send({
          success: true,
          data: { marketId: body.marketId, synced },
        });
      }

      // Sync all active markets
      const { data: markets, error } = await supabase
        .from('markets')
        .select('id')
        .in('status', ['active', 'running']);

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      let totalSynced = 0;
      for (const market of markets || []) {
        const synced = await syncMarketPositions(market.id);
        totalSynced += synced;
      }

      return reply.send({
        success: true,
        data: { marketsProcessed: markets?.length || 0, totalSynced },
      });
    } catch (error: any) {
      logger.error('cron', 'sync-positions failed', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  // Check for discrepancies between on-chain and off-chain state
  app.post('/cron/check-discrepancies', async (request, reply) => {
    const authError = verifyCronAuth(request.headers as any);
    if (authError) {
      return reply.code(authError.status).send(authError.body);
    }

    try {
      const body = request.body as { marketId?: string } | undefined;
      const supabase = createServerClient();

      if (body?.marketId) {
        const discrepancies = await findDiscrepancies(body.marketId);
        return reply.send({
          success: true,
          data: { marketId: body.marketId, discrepancies },
        });
      }

      // Check all active markets
      const { data: markets, error } = await supabase
        .from('markets')
        .select('id')
        .in('status', ['active', 'running'])
        .limit(10);  // Limit to avoid timeout

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      const allDiscrepancies: Array<{
        marketId: string;
        discrepancies: Awaited<ReturnType<typeof findDiscrepancies>>;
      }> = [];

      for (const market of markets || []) {
        const discrepancies = await findDiscrepancies(market.id);
        if (discrepancies.length > 0) {
          allDiscrepancies.push({ marketId: market.id, discrepancies });
        }
      }

      return reply.send({
        success: true,
        data: {
          marketsChecked: markets?.length || 0,
          marketsWithDiscrepancies: allDiscrepancies.length,
          discrepancies: allDiscrepancies,
        },
      });
    } catch (error: any) {
      logger.error('cron', 'check-discrepancies failed', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });
}
