/**
 * User Nonce Sync Service
 * 
 * Syncs on-chain UserNonce PDAs to the database.
 * This is used for CLOB order validation and cancellation.
 */

import { PublicKey, Connection } from '@solana/web3.js';
import { PoolClient } from 'pg';
import { validateServiceEnv } from './utils/env-validation';
import { createLogger } from './utils/logger';
import { transactionWithRetry } from './utils/db-retry';
import { createPool, closePool } from './utils/db-pool';

const logger = createLogger('sync-user-nonces');

// Validate environment
validateServiceEnv('syncUserNonces');

const pool = createPool();

// Program ID
const programIdStr = process.env.NEXT_PUBLIC_PROGRAM_ID;
if (!programIdStr) {
  throw new Error('NEXT_PUBLIC_PROGRAM_ID environment variable is required');
}
const PROGRAM_ID = new PublicKey(programIdStr);

function getConnection(): Connection {
  const rpcUrl = process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com';
  return new Connection(rpcUrl, 'confirmed');
}

// Derive UserNonce PDA
function deriveUserNoncePda(user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_nonce'), user.toBytes()],
    PROGRAM_ID
  );
  return pda;
}

interface UserNonceAccount {
  user: string;
  currentNonce: bigint;
}

async function fetchUserNonce(userWallet: string): Promise<UserNonceAccount | null> {
  try {
    const connection = getConnection();
    const user = new PublicKey(userWallet);
    const noncePda = deriveUserNoncePda(user);
    
    const accountInfo = await connection.getAccountInfo(noncePda);
    if (!accountInfo) {
      return null;
    }
    
    // Parse account data (skip 8-byte discriminator)
    // UserNonce: user(32) + current_nonce(8) + bump(1)
    const data = accountInfo.data;
    const currentNonce = data.readBigUInt64LE(40); // offset: 8 + 32
    
    return {
      user: userWallet,
      currentNonce,
    };
  } catch (err) {
    logger.error('Failed to fetch UserNonce', err, { user: userWallet });
    return null;
  }
}

async function syncUserNonce(client: PoolClient, walletAddress: string): Promise<boolean> {
  const nonce = await fetchUserNonce(walletAddress);
  
  if (!nonce) {
    // User has no nonce PDA yet, which means nonce is 0
    return false;
  }
  
  // Get or create user
  const userResult = await client.query<{ id: string }>(
    `INSERT INTO public.users (wallet_address, auth_provider) VALUES ($1, 'wallet')
     ON CONFLICT (wallet_address) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [walletAddress]
  );
  const userId = userResult.rows[0].id;
  
  // Upsert user nonce
  await client.query(
    `INSERT INTO public.user_nonces (user_id, wallet_address, current_nonce)
     VALUES ($1, $2, $3)
     ON CONFLICT (wallet_address) DO UPDATE SET
       current_nonce = GREATEST(public.user_nonces.current_nonce, EXCLUDED.current_nonce),
       updated_at = NOW()`,
    [userId, walletAddress, nonce.currentNonce.toString()]
  );
  
  return true;
}

async function main() {
  if (!pool) {
    throw new Error('Missing DATABASE_URL');
  }

  logger.info('Starting User Nonce sync');
  
  // Get all users with orders
  const result = await transactionWithRetry(
    pool,
    async (client) => {
      // Get unique wallet addresses from users who have orders
      const usersResult = await client.query<{ wallet_address: string }>(
        `SELECT DISTINCT u.wallet_address 
         FROM public.users u
         INNER JOIN public.orders o ON o.user_id = u.id
         WHERE u.wallet_address IS NOT NULL`
      );
      
      let syncedCount = 0;
      
      for (const row of usersResult.rows) {
        try {
          const synced = await syncUserNonce(client, row.wallet_address);
          if (synced) {
            syncedCount++;
          }
        } catch (err) {
          logger.error('Failed to sync nonce for user', err, { wallet: row.wallet_address });
        }
      }
      
      return syncedCount;
    },
    {
      operation: 'sync-user-nonces',
      maxRetries: 3,
      initialDelayMs: 500,
    }
  );
  
  logger.info('User Nonce sync completed', { syncedCount: result });
}

main()
  .then(() => closePool(pool))
  .catch(async (err) => {
    logger.error('User Nonce sync failed', err);
    await closePool(pool);
    process.exit(1);
  });

// Export for use in other services
export { fetchUserNonce, syncUserNonce, deriveUserNoncePda };
