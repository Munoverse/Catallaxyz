import { PublicKey } from '@solana/web3.js';
import { PoolClient } from 'pg';
import { getProgram, MarketAccount } from './utils/termination';
import { validateServiceEnv, parseBool, isValidSolanaAddress } from './utils/env-validation';
import { syncMarketsLogger as logger } from './utils/logger';
// AUDIT FIX v1.2.1: Use centralized database utilities
import { transactionWithRetry } from './utils/db-retry';
import { createPool, closePool } from './utils/db-pool';

// AUDIT FIX: Validate environment variables at startup
const envConfig = validateServiceEnv('syncMarkets');
logger.info('Service initialized', { config: envConfig });

// AUDIT FIX: Environment variable for strict transaction mode
// When true, any single market failure will rollback the entire sync
const STRICT_SYNC = parseBool('STRICT_SYNC', false);

// AUDIT FIX v1.2.1: Use centralized pool configuration
const pool = createPool();

const deriveMarketVaultPda = (programId: PublicKey, market: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from('market_vault'), market.toBuffer()], programId)[0];

const mapStatus = (status: number) => {
  if (status === 0) return 'active';
  if (status === 1) return 'settled';
  if (status === 4) return 'terminated';
  return 'active';
};

const toTimestamp = (value?: number | null) => {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
};

// AUDIT FIX v2.1 (MED-20): Import shared ensureUser instead of duplicate implementation
import { ensureUser as sharedEnsureUser } from '../shared/db/helpers';

// Wrapper to add wallet address validation
const ensureUser = async (client: PoolClient, walletAddress: string) => {
  // AUDIT FIX: Validate wallet address format
  if (!isValidSolanaAddress(walletAddress)) {
    throw new Error(`Invalid wallet address: ${walletAddress}`);
  }
  return sharedEnsureUser(client, walletAddress);
};

const upsertMarket = async (
  client: PoolClient,
  payload: {
    creatorId: string | null;
    title: string;
    solanaMarketAccount: string;
    switchboardQueue: string | null;
    randomnessAccount: string | null;
    marketUsdcVault: string | null;
    status: string;
    isPaused: boolean;
    pausedAt: string | null;
    totalTrades: number;
    liquidity: number;
    currentYesPrice: number | null;
    currentNoPrice: number | null;
    lastPrice: number | null;
    createdAt: string | null;
  }
) => {
  await client.query(
    `
    INSERT INTO public.markets
      (creator_id, title, solana_market_account, switchboard_queue, randomness_account, market_usdc_vault,
       status, is_paused, paused_at, total_trades, liquidity, current_yes_price, current_no_price, last_price,
       created_at, updated_at)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15, NOW()), NOW())
    ON CONFLICT (solana_market_account) DO UPDATE SET
      creator_id = EXCLUDED.creator_id,
      title = COALESCE(public.markets.title, EXCLUDED.title),
      switchboard_queue = EXCLUDED.switchboard_queue,
      randomness_account = EXCLUDED.randomness_account,
      market_usdc_vault = EXCLUDED.market_usdc_vault,
      status = EXCLUDED.status,
      is_paused = EXCLUDED.is_paused,
      paused_at = EXCLUDED.paused_at,
      total_trades = EXCLUDED.total_trades,
      liquidity = EXCLUDED.liquidity,
      current_yes_price = EXCLUDED.current_yes_price,
      current_no_price = EXCLUDED.current_no_price,
      last_price = EXCLUDED.last_price,
      updated_at = NOW()
    `,
    [
      payload.creatorId,
      payload.title,
      payload.solanaMarketAccount,
      payload.switchboardQueue,
      payload.randomnessAccount,
      payload.marketUsdcVault,
      payload.status,
      payload.isPaused,
      payload.pausedAt,
      payload.totalTrades,
      payload.liquidity,
      payload.currentYesPrice,
      payload.currentNoPrice,
      payload.lastPrice,
      payload.createdAt,
    ]
  );
};

async function main() {
  if (!pool) {
    throw new Error('Missing DATABASE_URL');
  }

  const { program, programId } = getProgram();
  
  // Fetch markets from Solana
  const markets = await program.account.market.all();
  logger.info('Fetched markets from Solana', { count: markets.length });
  
  // AUDIT FIX v1.1.2: Use transactionWithRetry for database operations
  const result = await transactionWithRetry(
    pool,
    async (client) => {
      let successCount = 0;
      const errors: Array<{ market: string; error: Error }> = [];
      
      for (const item of markets) {
        try {
          // AUDIT FIX: Use proper type assertion with type guard
          const account = item.account as unknown as MarketAccount;
          
          // Validate that the account has the expected structure
          if (!account || typeof account.creator === 'undefined') {
            throw new Error('Invalid market account structure');
          }
          
          const marketKey = item.publicKey;
          const creatorAddress = account.creator?.toString?.();
          const creatorId = creatorAddress ? await ensureUser(client, creatorAddress) : null;
          const vault = deriveMarketVaultPda(programId, marketKey);

          const yesPrice = account.lastTradeYesPrice ? Number(account.lastTradeYesPrice) / 1_000_000 : null;
          const noPrice = account.lastTradeNoPrice ? Number(account.lastTradeNoPrice) / 1_000_000 : null;
          const lastPrice = yesPrice ?? null;

          await upsertMarket(client, {
            creatorId,
            title: `Market ${marketKey.toString().slice(0, 8)}`,
            solanaMarketAccount: marketKey.toString(),
            switchboardQueue: account.switchboardQueue?.toString() ?? null,
            randomnessAccount: account.randomnessAccount?.toString() ?? null,
            marketUsdcVault: vault.toString(),
            status: mapStatus(Number(account.status ?? 0)),
            isPaused: Boolean(account.isPaused),
            pausedAt: account.pausedAt ? toTimestamp(Number(account.pausedAt)) : null,
            totalTrades: Number(account.totalTrades ?? 0),
            liquidity: Number(account.totalPositionCollateral ?? 0),
            currentYesPrice: yesPrice,
            currentNoPrice: noPrice,
            lastPrice,
            createdAt: toTimestamp(Number(account.createdAt)),
          });
          successCount++;
        } catch (err) {
          errors.push({ market: item.publicKey.toString(), error: err as Error });
          // AUDIT FIX: Use structured logging
          logger.error(`Failed to sync market`, err, { marketId: item.publicKey.toString() });
          
          // AUDIT FIX: In strict mode, rollback entire transaction on any failure
          if (STRICT_SYNC) {
            throw new Error(`Strict sync mode: rolling back due to market ${item.publicKey} failure`);
          }
        }
      }
      
      // If no markets synced successfully and we have errors, throw to rollback
      if (successCount === 0 && errors.length > 0) {
        throw new Error('No markets synced successfully');
      }
      
      return { successCount, errors };
    },
    { 
      operation: 'sync-markets',
      maxRetries: 3,
      initialDelayMs: 500,
    }
  );
  
  // Log results
  logger.info('Markets synced successfully', { 
    successCount: result.successCount, 
    totalCount: markets.length,
    failedCount: result.errors.length 
  });
  
  if (result.errors.length > 0) {
    logger.warn(`Failed to sync some markets`, { 
      failedCount: result.errors.length,
      markets: result.errors.map(e => e.market)
    });
  }
}

main()
  .then(() => {
    // AUDIT FIX v1.2.1: Use centralized pool close
    return closePool(pool);
  })
  .catch(async (err) => {
    // AUDIT FIX v1.1.1: Use structured logging
    logger.error('Market sync failed', err);
    // Ensure pool is closed even on error
    await closePool(pool);
    process.exit(1);
  });
