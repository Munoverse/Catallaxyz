import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import IDL from '../generated/catallaxyz/catallaxyz.json' with { type: 'json' };
import { createServerClient } from '../lib/supabase.js';
import { buildCacheKey, getCache, setCache } from '../lib/cache.js';
import { createNotification, createNotificationsForUsers, getMarketParticipantIds } from '../lib/notifications.js';
import { fetchOnChainMarketFinalPrices } from '../lib/sync-onchain.js';
import { isValidSolanaAddress, loadKeeperKeypair } from '../lib/solana.js';
import {
  getCronSecretToken,
  getInactiveMarketCandidates,
  terminateInactiveMarkets,
} from '../lib/keeper/terminate-inactive.js';
import { getWalletAuthHeaders, verifyWalletAuth, getAuthContext } from '../lib/auth.js';
import { requireAuth, tryAuth, requireSystemAuth, AuthError } from '../lib/auth-middleware.js';
import { logger } from '../lib/logger.js';
import { toScaled } from '@catallaxyz/shared';

const ORDERBOOK_CACHE_TTL_MS = 5_000;

async function requireCronSecret(request: FastifyRequest, reply: any) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    reply.code(500).send({ error: 'CRON_SECRET is not configured' });
    return false;
  }
  if (getCronSecretToken(request.headers as any) !== cronSecret) {
    reply.code(401).send({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

async function notifyMarketStatusChange(
  supabase: ReturnType<typeof createServerClient>,
  market: any,
  status: string
) {
  const participantIds = await getMarketParticipantIds(market.id, supabase);
  if (market.creator_id) {
    participantIds.push(market.creator_id);
  }

  const uniqueUserIds = Array.from(new Set(participantIds));
  if (uniqueUserIds.length === 0) return;

  let title = 'Market status update';
  let message = market.title ? `Market "${market.title}" status updated` : 'Market status updated';

  if (status === 'settled') {
    title = 'Market settled';
    message = market.title
      ? `Market "${market.title}" has settled. You can redeem now.`
      : 'Market settled. You can redeem now.';
  } else if (status === 'cancelled' || status === 'closed' || status === 'terminated') {
    title = 'Market terminated';
    message = market.title
      ? `Market "${market.title}" has terminated`
      : 'Market has terminated';
  }

  await createNotificationsForUsers(
    uniqueUserIds,
    {
      type: 'settlement',
      title,
      message,
      marketId: market.id,
    },
    supabase
  );
}

export default async function marketsRoutes(app: FastifyInstance) {
  app.get('/markets', async (request, reply) => {
    try {
      const supabase = createServerClient();
      const query = request.query as Record<string, string | undefined>;

      const status = query.status;
      const creatorWallet = query.creator;
      const category = query.category;
      const frequency = query.frequency;
      const limit = parseInt(query.limit || '50', 10);
      const offset = parseInt(query.offset || '0', 10);
      const sort = query.sort || 'created_at';

      const cacheKey = buildCacheKey('markets:list', {
        status: status ?? null,
        creatorWallet: creatorWallet ?? null,
        category: category ?? null,
        frequency: frequency ?? null,
        limit,
        offset,
        sort,
      });
      const cached = getCache(cacheKey);
      if (cached) {
        return reply.send(cached);
      }

      let dbQuery = supabase
        .from('markets')
        .select(
          `
        *,
        creator:creator_id (
          id,
          wallet_address,
          username,
          avatar_url
        )
      `
        );

      if (status) {
        dbQuery = dbQuery.eq('status', status);
      }

      if (category && category !== 'all') {
        dbQuery = dbQuery.eq('category', category);
      }

      if (frequency && frequency !== 'all') {
        dbQuery = dbQuery.eq('frequency', frequency);
      }

      if (creatorWallet) {
        const { data: creator } = await supabase
          .from('users')
          .select('id')
          .eq('wallet_address', creatorWallet)
          .single();

        if (creator) {
          dbQuery = dbQuery.eq('creator_id', creator.id);
        }
      }

      // Handle different sort options
      switch (sort) {
        case 'tip':
        case 'tip_amount':
        case 'bounty':
          dbQuery = dbQuery
            .order('tip_amount', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });
          break;
        case 'volume_24h':
          dbQuery = dbQuery
            .order('volume_24h', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });
          break;
        case 'total_volume':
        case 'volume':
          dbQuery = dbQuery
            .order('total_volume', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });
          break;
        case 'liquidity':
          dbQuery = dbQuery
            .order('liquidity', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });
          break;
        case 'oldest':
          dbQuery = dbQuery.order('created_at', { ascending: true });
          break;
        case 'newest':
        default:
          dbQuery = dbQuery.order('created_at', { ascending: false });
          break;
      }

      dbQuery = dbQuery.range(offset, offset + limit - 1);

      const { data: markets, error } = await dbQuery;

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      const marketsWithStats = (markets || []).map((market: any) => {
        const yesProbability =
          market.probability ?? market.current_yes_price ?? null;
        const noProbability =
          market.current_no_price ??
          (yesProbability !== null ? 1 - yesProbability : null);
        return {
          ...market,
          stats: {
            total_stakes: market.open_interest ?? 0,
            total_staked_amount: 0,
            total_volume: market.total_volume ?? 0,
            total_trades: market.total_trades ?? 0,
            yes_probability: yesProbability,
            no_probability: noProbability,
            participants_count: market.participants_count ?? 0,
          },
        };
      });

      const response = {
        success: true,
        data: {
          markets: marketsWithStats,
          pagination: {
            limit,
            offset,
            total: marketsWithStats.length,
          },
        },
      };

      setCache(cacheKey, response, 30_000);

      return reply.send(response);
    } catch (error: any) {
      logger.error('markets/list', 'Error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.post('/markets', {
    config: {
      rateLimit: {
        max: Number(process.env.MARKET_CREATE_RATE_LIMIT_MAX || 10),
        timeWindow: Number(process.env.MARKET_CREATE_RATE_LIMIT_WINDOW_MS || 60_000),
      },
    },
  }, async (request, reply) => {
    try {
      const supabase = createServerClient();
      const body = request.body as Record<string, any>;

      const {
        walletAddress,
        title,
        description,
        question,
        solanaMarketAccount,
        switchboardQueue,
        randomnessAccount,
        rentPaid,
        platformFee,
      } = body;

      if (!walletAddress || !title || !question) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Missing required fields: walletAddress, title, question',
          },
        });
      }
      if (!isValidSolanaAddress(walletAddress)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid wallet address' },
        });
      }

      // SECURITY FIX: Require authentication and verify wallet ownership
      const auth = await getAuthContext({ request, supabase });
      if (auth.walletAddress !== walletAddress) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Wallet address mismatch' },
        });
      }

      const { data: creator, error: creatorError } = await supabase
        .from('users')
        .select('id, total_markets_created')
        .eq('wallet_address', walletAddress)
        .single();

      if (creatorError || !creator) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Creator user not found. Please authenticate first.',
          },
        });
      }

      const { data: market, error: insertError } = await supabase
        .from('markets')
        .insert([
          {
            creator_id: creator.id,
            title,
            description: description || null,
            question,
            solana_market_account: solanaMarketAccount || null,
            switchboard_queue: switchboardQueue || null,
            randomness_account: randomnessAccount || null,
            rent_paid: rentPaid || null,
            platform_fee: platformFee || null,
            status: 'active',
          },
        ])
        .select()
        .single();

      if (insertError) {
        logger.error('markets/create', 'Error creating market', insertError);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: insertError.message },
        });
      }

      await supabase
        .from('users')
        .update({
          total_markets_created: (creator.total_markets_created ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', creator.id);

      await createNotification(
        {
          userId: creator.id,
          type: 'system',
          title: 'Market created',
          message: `Your market "${title}" is live.`,
          marketId: market.id,
        },
        supabase
      ).catch(() => null);

      return reply.send({
        success: true,
        data: market,
      });
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: error.message || 'Authentication required' },
        });
      }
      logger.error('markets/create', 'Error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.get('/markets/redeemable', async (request, reply) => {
    try {
      const query = request.query as Record<string, string | undefined>;
      const walletAddress = query.wallet;

      if (!walletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'wallet is required' },
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

      const { data: walletUser } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', walletAddress)
        .single();
      const userId = walletUser?.id || null;

      if (!userId) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      const { data: stakes, error: stakesError } = await supabase
        .from('stakes')
        .select('market_id, outcome_type, amount')
        .eq('user_id', userId)
        .gt('amount', 0);

      if (stakesError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: stakesError.message },
        });
      }

      const marketIds = Array.from(new Set((stakes || []).map((s: any) => s.market_id)));
      if (marketIds.length === 0) {
        return reply.send({ success: true, data: [] });
      }

      const { data: markets, error: marketsError } = await supabase
        .from('markets')
        .select(
          [
            'id',
            'title',
            'status',
            'can_redeem',
            'is_randomly_terminated',
            'winning_outcome',
            'final_yes_price',
            'final_no_price',
            'current_yes_price',
            'current_no_price',
            'termination_triggered_at',
            'settled_at',
            'solana_market_account',
            'market_usdc_vault',
          ].join(', ')
        )
        .in('id', marketIds);

      if (marketsError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: marketsError.message },
        });
      }

      if (markets?.length) {
        for (const marketData of markets) {
          const market = marketData as any;
          if (
            market?.solana_market_account &&
            (market.final_yes_price == null || market.final_no_price == null) &&
            (market.can_redeem || market.status === 'settled' || market.status === 'terminated')
          ) {
            const onChain = await fetchOnChainMarketFinalPrices(market.solana_market_account);
            if (!onChain) continue;

            const updates: Record<string, any> = {
              updated_at: new Date().toISOString(),
            };

            if (onChain.finalYesPrice != null) {
              updates.final_yes_price = onChain.finalYesPrice;
            }
            if (onChain.finalNoPrice != null) {
              updates.final_no_price = onChain.finalNoPrice;
            }
            updates.can_redeem = onChain.canRedeem;
            updates.is_randomly_terminated = onChain.isRandomlyTerminated;

            if (Object.keys(updates).length > 1) {
              await supabase.from('markets').update(updates).eq('id', market.id);
              market.final_yes_price = updates.final_yes_price ?? market.final_yes_price;
              market.final_no_price = updates.final_no_price ?? market.final_no_price;
              market.can_redeem = updates.can_redeem ?? market.can_redeem;
              market.is_randomly_terminated =
                updates.is_randomly_terminated ?? market.is_randomly_terminated;
            }
          }
        }
      }

      const marketById = new Map((markets || []).map((m: any) => [m.id, m]));
      const positions: Record<string, any> = {};

      for (const stake of stakes || []) {
        const market = marketById.get((stake as any).market_id);
        if (!market) continue;
        if (!market.can_redeem && market.status !== 'settled' && market.status !== 'terminated') {
          continue;
        }

        if (!positions[market.id]) {
          const storedYesPrice =
            typeof market.final_yes_price === 'number'
              ? market.final_yes_price
              : typeof market.current_yes_price === 'number'
              ? market.current_yes_price
              : null;
          const storedNoPrice =
            typeof market.final_no_price === 'number'
              ? market.final_no_price
              : typeof market.current_no_price === 'number'
              ? market.current_no_price
              : null;

          const finalYesPrice =
            typeof storedYesPrice === 'number'
              ? storedYesPrice
              : typeof storedNoPrice === 'number'
              ? 1 - storedNoPrice
              : market.winning_outcome === 'yes'
              ? 1
              : market.winning_outcome === 'no'
              ? 0
              : 0.5;
          const finalNoPrice =
            typeof storedNoPrice === 'number'
              ? storedNoPrice
              : typeof storedYesPrice === 'number'
              ? 1 - storedYesPrice
              : market.winning_outcome === 'no'
              ? 1
              : market.winning_outcome === 'yes'
              ? 0
              : 0.5;

          positions[market.id] = {
            marketId: market.id,
            marketAddress: market.solana_market_account || null,
            marketTitle: market.title,
            yesTokens: 0,
            noTokens: 0,
            finalYesPrice,
            finalNoPrice,
            terminatedAt: market.termination_triggered_at || market.settled_at || null,
            isRandomlyTerminated: !!market.is_randomly_terminated,
            canRedeem: !!market.can_redeem,
            status: market.status,
            winningOutcome: market.winning_outcome || null,
            marketUsdcVault: market.market_usdc_vault || null,
          };
        }

        if ((stake as any).outcome_type === 'yes') {
          positions[market.id].yesTokens += Number((stake as any).amount) / 1e6;
        } else if ((stake as any).outcome_type === 'no') {
          positions[market.id].noTokens += Number((stake as any).amount) / 1e6;
        }
      }

      const data = Object.values(positions).filter((p: any) => p.yesTokens > 0 || p.noTokens > 0);

      return reply.send({ success: true, data });
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: error.message || 'Authentication required' },
        });
      }
      logger.error('markets/redeemable', 'Error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.post('/markets/terminate-inactive', async (request, reply) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return reply.code(500).send({ error: 'CRON_SECRET is not configured' });
    }
    if (getCronSecretToken(request.headers as any) !== cronSecret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    try {
      const supabase = createServerClient();
      const result = await terminateInactiveMarkets(supabase);
      return reply.send({
        success: true,
        data: {
          terminatedCount: result.terminated,
          skippedCount: result.skipped,
          results: result.results,
          message:
            result.terminated > 0
              ? `Successfully terminated ${result.terminated} inactive market(s)`
              : 'No markets needed termination',
        },
      });
    } catch (error: any) {
      logger.error('markets/terminate-inactive', 'Error in POST', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.get('/markets/terminate-inactive', async (_request, reply) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return reply.code(500).send({ error: 'CRON_SECRET is not configured' });
    }
    if (getCronSecretToken(_request.headers as any) !== cronSecret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    try {
      const supabase = createServerClient();
      const candidates = await getInactiveMarketCandidates(supabase);
      const shouldTerminate = candidates.map((market) => ({
        marketId: market.id,
        title: market.title,
        status: market.status,
        lastTradeAt: market.last_trade_at,
        shouldTerminate: true,
        daysInactive: market.daysInactive,
        reason: `Inactive for ${market.daysInactive} day(s)`,
      }));

      return reply.send({
        success: true,
        data: {
          totalMarkets: candidates.length,
          marketsToTerminate: shouldTerminate.length,
          markets: shouldTerminate,
          allChecks: shouldTerminate,
        },
      });
    } catch (error: any) {
      logger.error('markets/terminate-inactive', 'Error in GET', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.post('/markets/sync-fee-split', async (request, reply) => {
    // SECURITY FIX: Require CRON_SECRET for system operations
    if (!(await requireCronSecret(request, reply))) {
      return;
    }

    try {
      const body = request.body as Record<string, any>;
      const supabase = createServerClient();
      const { data: config } = await supabase
        .from('platform_settings')
        .select(
          'platform_fee_rate, maker_rebate_rate, creator_incentive_rate, center_taker_fee_rate, extreme_taker_fee_rate'
        )
        .eq('key', 'fee_config')
        .single();

      const platformRate = Number(config?.platform_fee_rate ?? 0.75);
      const makerRate = Number(config?.maker_rebate_rate ?? 0.2);
      const creatorRate = Number(config?.creator_incentive_rate ?? 0.05);

      const rpcUrl =
        process.env.SOLANA_RPC_URL ||
        'https://api.devnet.solana.com';
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
          centerTakerFeeRate: toScaled(Number(config?.center_taker_fee_rate ?? 0.032)),
          extremeTakerFeeRate: toScaled(Number(config?.extreme_taker_fee_rate ?? 0.002)),
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
        data: { platformRate, makerRate, creatorRate },
      });
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.get('/markets/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const supabase = createServerClient();

      const { data: market, error: marketError } = await supabase
        .from('markets')
        .select(
          `
        *,
        creator:creator_id (
          id,
          wallet_address,
          username,
          avatar,
          bio
        )
      `
        )
        .eq('id', id)
        .single();

      if (marketError || !market) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Market not found' },
        });
      }

      const yesProbability =
        (market as any).probability ?? (market as any).current_yes_price ?? null;
      const noProbability =
        (market as any).current_no_price ??
        (yesProbability !== null ? 1 - yesProbability : null);
      // Use new trades table instead of deprecated trade_records
      const { data: recentTrades } = await supabase
        .from('trades')
        .select(
          `
        *,
        user:user_id (wallet_address, username, avatar_url),
        maker:maker_user_id (wallet_address, username, avatar_url),
        taker:taker_user_id (wallet_address, username, avatar_url)
      `
        )
        .eq('market_id', id)
        .order('block_time', { ascending: false })
        .limit(10);

      const { data: activeOrders } = await supabase
        .from('orders')
        .select(
          `
        *,
        user:user_id (wallet_address, username, avatar)
      `
        )
        .eq('market_id', id)
        .in('status', ['open', 'partial'])
        .order('created_at', { ascending: false })
        .limit(20);

      const { data: settlements } = await supabase
        .from('market_settlements')
        .select('id, market_id, settlement_index, winning_outcome, winning_probability, yes_price, no_price, total_payout, settled_at, created_at')
        .eq('market_id', id)
        .order('settlement_index', { ascending: false });

      return reply.send({
        success: true,
        data: {
          market,
          stats: {
            total_stakes: (market as any).open_interest ?? 0,
            total_staked_amount: 0,
            total_volume: (market as any).total_volume ?? 0,
            total_trades: (market as any).total_trades ?? 0,
            yes_probability: yesProbability,
            no_probability: noProbability,
            participants_count: (market as any).participants_count ?? 0,
          },
          recentTrades: recentTrades || [],
          activeOrders: activeOrders || [],
          settlements: settlements || [],
        },
      });
    } catch (error: any) {
      logger.error('markets/get', 'Error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.patch('/markets/:id', async (request, reply) => {
    try {
      if (!(await requireCronSecret(request, reply))) {
        return;
      }
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;
      const supabase = createServerClient();

      const { status, currentSettlementIndex, lastCheckedSlot } = body;

      const { data: market, error: marketError } = await supabase
        .from('markets')
        .select('id, title, status, creator_id, current_settlement_index, last_checked_slot')
        .eq('id', id)
        .single();

      if (marketError || !market) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Market not found' },
        });
      }

      const updateData: Record<string, any> = {};

      if (status) {
        if (!['active', 'settled', 'closed'].includes(status)) {
          return reply.code(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Invalid status' },
          });
        }
        updateData.status = status;
      }

      if (currentSettlementIndex !== undefined) {
        updateData.current_settlement_index = currentSettlementIndex;
      }

      if (lastCheckedSlot !== undefined) {
        updateData.last_checked_slot = lastCheckedSlot;
      }

      const { data: updatedMarket, error: updateError } = await supabase
        .from('markets')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: updateError.message },
        });
      }

      return reply.send({
        success: true,
        data: updatedMarket,
      });
    } catch (error: any) {
      logger.error('markets/patch', 'Error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.patch('/markets/:id/status', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;
      const { status, isPaused, pausedReason, creatorId } = body;

      if (!id) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Market ID is required' },
        });
      }

      const validStatuses = ['active', 'paused', 'running', 'settled', 'closed', 'cancelled'];
      if (status && !validStatuses.includes(status)) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          },
        });
      }

      const supabase = createServerClient();
      const authUser = await requireAuth(request, supabase);
      const { data: market, error: fetchError } = await supabase
        .from('markets')
        .select('id, creator_id, title, status')
        .eq('id', id)
        .single();

      if (fetchError || !market) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Market not found' },
        });
      }

      if (creatorId && market.creator_id !== creatorId) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only the market creator can update the status' },
        });
      }
      if (authUser.userId !== market.creator_id) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only the market creator can update the status' },
        });
      }

      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (status !== undefined) {
        updateData.status = status;

        if (status === 'settled') {
          updateData.settled_at = new Date().toISOString();
        } else if (status === 'paused') {
          updateData.is_paused = true;
          updateData.paused_at = new Date().toISOString();
          if (pausedReason) {
            updateData.paused_reason = pausedReason;
          }
        } else if (status === 'running' || status === 'active') {
          updateData.is_paused = false;
          updateData.paused_at = null;
          updateData.paused_reason = null;
        }
      }

      if (isPaused !== undefined) {
        updateData.is_paused = isPaused;
        if (isPaused) {
          updateData.paused_at = new Date().toISOString();
          if (pausedReason) {
            updateData.paused_reason = pausedReason;
          }
        } else {
          updateData.paused_at = null;
          updateData.paused_reason = null;
        }
      }

      const { data: updatedMarket, error: updateError } = await supabase
        .from('markets')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        logger.error('markets/status', 'Update error', updateError);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: updateError.message },
        });
      }

      if (status && ['settled', 'closed', 'cancelled', 'terminated'].includes(status)) {
        await notifyMarketStatusChange(supabase, updatedMarket, status);
      }

      return reply.send({
        success: true,
        data: {
          id: updatedMarket.id,
          status: updatedMarket.status,
          isPaused: updatedMarket.is_paused,
          pausedAt: updatedMarket.paused_at,
          pausedReason: updatedMarket.paused_reason,
          settledAt: updatedMarket.settled_at,
          updatedAt: updatedMarket.updated_at,
        },
      });
    } catch (error: any) {
      logger.error('markets/status', 'Unexpected error', error);
      if (error?.statusCode) {
        return reply.code(error.statusCode).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: error.message || 'Unauthorized' },
        });
      }
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error.message || 'Internal server error',
        },
      });
    }
  });

  app.get('/markets/:id/status', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      if (!id) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Market ID is required' },
        });
      }

      const supabase = createServerClient();

      const { data: market, error } = await supabase
        .from('markets')
        .select('id, status, is_paused, paused_at, paused_reason, created_at, updated_at, settled_at, expires_at')
        .eq('id', id)
        .single();

      if (error || !market) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Market not found' },
        });
      }

      return reply.send({
        success: true,
        data: {
          id: market.id,
          status: market.status,
          isPaused: market.is_paused,
          pausedAt: market.paused_at,
          pausedReason: market.paused_reason,
          createdAt: market.created_at,
          updatedAt: market.updated_at,
          settledAt: market.settled_at,
          expiresAt: market.expires_at,
        },
      });
    } catch (error: any) {
      logger.error('markets/status', 'Unexpected error in GET', error);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error.message || 'Internal server error',
        },
      });
    }
  });

  app.get('/markets/:id/orderbook', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, string | undefined>;
      const questionIndex = query.questionIndex;
      const outcomeType = query.outcomeType;

      if (!id) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Market ID is required' },
        });
      }

      const cacheKey = buildCacheKey('markets:orderbook', {
        id,
        questionIndex: questionIndex ?? null,
        outcomeType: outcomeType ?? null,
      });
      const cached = getCache(cacheKey);
      if (cached) {
        return reply.send(cached);
      }

      const supabase = createServerClient();

      let dbQuery = supabase
        .from('orderbook_depth')
        .select('market_id, outcome_type, side, price, total_size, order_count, updated_at')
        .eq('market_id', id)
        .order('side', { ascending: true });

      if (questionIndex !== undefined) {
        dbQuery = dbQuery.eq('question_index', parseInt(questionIndex, 10));
      }

      if (outcomeType) {
        dbQuery = dbQuery.eq('outcome_type', outcomeType);
      }

      const { data: depth, error: depthError } = await dbQuery;

      if (depthError) {
        logger.error('markets/orderbook', 'Depth error', depthError);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: depthError.message },
        });
      }

      const buyOrders = (depth || [])
        .filter((d: any) => d.side === 'buy')
        .sort((a: any, b: any) => parseFloat(b.price) - parseFloat(a.price));

      const sellOrders = (depth || [])
        .filter((d: any) => d.side === 'sell')
        .sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price));

      let spread = null;
      let spreadPercentage = null;
      if (buyOrders.length > 0 && sellOrders.length > 0) {
        const bestBid = parseFloat(buyOrders[0].price);
        const bestAsk = parseFloat(sellOrders[0].price);
        spread = bestAsk - bestBid;
        spreadPercentage = (spread / bestAsk) * 100;
      }

      const response = {
        success: true,
        data: {
          marketId: id,
          questionIndex: questionIndex ? parseInt(questionIndex, 10) : null,
          outcomeType,
          bids: buyOrders.map((order: any) => ({
            price: parseFloat(order.price),
            amount: order.total_amount?.toString() || '0',
            numOrders: order.num_orders || 0,
          })),
          asks: sellOrders.map((order: any) => ({
            price: parseFloat(order.price),
            amount: order.total_amount?.toString() || '0',
            numOrders: order.num_orders || 0,
          })),
          spread,
          spreadPercentage,
          lastUpdated: new Date().toISOString(),
        },
      };

      setCache(cacheKey, response, ORDERBOOK_CACHE_TTL_MS);
      return reply.send(response);
    } catch (error: any) {
      logger.error('markets/orderbook', 'Unexpected error', error);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error.message || 'Internal server error',
        },
      });
    }
  });

  app.post('/markets/:id/settle', async (request, reply) => {
    try {
      if (!(await requireCronSecret(request, reply))) {
        return;
      }
      const { id } = request.params as { id: string };
      const supabase = createServerClient();

      const { data: market, error: marketError } = await supabase
        .from('markets')
        .select('id, title, status, creator_id, solana_market_account, last_trade_at, created_at')
        .eq('id', id)
        .single();

      if (marketError || !market) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Market not found' },
        });
      }

      interface TerminationCheckResult {
        should_terminate: boolean;
        termination_reason: string;
        days_inactive: number;
        last_trade_price: number | null;
        termination_status?: string;
        market_id?: string;
        settlement_price?: number;
      }

      const { data: terminationCheckData, error: checkError } = await supabase
        .rpc('check_and_terminate_inactive_market', { p_market_id: id })
        .single();

      if (checkError) {
        logger.error('markets/terminate', 'Error checking termination', checkError);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: 'Failed to check market termination' },
        });
      }

      const terminationCheck = terminationCheckData as TerminationCheckResult;

      if (!terminationCheck.should_terminate) {
        return reply.code(403).send({
          success: false,
          error: {
            code: 'TERMINATION_NOT_ALLOWED',
            message: terminationCheck.termination_reason,
            details: {
              daysInactive: terminationCheck.days_inactive,
              lastPrice: terminationCheck.last_trade_price,
            },
          },
        });
      }

      const terminationRecord = {
        market_id: id,
        settlement_type: 'auto_terminated',
        settlement_index: 0,
        last_trader_id: null,
        total_payout: 0,
        settled_at: new Date().toISOString(),
      };

      const { data: settlement, error: settlementError } = await supabase
        .from('market_settlements')
        .insert([terminationRecord])
        .select()
        .single();

      if (settlementError) {
        logger.error('markets/terminate', 'Error creating termination record', settlementError);
      }

      const lastPrice =
        typeof terminationCheck.last_trade_price === 'number'
          ? terminationCheck.last_trade_price
          : 0.5;

      await supabase
        .from('markets')
        .update({
          status: 'terminated',
          can_redeem: true,
          is_randomly_terminated: false,
          final_yes_price: lastPrice,
          final_no_price: 1 - lastPrice,
          termination_triggered_at: new Date().toISOString(),
          settled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      return reply.send({
        success: true,
        data: {
          terminated: true,
          daysInactive: terminationCheck.days_inactive,
          lastPrice: terminationCheck.last_trade_price,
          terminationReason: terminationCheck.termination_reason,
          redemptionInfo: {
            message: 'Users can now redeem tokens at the last trade price',
            lastPrice: terminationCheck.last_trade_price,
            yesRedemptionValue: terminationCheck.last_trade_price,
            noRedemptionValue: 1 - (terminationCheck.last_trade_price || 0.5),
          },
          settlement,
        },
      });
    } catch (error: any) {
      logger.error('markets/terminate', 'Error in POST', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.get('/markets/:id/settle', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const supabase = createServerClient();

      const { data: terminationCheck, error: checkError } = await supabase
        .rpc('check_and_terminate_inactive_market', { p_market_id: id })
        .single();

      if (checkError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: checkError.message },
        });
      }

      return reply.send({
        success: true,
        data: terminationCheck,
      });
    } catch (error: any) {
      logger.error('markets/terminate', 'Error in GET', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.post('/markets/:id/termination/random', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;
      const {
        walletAddress,
        transactionSignature,
        slot,
        lastTradeYesPrice,
        lastTradeNoPrice,
        settlementProbability,
      } = body;

      if (
        !walletAddress ||
        !transactionSignature ||
        slot == null ||
        lastTradeYesPrice == null ||
        lastTradeNoPrice == null
      ) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message:
              'walletAddress, transactionSignature, slot, lastTradeYesPrice, and lastTradeNoPrice are required',
          },
        });
      }

      const supabase = createServerClient();

      // SECURITY FIX: Require wallet signature verification
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
      } catch (authError: any) {
        return reply.code(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: authError.message || 'Invalid wallet signature' },
        });
      }

      if (walletHeaders.address !== walletAddress) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Wallet address mismatch' },
        });
      }

      const { data: market, error: marketError } = await supabase
        .from('markets')
        .select('id, title, creator_id')
        .eq('id', id)
        .single();

      if (marketError || !market) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Market not found' },
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

      const { data: existingSettlement } = await supabase
        .from('market_settlements')
        .select('id, market_id, settlement_type, winning_outcome, settlement_probability, transaction_signature, created_at')
        .eq('transaction_signature', transactionSignature)
        .single();

      if (existingSettlement) {
        return reply.send({ success: true, data: existingSettlement, alreadyRecorded: true });
      }

      const yesPrice = Number(lastTradeYesPrice);
      const noPrice = Number(lastTradeNoPrice);
      const winningOutcome = yesPrice >= noPrice ? 'yes' : 'no';

      const { data: settlement, error: settlementError } = await supabase
        .from('market_settlements')
        .insert([
          {
            market_id: id,
            settlement_type: 'random_vrf',
            winning_outcome: winningOutcome,
            settlement_probability: settlementProbability ?? null,
            last_trader_id: user.id,
            total_payout: 0,
            transaction_signature: transactionSignature,
            slot,
            settled_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (settlementError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: settlementError.message },
        });
      }

      await supabase
        .from('markets')
        .update({
          status: 'terminated',
          can_redeem: true,
          is_randomly_terminated: true,
          final_yes_price: yesPrice,
          final_no_price: noPrice,
          termination_triggered_at: new Date().toISOString(),
          settled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      try {
        await supabase.rpc('increment_user_terminations', { user_id: user.id });
      } catch { /* Ignore RPC errors */ }

      await notifyMarketStatusChange(supabase, { ...market, title: market.title }, 'settled');

      return reply.send({ success: true, data: settlement });
    } catch (error: any) {
      logger.error('markets/termination/random', 'Error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });
}
