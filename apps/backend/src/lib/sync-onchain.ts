/**
 * On-chain / Off-chain state synchronization
 * 
 * This module syncs user positions and balances between the database
 * and the Solana blockchain.
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import IDL from '../generated/catallaxyz/catallaxyz.json' with { type: 'json' };
import { createServerClient } from './supabase.js';
import { logger } from './logger.js';

const PROGRAM_ID = process.env.PROGRAM_ID || '95QAsSGtGqRPKVWrxEj9GnJcSfWnhxRdYdbeVq5WTEcy';

type OnChainPosition = {
  user: string;
  market: string;
  yesBalance: bigint;
  noBalance: bigint;
};

type OnChainBalance = {
  user: string;
  market: string;
  usdcBalance: bigint;
};

type OnChainMarketFinalPrices = {
  finalYesPrice: number | null;
  finalNoPrice: number | null;
  canRedeem: boolean;
  isRandomlyTerminated: boolean;
  status: number;
};

function getConnection(): Connection {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new Error('SOLANA_RPC_URL is not configured');
  }
  return new Connection(rpcUrl, 'confirmed');
}

function getReadOnlyProgram(): Program {
  const connection = getConnection();
  const wallet = new Wallet(Keypair.generate());
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  return new Program(IDL as any, provider);
}

function parseScaledPrice(value: any): number | null {
  if (value == null) return null;
  const raw =
    typeof value === 'number'
      ? value
      : value?.toNumber?.() ?? Number(value);
  if (!Number.isFinite(raw)) return null;
  return raw / 1_000_000;
}

/**
 * Derive UserPosition PDA
 */
function deriveUserPositionPda(market: PublicKey, user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_position'), market.toBytes(), user.toBytes()],
    new PublicKey(PROGRAM_ID)
  );
  return pda;
}

/**
 * Derive UserBalance PDA
 */
function deriveUserBalancePda(market: PublicKey, user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_balance'), market.toBytes(), user.toBytes()],
    new PublicKey(PROGRAM_ID)
  );
  return pda;
}

/**
 * Fetch on-chain position for a user in a market
 */
export async function fetchOnChainPosition(
  marketAddress: string,
  userWallet: string
): Promise<OnChainPosition | null> {
  try {
    const connection = getConnection();
    const market = new PublicKey(marketAddress);
    const user = new PublicKey(userWallet);
    const positionPda = deriveUserPositionPda(market, user);
    
    const accountInfo = await connection.getAccountInfo(positionPda);
    if (!accountInfo) {
      return null;
    }
    
    // Parse account data (skip 8-byte discriminator)
    // UserPosition: user(32) + market(32) + yes_balance(8) + no_balance(8) + bump(1)
    const data = accountInfo.data;
    const yesBalance = data.readBigUInt64LE(72);  // offset: 8 + 32 + 32
    const noBalance = data.readBigUInt64LE(80);   // offset: 8 + 32 + 32 + 8
    
    return {
      user: userWallet,
      market: marketAddress,
      yesBalance,
      noBalance,
    };
  } catch (err) {
    logger.error('sync-onchain', 'Failed to fetch on-chain position', err);
    return null;
  }
}

/**
 * Fetch on-chain USDC balance for a user in a market
 */
export async function fetchOnChainBalance(
  marketAddress: string,
  userWallet: string
): Promise<OnChainBalance | null> {
  try {
    const connection = getConnection();
    const market = new PublicKey(marketAddress);
    const user = new PublicKey(userWallet);
    const balancePda = deriveUserBalancePda(market, user);
    
    const accountInfo = await connection.getAccountInfo(balancePda);
    if (!accountInfo) {
      return null;
    }
    
    // Parse account data (skip 8-byte discriminator)
    // UserBalance: user(32) + market(32) + usdc_balance(8) + bump(1)
    const data = accountInfo.data;
    const usdcBalance = data.readBigUInt64LE(72);  // offset: 8 + 32 + 32
    
    return {
      user: userWallet,
      market: marketAddress,
      usdcBalance,
    };
  } catch (err) {
    logger.error('sync-onchain', 'Failed to fetch on-chain balance', err);
    return null;
  }
}

/**
 * Fetch on-chain final prices for a market.
 */
export async function fetchOnChainMarketFinalPrices(
  marketAddress: string
): Promise<OnChainMarketFinalPrices | null> {
  try {
    const program = getReadOnlyProgram();
    const marketKey = new PublicKey(marketAddress);
    const market = await (program.account as any).market.fetch(marketKey);

    return {
      finalYesPrice: parseScaledPrice((market as any).finalYesPrice),
      finalNoPrice: parseScaledPrice((market as any).finalNoPrice),
      canRedeem: Boolean((market as any).canRedeem),
      isRandomlyTerminated: Boolean((market as any).isRandomlyTerminated),
      status: Number((market as any).status ?? 0),
    };
  } catch (err) {
    logger.error('sync-onchain', 'Failed to fetch on-chain market final prices', err);
    return null;
  }
}

/**
 * Sync a single user's position from on-chain to database
 */
export async function syncUserPosition(
  userId: string,
  marketId: string,
  marketAddress: string,
  userWallet: string
): Promise<boolean> {
  const supabase = createServerClient();
  
  const onChainPosition = await fetchOnChainPosition(marketAddress, userWallet);
  if (!onChainPosition) {
    logger.info('sync-onchain', `No on-chain position found for user in market`);
    return false;
  }
  
  // Update or create stakes for YES position
  if (onChainPosition.yesBalance > 0n) {
    await supabase.from('stakes').upsert({
      market_id: marketId,
      user_id: userId,
      outcome_type: 'yes',
      amount: onChainPosition.yesBalance.toString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'market_id,user_id,outcome_type',
    });
  }
  
  // Update or create stakes for NO position
  if (onChainPosition.noBalance > 0n) {
    await supabase.from('stakes').upsert({
      market_id: marketId,
      user_id: userId,
      outcome_type: 'no',
      amount: onChainPosition.noBalance.toString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'market_id,user_id,outcome_type',
    });
  }
  
  // Update user_balances with on-chain data
  await supabase.from('user_balances').upsert({
    user_id: userId,
    yes_available: onChainPosition.yesBalance.toString(),
    no_available: onChainPosition.noBalance.toString(),
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'user_id',
  });
  
  return true;
}

/**
 * Sync all positions for a market
 */
export async function syncMarketPositions(marketId: string): Promise<number> {
  const supabase = createServerClient();
  
  // Get market address
  const { data: market, error: marketError } = await supabase
    .from('markets')
    .select('solana_market_account')
    .eq('id', marketId)
    .single();
  
  if (marketError || !market?.solana_market_account) {
    logger.error('sync-onchain', 'Market not found or no on-chain address', marketError);
    return 0;
  }
  
  // Get all users with stakes in this market
  const { data: stakes, error: stakesError } = await supabase
    .from('stakes')
    .select('user_id, users!inner(wallet_address)')
    .eq('market_id', marketId)
    .gt('amount', 0);
  
  if (stakesError || !stakes?.length) {
    return 0;
  }
  
  let synced = 0;
  const processedUsers = new Set<string>();
  
  for (const stake of stakes) {
    const userId = stake.user_id;
    if (processedUsers.has(userId)) continue;
    processedUsers.add(userId);
    
    const walletAddress = (stake as any).users?.wallet_address;
    if (!walletAddress) continue;
    
    const success = await syncUserPosition(
      userId,
      marketId,
      market.solana_market_account,
      walletAddress
    );
    
    if (success) synced++;
  }
  
  return synced;
}

/**
 * Check for discrepancies between on-chain and off-chain state
 */
export async function findDiscrepancies(marketId: string): Promise<Array<{
  userId: string;
  walletAddress: string;
  field: string;
  onChain: string;
  offChain: string;
}>> {
  const supabase = createServerClient();
  const discrepancies: Array<{
    userId: string;
    walletAddress: string;
    field: string;
    onChain: string;
    offChain: string;
  }> = [];
  
  // Get market address
  const { data: market } = await supabase
    .from('markets')
    .select('solana_market_account')
    .eq('id', marketId)
    .single();
  
  if (!market?.solana_market_account) {
    return discrepancies;
  }
  
  // Get all users with balances
  const { data: balances } = await supabase
    .from('user_balances')
    .select('user_id, yes_available, no_available, users!inner(wallet_address)')
    .gt('yes_available', 0)
    .or('no_available.gt.0');
  
  if (!balances?.length) {
    return discrepancies;
  }
  
  for (const balance of balances) {
    const walletAddress = (balance as any).users?.wallet_address;
    if (!walletAddress) continue;
    
    const onChainPosition = await fetchOnChainPosition(
      market.solana_market_account,
      walletAddress
    );
    
    if (!onChainPosition) continue;
    
    const offChainYes = BigInt(balance.yes_available || 0);
    const offChainNo = BigInt(balance.no_available || 0);
    
    if (onChainPosition.yesBalance !== offChainYes) {
      discrepancies.push({
        userId: balance.user_id,
        walletAddress,
        field: 'yes_balance',
        onChain: onChainPosition.yesBalance.toString(),
        offChain: offChainYes.toString(),
      });
    }
    
    if (onChainPosition.noBalance !== offChainNo) {
      discrepancies.push({
        userId: balance.user_id,
        walletAddress,
        field: 'no_balance',
        onChain: onChainPosition.noBalance.toString(),
        offChain: offChainNo.toString(),
      });
    }
  }
  
  return discrepancies;
}

/**
 * Resolve discrepancy by updating off-chain to match on-chain
 */
export async function resolveDiscrepancy(
  userId: string,
  marketId: string,
  marketAddress: string,
  walletAddress: string
): Promise<boolean> {
  return syncUserPosition(userId, marketId, marketAddress, walletAddress);
}
