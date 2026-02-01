import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createServerClient } from '../lib/supabase.js';
import { getWalletAuthHeaders, verifyWalletAuth } from '../lib/auth.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import IDL from '../generated/catallaxyz/catallaxyz.json' with { type: 'json' };
import { loadKeeperKeypair, ensureAta } from '../lib/solana.js';
import { toScaled, clampRate } from '@catallaxyz/shared';

const MAX_BATCH = 50;
const ALLOWED_DAYS = new Set([3, 5, 7]);

function getAdminAddress() {
  return process.env.ADMIN_WALLET_ADDRESS || '';
}

function isAdmin(walletAddress: string | undefined | null) {
  const adminAddress = getAdminAddress();
  if (!adminAddress || !walletAddress) return false;
  return adminAddress === walletAddress;
}

function getAdminAuthHeaders(request: FastifyRequest) {
  const headers = request.headers;
  const walletHeaders = getWalletAuthHeaders(request);
  return {
    address: (headers['x-admin-wallet'] as string | undefined) || walletHeaders.address,
    signature:
      (headers['x-admin-signature'] as string | undefined) || walletHeaders.signature,
    timestamp:
      (headers['x-admin-timestamp'] as string | undefined) || walletHeaders.timestamp,
    nonce: (headers['x-admin-nonce'] as string | undefined) || walletHeaders.nonce,
  };
}

async function requireAdminAuth(request: FastifyRequest) {
  try {
    const { address, signature, timestamp, nonce } = getAdminAuthHeaders(request);
    if (!address || !signature || !timestamp || !nonce) {
      throw new Error('Missing admin auth headers');
    }
    if (!isAdmin(address)) {
      throw new Error('Unauthorized');
    }
    const supabase = createServerClient();
    await verifyWalletAuth({
      supabase,
      walletAddress: address,
      signature,
      timestamp,
      nonce,
    });
    return address;
  } catch (error) {
    const err = new Error('Unauthorized');
    (err as any).statusCode = 401;
    throw err;
  }
}

// Note: clampRate and toScaled are now imported from @catallaxyz/shared/lib/utils.js
// Note: loadKeeperKeypair and ensureAta are now imported from ../lib/solana.js

export default async function adminRoutes(app: FastifyInstance) {
  app.get('/admin/markets', async (request, reply) => {
    try {
      await requireAdminAuth(request);
      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('markets')
        .select('id, title, category, status, created_at, total_volume, solana_market_account, market_usdc_vault')
        .order('created_at', { ascending: false });

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      return reply.send({ success: true, data: data || [] });
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.get('/admin/fee-config', async (request, reply) => {
    try {
      await requireAdminAuth(request);
      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('platform_settings')
        .select('key, platform_fee_rate, maker_rebate_rate, creator_incentive_rate, updated_at')
        .eq('key', 'fee_config')
        .single();

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      return reply.send({ success: true, data });
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.post('/admin/fee-config', async (request, reply) => {
    try {
      await requireAdminAuth(request);
      const body = request.body as Record<string, any>;
      const supabase = createServerClient();
      const { data: existingConfig } = await supabase
        .from('platform_settings')
        .select(
          'platform_fee_rate, maker_rebate_rate, creator_incentive_rate, center_taker_fee_rate, extreme_taker_fee_rate'
        )
        .eq('key', 'fee_config')
        .single();

      const platformPercentRaw = body?.platformFeeShare;
      const rewardPercentRaw = body?.rewardFeeShare;
      const creatorPercentRaw = body?.creatorFeeShare;
      const centerPercentRaw = body?.centerTakerFeeRate;
      const extremePercentRaw = body?.extremeTakerFeeRate;

      const hasSplitUpdate =
        platformPercentRaw !== undefined ||
        rewardPercentRaw !== undefined ||
        creatorPercentRaw !== undefined;
      const hasCurveUpdate =
        centerPercentRaw !== undefined ||
        extremePercentRaw !== undefined;

      if (hasSplitUpdate) {
        const platformPercent = Number(platformPercentRaw);
        const rewardPercent = Number(rewardPercentRaw);
        const creatorPercent = Number(creatorPercentRaw);
        const percentSum = platformPercent + rewardPercent + creatorPercent;
        if (
          !Number.isFinite(platformPercent) ||
          !Number.isFinite(rewardPercent) ||
          !Number.isFinite(creatorPercent) ||
          Math.abs(percentSum - 100) > 1e-6
        ) {
          return reply.code(400).send({
            success: false,
            error: { code: 'INVALID_INPUT', message: 'Percent sum must be 100' },
          });
        }
      }

      if (hasCurveUpdate) {
        const centerPercent = Number(centerPercentRaw);
        const extremePercent = Number(extremePercentRaw);
        if (
          !Number.isFinite(centerPercent) ||
          !Number.isFinite(extremePercent) ||
          centerPercent < extremePercent ||
          centerPercent > 10 ||
          extremePercent < 0
        ) {
          return reply.code(400).send({
            success: false,
            error: { code: 'INVALID_INPUT', message: 'Invalid fee curve values' },
          });
        }
      }

      const platformRate = hasSplitUpdate
        ? clampRate(Number(platformPercentRaw) / 100)
        : Number(existingConfig?.platform_fee_rate ?? 0.75);
      const makerRate = hasSplitUpdate
        ? clampRate(Number(rewardPercentRaw) / 100)
        : Number(existingConfig?.maker_rebate_rate ?? 0.2);
      const creatorRate = hasSplitUpdate
        ? clampRate(Number(creatorPercentRaw) / 100)
        : Number(existingConfig?.creator_incentive_rate ?? 0.05);
      const centerRate = hasCurveUpdate
        ? clampRate(Number(centerPercentRaw) / 100)
        : Number(existingConfig?.center_taker_fee_rate ?? 0.032);
      const extremeRate = hasCurveUpdate
        ? clampRate(Number(extremePercentRaw) / 100)
        : Number(existingConfig?.extreme_taker_fee_rate ?? 0.002);

      const { data, error } = await supabase
        .from('platform_settings')
        .upsert({
          key: 'fee_config',
          platform_fee_rate: platformRate,
          maker_rebate_rate: makerRate,
          center_taker_fee_rate: centerRate,
          extreme_taker_fee_rate: extremeRate,
          creator_incentive_rate: creatorRate,
          updated_at: new Date().toISOString(),
        })
        .select(
          'key, platform_fee_rate, maker_rebate_rate, creator_incentive_rate, center_taker_fee_rate, extreme_taker_fee_rate, updated_at'
        )
        .single();

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      const centerTakerRate = Number(data?.center_taker_fee_rate ?? 0.032);
      const extremeTakerRate = Number(data?.extreme_taker_fee_rate ?? 0.002);

      const programId = process.env.PROGRAM_ID;
      if (!programId) {
        throw new Error('PROGRAM_ID is not configured');
      }

      const keeperKeypair = loadKeeperKeypair();
      const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
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
          centerTakerFeeRate: toScaled(centerTakerRate),
          extremeTakerFeeRate: toScaled(extremeTakerRate),
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

      return reply.send({ success: true, data });
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.post('/admin/markets/termination-probability', async (request, reply) => {
    try {
      await requireAdminAuth(request);
      const body = request.body as Record<string, any>;
      const { marketAddress, terminationProbability } = body;

      if (!marketAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'marketAddress is required' },
        });
      }

      const probabilityPercent = Number(terminationProbability);
      if (!Number.isFinite(probabilityPercent) || probabilityPercent < 0 || probabilityPercent > 100) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'terminationProbability must be 0-100' },
        });
      }

      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('markets')
        .update({
          termination_probability: probabilityPercent / 100,
          updated_at: new Date().toISOString(),
        })
        .eq('solana_market_account', marketAddress)
        .select('id, termination_probability')
        .single();

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      if (!data) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Market not found' },
        });
      }

      return reply.send({
        success: true,
        data,
      });
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.get('/admin/inactive-markets', async (request, reply) => {
    try {
      await requireAdminAuth(request);
      const query = request.query as Record<string, string | undefined>;
      const minDaysParam = query.minDays;
      const minDays = minDaysParam ? Number(minDaysParam) : null;

      if (minDaysParam && (minDays === null || !Number.isFinite(minDays) || !ALLOWED_DAYS.has(minDays))) {
        return reply.code(400).send({ error: 'Invalid minDays' });
      }

      const supabase = createServerClient();
      let dbQuery = supabase
        .from('inactive_market_candidates')
        .select('*')
        .order('days_inactive', { ascending: false });

      if (minDays) {
        dbQuery = dbQuery.gte('days_inactive', minDays);
      }

      const { data, error } = await dbQuery;

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      return reply.send({ success: true, data: data || [] });
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.post('/admin/inactive-markets', async (request, reply) => {
    try {
      await requireAdminAuth(request);
      const supabase = createServerClient();
      const body = request.body as Record<string, any>;
      const inactivityDays = Number(body?.inactivityDays);

      if (!Number.isFinite(inactivityDays) || !ALLOWED_DAYS.has(inactivityDays)) {
        return reply.code(400).send({ error: 'Invalid inactivityDays' });
      }

      const { error } = await supabase.rpc('refresh_inactive_market_candidates', {
        p_inactivity_days: inactivityDays,
      });

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      return reply.send({ success: true, data: { inactivityDays } });
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.post('/admin/inactive-markets/terminate-batch', async (request, reply) => {
    try {
      await requireAdminAuth(request);
      const body = request.body as Record<string, any>;
      const marketIds = Array.isArray(body?.marketIds) ? body.marketIds : [];

      if (!marketIds.length) {
        return reply.code(400).send({ error: 'marketIds required' });
      }
      if (marketIds.length > MAX_BATCH) {
        return reply.code(400).send({ error: `marketIds limit is ${MAX_BATCH}` });
      }

      const programId = process.env.PROGRAM_ID;
      const usdcMintAddress = process.env.USDC_MINT_ADDRESS;
      if (!programId) {
        throw new Error('PROGRAM_ID is not configured');
      }
      if (!usdcMintAddress) {
        throw new Error('USDC_MINT_ADDRESS is not configured');
      }

      const supabase = createServerClient();
      const { data: markets, error } = await supabase
        .from('markets')
        .select('id, title, solana_market_account')
        .in('id', marketIds);

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      const keeperKeypair = loadKeeperKeypair();
      const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
      const connection = new Connection(rpcUrl, 'confirmed');
      const provider = new AnchorProvider(connection, new Wallet(keeperKeypair), {
        commitment: 'confirmed',
      });
      const program = new Program(IDL as any, provider);
      const [globalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('global')],
        program.programId
      );
      const [creatorTreasuryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('creator_treasury')],
        program.programId
      );
      const usdcMint = new PublicKey(usdcMintAddress);

      const results = [];
      let terminated = 0;
      let skipped = 0;

      for (const market of markets || []) {
        if (!market.solana_market_account) {
          skipped += 1;
          results.push({
            marketId: market.id,
            title: market.title,
            status: 'skipped',
            reason: 'Missing solana_market_account',
          });
          continue;
        }

        try {
          const marketPubkey = new PublicKey(market.solana_market_account);
          const marketAccount = await (program.account as any).market.fetch(marketPubkey);
          const creatorUsdcAccount = await ensureAta(
            connection,
            keeperKeypair,
            usdcMint,
            marketAccount.creator as PublicKey
          );

          // Derive market vault PDA
          const [marketVaultPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('market_vault'), marketPubkey.toBuffer()],
            program.programId
          );

          const signature = await program.methods
            .terminateIfInactive()
            .accounts({
              global: globalPda,
              caller: keeperKeypair.publicKey,
              market: marketPubkey,
              marketUsdcVault: marketVaultPda,
              creatorTreasury: creatorTreasuryPda,
              creatorUsdcAccount,
              usdcMint,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([keeperKeypair])
            .rpc();

          await supabase
            .from('markets')
            .update({ status: 'terminated', updated_at: new Date().toISOString() })
            .eq('id', market.id);

          terminated += 1;
          results.push({
            marketId: market.id,
            title: market.title,
            status: 'terminated',
            signature,
          });
        } catch (error: any) {
          skipped += 1;
          results.push({
            marketId: market.id,
            title: market.title,
            status: 'failed',
            reason: error.message || 'Unknown error',
          });
        }
      }

      return reply.send({
        success: true,
        data: { terminated, skipped, results },
      });
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });
}
