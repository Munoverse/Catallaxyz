/**
 * Settlement Worker
 * Processes on-chain withdrawals
 * 
 * Note: Trade settlement has been migrated to the new exchange system.
 * Users sign their orders with Ed25519, and the operator submits
 * match_orders instruction with user signatures.
 * 
 * @see exchange-executor.ts for trade settlement implementation
 */

import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
} from '@solana/web3.js';
import { getRedisClient, REDIS_KEYS } from '../lib/redis/client.js';
import { createServerClient } from '../lib/supabase.js';
import { loadEnv } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import IDL from '../generated/catallaxyz/catallaxyz.json' with { type: 'json' };

loadEnv();

const BATCH_SIZE = 10;
const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 5;

interface PendingWithdrawal {
  id: string;
  userId: string;
  amount: string;
  destination: string;
  status: string;
  createdAt: string;
  retryCount?: number;
  lastError?: string;
}

/**
 * Get Anchor provider for on-chain operations
 */
function getProvider(): AnchorProvider {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const secretKey = process.env.OPERATOR_SECRET_KEY;
  if (!rpcUrl || !secretKey) {
    throw new Error('Missing SOLANA_RPC_URL or OPERATOR_SECRET_KEY');
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const parsed = JSON.parse(secretKey);
  const payer = Keypair.fromSecretKey(new Uint8Array(parsed));
  const wallet = new anchor.Wallet(payer);
  return new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
}

/**
 * Load the Anchor program
 */
function loadProgram(provider: AnchorProvider): Program {
  const programId = new PublicKey(process.env.PROGRAM_ID || '95QAsSGtGqRPKVWrxEj9GnJcSfWnhxRdYdbeVq5WTEcy');
  return new (Program as any)(IDL, programId, provider) as Program;
}

/**
 * Process pending withdrawals from Redis queue
 */
async function processPendingWithdrawals(): Promise<number> {
  const redis = getRedisClient();
  const supabase = createServerClient();
  if (!redis) return 0;
  if (process.env.WITHDRAWALS_ENABLED !== 'true') {
    return 0;
  }

  let processed = 0;
  const provider = getProvider();
  const program = loadProgram(provider);

  // Pop from withdrawal queue
  for (let i = 0; i < BATCH_SIZE; i++) {
    const item = await redis.lpop(REDIS_KEYS.withdrawals);
    if (!item) break;

    let withdrawal: PendingWithdrawal | null = null;

    try {
      withdrawal = JSON.parse(item);
      if (!withdrawal) continue;

      // Validate withdrawal data
      if (!withdrawal.userId || !withdrawal.amount || !withdrawal.destination) {
        logger.error('settle-worker', 'Invalid withdrawal data', { item });
        continue;
      }

      // Get user's wallet address from database
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('wallet_address')
        .eq('id', withdrawal.userId)
        .single();

      if (userError || !user?.wallet_address) {
        logger.error('settle-worker', 'User not found for withdrawal', { userId: withdrawal.userId });
        continue;
      }

      const userPubkey = new PublicKey(user.wallet_address);
      const destinationPubkey = new PublicKey(withdrawal.destination);
      const usdcMint = new PublicKey(process.env.USDC_MINT_ADDRESS!);

      // Derive PDAs
      const [global] = PublicKey.findProgramAddressSync(
        [Buffer.from('global')],
        program.programId
      );
      const [userBalance] = PublicKey.findProgramAddressSync(
        [Buffer.from('user_balance'), userPubkey.toBytes()],
        program.programId
      );
      const [platformVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('platform_vault')],
        program.programId
      );

      // Get or create destination ATA
      const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
      const destinationAta = await getAssociatedTokenAddress(usdcMint, destinationPubkey);
      
      // Check if ATA exists
      const ataInfo = await provider.connection.getAccountInfo(destinationAta);
      const preInstructions = [];
      
      if (!ataInfo) {
        // Need to create ATA
        const payer = Keypair.fromSecretKey(
          new Uint8Array(JSON.parse(process.env.OPERATOR_SECRET_KEY!))
        );
        preInstructions.push(
          createAssociatedTokenAccountInstruction(
            payer.publicKey,
            destinationAta,
            destinationPubkey,
            usdcMint
          )
        );
      }

      // Execute withdrawal on-chain
      const txSignature = await (program.methods as any)
        .withdrawUsdc(new anchor.BN(withdrawal.amount))
        .accounts({
          global,
          userBalance,
          platformVault,
          userTokenAccount: destinationAta,
          user: userPubkey,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .preInstructions(preInstructions)
        .rpc();

      // Record successful withdrawal
      await supabase
        .from('user_operations')
        .insert({
          user_id: withdrawal.userId,
          operation_type: 'withdraw',
          amount: withdrawal.amount,
          usdc_amount: withdrawal.amount,
          description: `Withdrawal to ${withdrawal.destination}`,
          tx_signature: txSignature,
          created_at: withdrawal.createdAt,
          status: 'confirmed',
        });

      logger.info('settle-worker', `Withdrawal confirmed: ${txSignature}`, {
        id: withdrawal.id,
        amount: withdrawal.amount,
        destination: withdrawal.destination,
      });
      processed++;
    } catch (err: any) {
      logger.error('settle-worker', 'Error processing withdrawal', err);
      
      // Re-queue for retry with incremented retry count
      if (withdrawal) {
        const retryCount = withdrawal.retryCount || 0;
        if (retryCount < MAX_RETRIES) {
          await redis.rpush(REDIS_KEYS.withdrawals, JSON.stringify({
            ...withdrawal,
            retryCount: retryCount + 1,
            lastError: err.message,
          }));
        } else {
          // Max retries reached, record as failed
          await supabase
            .from('user_operations')
            .insert({
              user_id: withdrawal.userId,
              operation_type: 'withdraw',
              amount: withdrawal.amount,
              usdc_amount: withdrawal.amount,
              description: `Failed withdrawal to ${withdrawal.destination}: ${err.message}`,
              created_at: withdrawal.createdAt,
              status: 'failed',
            });
          logger.error('settle-worker', 'Withdrawal failed after max retries', { id: withdrawal.id });
        }
      }
    }
  }

  return processed;
}

/**
 * Main worker loop
 */
async function runWorker(): Promise<void> {
  logger.info('settle-worker', `Worker starting (PID: ${process.pid})`);
  logger.info('settle-worker', 'Processing withdrawals only. Trade settlements use new exchange system.');

  while (true) {
    try {
      // Process withdrawals
      const withdrawals = await processPendingWithdrawals();
      if (withdrawals > 0) {
        logger.info('settle-worker', `Processed ${withdrawals} withdrawals`);
      }

      // Wait between iterations
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    } catch (err) {
      logger.error('settle-worker', 'Worker error', err);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * 2));
    }
  }
}

// Graceful shutdown with proper cleanup
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  logger.info('settle-worker', `Received ${signal}, shutting down gracefully...`);
  
  try {
    // Allow current operations to complete (max 2 seconds)
    await new Promise(resolve => setTimeout(resolve, 2000));
    logger.info('settle-worker', 'Cleanup complete');
  } catch (err) {
    logger.error('settle-worker', 'Error during cleanup', err);
  }
  
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start worker
runWorker().catch(err => {
  logger.error('settle-worker', 'Fatal error', err);
  process.exit(1);
});
