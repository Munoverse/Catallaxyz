/**
 * Market Creation Helper
 * 
 * Handles complete market creation flow:
 * 0. Create Switchboard randomness account (creator pays rent)
 * 1. Create market account (pay rent and fees)
 * 2. Initialize YES/NO token mints
 * 3. Store market info in Supabase
 */

import type { Address } from '@solana/addresses';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { supabase } from './supabase';
import { apiFetch } from './api-client';
import { 
  getSwitchboardQueue, 
  createRandomnessAccount,
  createRandomnessAccountWithWallet,
} from './switchboard/randomness';
import { Program } from '@coral-xyz/anchor';
import type { Catallaxyz } from '@/generated/catallaxyz/catallaxyz';
type catallaxyz = Catallaxyz;

export interface CreateMarketParams {
  creator: Address;
  title: string;
  description?: string;
  question: string;
  category?: string;
  frequency?: 'all' | 'daily' | 'weekly' | 'monthly';
  yesOptionLabel?: string;
  noOptionLabel?: string;
  yesOptionSymbol?: string;
  noOptionSymbol?: string;
}

export interface CreatedMarketInfo {
  marketPda: PublicKey;
  marketUsdcVault: PublicKey;
  randomnessAccount: PublicKey;
  switchboardQueue: PublicKey;
}

export interface WalletAdapterLike {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}

/**
 * Create a Switchboard randomness account for the market
 * This account is fixed per market and the creator pays the rent
 * 
 * @param connection Solana connection
 * @param payerKeypair Creator's keypair (pays for rent)
 * @returns Randomness account public key and initialization transaction
 */
export async function createMarketRandomnessAccount(
  connection: Connection,
  payerKeypair: Keypair
): Promise<{ randomnessAccount: PublicKey; initTx: Transaction }> {
  const { randomness, initIx } = await createRandomnessAccount(
    connection,
    payerKeypair
  );
  
  return {
    randomnessAccount: randomness.pubkey,
    initTx: initIx,
  };
}

/**
 * Complete on-chain market creation flow
 * 
 * This function:
 * 0. Creates a Switchboard randomness account (paid by creator)
 * 1. Creates the market account on-chain (pays rent and fees)
 * 2. Returns on-chain market info (DB insert handled separately)
 * 
 * @param params Market creation parameters
 * @param connection Solana connection
 * @param wallet Wallet adapter (for signing)
 * @param program Anchor program instance
 * @param usdcMint Optional USDC mint override
 */
export async function createCompleteMarket(
  params: CreateMarketParams,
  connection: Connection,
  wallet: WalletAdapterLike,
  program: Program<catallaxyz>,
  usdcMint?: PublicKey
): Promise<CreatedMarketInfo> {
  if (!wallet.publicKey) {
    throw new Error('Wallet public key is required');
  }

  // Step 0: Create a per-market Switchboard randomness account (creator pays rent/fees)
  const { randomnessAccount } = await createRandomnessAccountWithWallet(connection, wallet);
  const switchboardQueue = getSwitchboardQueue();

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    program.programId
  );
  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('market'), wallet.publicKey.toBuffer()],
    program.programId
  );
  const [platformTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('platform_treasury')],
    program.programId
  );

  // AUDIT FIX F-H1: Require proper USDC mint configuration
  const usdcMintAddress = process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS;
  if (!usdcMintAddress && !usdcMint) {
    throw new Error('USDC mint address not configured. Set NEXT_PUBLIC_USDC_MINT_ADDRESS environment variable.');
  }
  const resolvedUsdcMint = usdcMint || new PublicKey(usdcMintAddress!);
  const creatorUsdcAccount = await getAssociatedTokenAddress(resolvedUsdcMint, wallet.publicKey);

  // Generate a unique market ID (32 bytes)
  const marketIdBytes = Array.from(Keypair.generate().publicKey.toBytes());

  await (program.methods
    .createMarket({
      question: params.question || params.title,
      description: params.description || '',
      yesDescription: params.yesOptionLabel || 'YES',
      noDescription: params.noOptionLabel || 'NO',
      marketId: marketIdBytes,
    })
    .accounts({
      creator: wallet.publicKey,
      global: globalPda,
      market: marketPda,
      switchboardQueue,
      randomnessAccount,
      platformTreasury: platformTreasuryPda,
      creatorUsdcAccount,
      usdcMint: resolvedUsdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as any))
    .rpc();

  const marketVault = Keypair.generate();
  await (program.methods
    .initMarketVault()
    .accounts({
      creator: wallet.publicKey,
      global: globalPda,
      market: marketPda,
      marketUsdcVault: marketVault.publicKey,
      usdcMint: resolvedUsdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as any))
    .signers([marketVault])
    .rpc();

  try {
    await apiFetch('/api/markets/sync-fee-split', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketAddress: marketPda.toBase58() }),
    });
  } catch (error) {
    console.warn('Failed to sync fee split for new market:', error);
  }

  return {
    marketPda,
    marketUsdcVault: marketVault.publicKey,
    randomnessAccount,
    switchboardQueue,
  };
}

/**
 * Get the randomness account creation cost
 * This is paid by the market creator
 */
export function getRandomnessAccountRentCost(): number {
  // Approximate rent cost for a Switchboard randomness account
  // This is around 0.002 SOL (~200 lamports per byte * ~900 bytes)
  return 0.002;
}

/**
 * Calculate market creation costs
 * 
 * Returns the total cost to create a market:
 * - Rent for market account
 * - Rent for token mints
 * - Market creation fee
 * - CLOB orderbook is off-chain (no on-chain orderbook costs)
 * - Switchboard randomness account rent (IMPORTANT: paid by market creator)
 * 
 * Note: Each market has a FIXED randomness account that is created during
 * market creation. The creator pays for this account's rent (~0.002 SOL).
 * This randomness account is used for all settlement checks on this market.
 */
export async function calculateMarketCreationCosts(): Promise<{
  marketAccountRent: number;
  tokenMintRent: number;
  creationFee: number;
  randomnessAccountRent: number;
  totalSol: number;
  totalUsdc: number;
}> {
  // Market account rent (approximate)
  const marketAccountRent = 0.00144; // SOL (approximate, ~940 bytes)
  
  // Token mint rent (no outcome tokens)
  const tokenMintRent = 0; // SOL
  
  // Market creation fee (10 USDC)
  const creationFee = 10; // USDC
  
  // Switchboard randomness account rent
  // IMPORTANT: This is a per-market fixed account created during market creation
  // The market creator pays this rent once when creating the market
  // This account is then used for all settlement checks on this market
  const randomnessAccountRent = getRandomnessAccountRentCost(); // ~0.002 SOL
  
  // Total SOL cost (rent + fees)
  const totalSol = marketAccountRent + tokenMintRent + randomnessAccountRent;
  
  // Total USDC cost (creation fee)
  const totalUsdc = creationFee;
  
  return {
    marketAccountRent,
    tokenMintRent,
    creationFee,
    randomnessAccountRent,
    totalSol,
    totalUsdc,
  };
}

/**
 * Store market info in Supabase
 */
export async function storeMarketInSupabase(
  marketPda: Address,
  params: CreateMarketParams,
  randomnessAccount: Address,
  extras?: {
    switchboardQueue?: Address;
    marketUsdcVault?: Address;
  }
): Promise<string> {
  // Get or create user
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('wallet_address', params.creator)
    .single();
  
  if (!user) {
    throw new Error('User not found - user must be created first');
  }
  
  // Create market record (binary market only)
  const { data: market, error } = await supabase
    .from('markets')
    .insert({
      creator_id: user.id,
      title: params.title,
      description: params.description,
      question: params.question,
      category: params.category || null,
      frequency: params.frequency || 'all',
      status: 'active',
      solana_market_account: marketPda,
      market_usdc_vault: extras?.marketUsdcVault?.toString() || null,
      switchboard_queue: extras?.switchboardQueue?.toString() || getSwitchboardQueue().toString(),
      randomness_account: randomnessAccount.toString(),
      metadata: {
        outcomes: [
          {
            label: params.yesOptionLabel || 'Yes',
            symbol: params.yesOptionSymbol || 'YES',
          },
          {
            label: params.noOptionLabel || 'No',
            symbol: params.noOptionSymbol || 'NO',
          },
        ],
      },
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('Error creating market in Supabase:', error);
    throw error;
  }
  
  return market.id;
}

