/**
 * Global State Sync Service
 * 
 * Syncs the on-chain Global account to the database.
 * This includes fee configuration, operators, and trading status.
 */

import { PublicKey, Connection } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';
import { PoolClient } from 'pg';
import { validateServiceEnv } from './utils/env-validation';
import { createLogger } from './utils/logger';
import { transactionWithRetry } from './utils/db-retry';
import { createPool, closePool } from './utils/db-pool';
import IDL from '../target/idl/catallaxyz.json' with { type: 'json' };

const logger = createLogger('sync-global');

// Validate environment
validateServiceEnv('syncGlobal');

const pool = createPool();

// Program ID
const programIdStr = process.env.NEXT_PUBLIC_PROGRAM_ID;
if (!programIdStr) {
  throw new Error('NEXT_PUBLIC_PROGRAM_ID environment variable is required');
}
const PROGRAM_ID = new PublicKey(programIdStr);

// Derive Global PDA
function deriveGlobalPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    PROGRAM_ID
  );
  return pda;
}

function getConnection(): Connection {
  const rpcUrl = process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com';
  return new Connection(rpcUrl, 'confirmed');
}

function getReadOnlyProgram(): Program {
  const connection = getConnection();
  const wallet = new Wallet(Keypair.generate());
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  return new Program(IDL as any, provider);
}

interface GlobalAccount {
  authority: PublicKey;
  usdcMint: PublicKey;
  keeper: PublicKey;
  bump: number;
  platformTreasuryBump: number;
  totalTradingFeesCollected: bigint;
  totalCreationFeesCollected: bigint;
  centerTakerFeeRate: number;
  extremeTakerFeeRate: number;
  platformFeeRate: number;
  makerRebateRate: number;
  creatorIncentiveRate: number;
  tradingPaused: boolean;
  operatorCount: number;
  operators: PublicKey[];
}

async function fetchGlobalAccount(): Promise<GlobalAccount | null> {
  try {
    const program = getReadOnlyProgram();
    const globalPda = deriveGlobalPda();
    
    const global = await (program.account as any).global.fetch(globalPda);
    
    return {
      authority: global.authority,
      usdcMint: global.usdcMint,
      keeper: global.keeper,
      bump: global.bump,
      platformTreasuryBump: global.platformTreasuryBump,
      totalTradingFeesCollected: BigInt(global.totalTradingFeesCollected?.toString() || '0'),
      totalCreationFeesCollected: BigInt(global.totalCreationFeesCollected?.toString() || '0'),
      centerTakerFeeRate: Number(global.centerTakerFeeRate || 0),
      extremeTakerFeeRate: Number(global.extremeTakerFeeRate || 0),
      platformFeeRate: Number(global.platformFeeRate || 0),
      makerRebateRate: Number(global.makerRebateRate || 0),
      creatorIncentiveRate: Number(global.creatorIncentiveRate || 0),
      tradingPaused: Boolean(global.tradingPaused),
      operatorCount: Number(global.operatorCount || 0),
      operators: (global.operators || []).filter((op: PublicKey) => !op.equals(PublicKey.default)),
    };
  } catch (err) {
    logger.error('Failed to fetch Global account', err);
    return null;
  }
}

async function upsertGlobalState(client: PoolClient, global: GlobalAccount, slot: number): Promise<void> {
  const operatorAddresses = global.operators.map(op => op.toString());
  
  // Check if global_state exists
  const existing = await client.query(`SELECT id FROM public.global_state LIMIT 1`);
  
  if (existing.rows.length === 0) {
    // Insert new
    await client.query(
      `INSERT INTO public.global_state 
       (authority, usdc_mint, keeper, center_taker_fee_rate, extreme_taker_fee_rate, 
        platform_fee_rate, maker_rebate_rate, creator_incentive_rate,
        total_trading_fees_collected, total_creation_fees_collected,
        operator_count, operators, trading_paused, last_synced_slot, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
      [
        global.authority.toString(),
        global.usdcMint.toString(),
        global.keeper.toString(),
        global.centerTakerFeeRate,
        global.extremeTakerFeeRate,
        global.platformFeeRate,
        global.makerRebateRate,
        global.creatorIncentiveRate,
        global.totalTradingFeesCollected.toString(),
        global.totalCreationFeesCollected.toString(),
        global.operatorCount,
        operatorAddresses,
        global.tradingPaused,
        slot,
      ]
    );
  } else {
    // Update existing
    await client.query(
      `UPDATE public.global_state SET
         authority = $1,
         usdc_mint = $2,
         keeper = $3,
         center_taker_fee_rate = $4,
         extreme_taker_fee_rate = $5,
         platform_fee_rate = $6,
         maker_rebate_rate = $7,
         creator_incentive_rate = $8,
         total_trading_fees_collected = $9,
         total_creation_fees_collected = $10,
         operator_count = $11,
         operators = $12,
         trading_paused = $13,
         last_synced_slot = $14,
         last_synced_at = NOW(),
         updated_at = NOW()`,
      [
        global.authority.toString(),
        global.usdcMint.toString(),
        global.keeper.toString(),
        global.centerTakerFeeRate,
        global.extremeTakerFeeRate,
        global.platformFeeRate,
        global.makerRebateRate,
        global.creatorIncentiveRate,
        global.totalTradingFeesCollected.toString(),
        global.totalCreationFeesCollected.toString(),
        global.operatorCount,
        operatorAddresses,
        global.tradingPaused,
        slot,
      ]
    );
  }
  
  // Also update platform_settings for backward compatibility
  await client.query(
    `UPDATE public.platform_settings SET
       platform_fee_rate = $1,
       maker_rebate_rate = $2,
       creator_incentive_rate = $3,
       center_taker_fee_rate = $4,
       extreme_taker_fee_rate = $5,
       updated_at = NOW()
     WHERE key = 'fee_config'`,
    [
      global.platformFeeRate / 1_000_000,
      global.makerRebateRate / 1_000_000,
      global.creatorIncentiveRate / 1_000_000,
      global.centerTakerFeeRate / 1_000_000,
      global.extremeTakerFeeRate / 1_000_000,
    ]
  );
}

async function main() {
  if (!pool) {
    throw new Error('Missing DATABASE_URL');
  }

  logger.info('Starting Global state sync');
  
  // Get current slot
  const connection = getConnection();
  const slot = await connection.getSlot();
  
  // Fetch global account
  const global = await fetchGlobalAccount();
  
  if (!global) {
    logger.error('Failed to fetch Global account');
    process.exit(1);
  }
  
  logger.info('Fetched Global account', {
    authority: global.authority.toString(),
    tradingPaused: global.tradingPaused,
    operatorCount: global.operatorCount,
    centerTakerFeeRate: global.centerTakerFeeRate,
  });
  
  // Sync to database
  await transactionWithRetry(
    pool,
    async (client) => {
      await upsertGlobalState(client, global, slot);
    },
    {
      operation: 'sync-global',
      maxRetries: 3,
      initialDelayMs: 500,
    }
  );
  
  logger.info('Global state synced successfully');
}

main()
  .then(() => closePool(pool))
  .catch(async (err) => {
    logger.error('Global sync failed', err);
    await closePool(pool);
    process.exit(1);
  });
