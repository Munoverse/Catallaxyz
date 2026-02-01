import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import IDL from '../../generated/catallaxyz/catallaxyz.json' with { type: 'json' };
import {
  INACTIVITY_TIMEOUT_DAYS,
  deriveGlobalPda,
  deriveMarketPdas,
  ensureAta,
} from '@catallaxyz/shared';

export const INACTIVITY_DAYS = INACTIVITY_TIMEOUT_DAYS;
export const MAX_MARKETS_PER_RUN = 50;
// Client-side transaction bundling: pack multiple terminateIfInactive instructions
// Solana transaction size limit allows ~3-5 terminate instructions per transaction
// Default: 4, configurable via TERMINATION_BATCH_SIZE env var
export const DEFAULT_BATCH_SIZE = 4;
export const MAX_BATCH_SIZE = Math.min(
  Math.max(1, Number(process.env.TERMINATION_BATCH_SIZE) || DEFAULT_BATCH_SIZE),
  5 // Hard cap to prevent transaction size overflow
);

export interface InactiveMarketCandidate {
  id: string;
  title: string;
  solana_market_account: string | null;
  last_trade_at: string | null;
  status: string;
  daysInactive: number;
  creator?: string;
}

export function getCronSecretToken(
  headers: Record<string, string | string[] | undefined>
) {
  const authHeader = Array.isArray(headers.authorization)
    ? headers.authorization[0]
    : headers.authorization;
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  return headerToken || null;
}

export function loadKeeperKeypair(): Keypair {
  const secret = process.env.KEEPER_SECRET_KEY;
  if (!secret) {
    throw new Error('KEEPER_SECRET_KEY is not configured');
  }

  let secretKey: number[];
  try {
    secretKey = JSON.parse(secret);
  } catch (error) {
    throw new Error('KEEPER_SECRET_KEY must be a JSON array of numbers');
  }

  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

export async function getInactiveMarketCandidates(
  supabase: SupabaseClient,
  maxMarkets: number = MAX_MARKETS_PER_RUN
): Promise<InactiveMarketCandidate[]> {
  const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: markets, error } = await supabase
    .from('markets')
    .select('id, title, solana_market_account, last_trade_at, status, creator_wallet')
    .in('status', ['active', 'running', 'paused'])
    .not('last_trade_at', 'is', null)
    .lt('last_trade_at', cutoff)
    .order('last_trade_at', { ascending: true })
    .limit(maxMarkets);

  if (error) {
    throw new Error(error.message);
  }

  return (markets || []).map((market) => {
    const lastTradeAt = market.last_trade_at ? new Date(market.last_trade_at) : null;
    const daysInactive = lastTradeAt
      ? Math.floor((Date.now() - lastTradeAt.getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    return {
      ...market,
      daysInactive,
      creator: market.creator_wallet,
    };
  });
}

/**
 * Terminate a single inactive market
 */
export async function terminateSingleMarket(
  program: Program<any>,
  connection: Connection,
  keeperKeypair: Keypair,
  marketPubkey: PublicKey,
  usdcMint: PublicKey,
  globalPda: PublicKey,
  creatorTreasuryPda: PublicKey
) {
  // Fetch market account to get creator
  const marketAccount = await (program.account as any).market.fetch(marketPubkey);
  
  // Derive market vault PDA
  const [marketVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('market_vault'), marketPubkey.toBuffer()],
    program.programId
  );
  
  // Get creator's USDC account
  const creatorUsdcAccount = await ensureAta(
    connection,
    keeperKeypair,
    usdcMint,
    marketAccount.creator as PublicKey
  );

  const signature = await (program.methods as any)
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

  return signature;
}

/**
 * Build a single terminateIfInactive instruction for client-side bundling
 */
async function buildTerminateInstruction(
  program: Program<any>,
  connection: Connection,
  keeperKeypair: Keypair,
  marketPubkey: PublicKey,
  creator: PublicKey,
  usdcMint: PublicKey,
  globalPda: PublicKey,
  creatorTreasuryPda: PublicKey
): Promise<TransactionInstruction> {
  // Derive market vault PDA
  const [marketVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('market_vault'), marketPubkey.toBuffer()],
    program.programId
  );
  
  // Get creator's USDC account
  const creatorUsdcAccount = await ensureAta(
    connection,
    keeperKeypair,
    usdcMint,
    creator
  );

  return (program.methods as any)
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
    .instruction();
}

/**
 * Terminate multiple inactive markets using client-side transaction bundling.
 * Packs multiple terminateIfInactive instructions into a single transaction.
 * This approach keeps the contract simple (single instruction) while reducing
 * the number of transactions needed. The keeper wallet pays for transaction fees.
 */
export async function terminateMarketsBatch(
  program: Program<any>,
  connection: Connection,
  keeperKeypair: Keypair,
  markets: Array<{ pubkey: PublicKey; creator: PublicKey }>,
  usdcMint: PublicKey,
  globalPda: PublicKey,
  creatorTreasuryPda: PublicKey
) {
  if (markets.length === 0) {
    return { signature: null, terminated: 0, skipped: 0 };
  }
  
  if (markets.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE}`);
  }

  // Build instructions for each market termination
  const instructions: TransactionInstruction[] = [];
  
  for (const market of markets) {
    const ix = await buildTerminateInstruction(
      program,
      connection,
      keeperKeypair,
      market.pubkey,
      market.creator,
      usdcMint,
      globalPda,
      creatorTreasuryPda
    );
    instructions.push(ix);
  }

  // Bundle all instructions into a single transaction (client-side bundling)
  const tx = new Transaction();
  instructions.forEach(ix => tx.add(ix));
  
  // Set recent blockhash and fee payer (keeper pays for transaction fees)
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = keeperKeypair.publicKey;
  
  // Sign and send
  tx.sign(keeperKeypair);
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  
  // Wait for confirmation
  await connection.confirmTransaction(signature, 'confirmed');

  return { signature, terminated: markets.length, skipped: 0 };
}

/**
 * Terminate inactive markets - uses batch processing when possible
 */
export async function terminateInactiveMarkets(
  supabase: SupabaseClient,
  maxMarkets: number = MAX_MARKETS_PER_RUN,
  useBatch: boolean = true
) {
  const candidates = await getInactiveMarketCandidates(supabase, maxMarkets);
  if (candidates.length === 0) {
    return { terminated: 0, skipped: 0, results: [] };
  }

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const programId = process.env.PROGRAM_ID;
  const usdcMintAddress = process.env.USDC_MINT_ADDRESS;
  if (!programId) {
    throw new Error('PROGRAM_ID is not configured');
  }
  if (!usdcMintAddress) {
    throw new Error('USDC_MINT_ADDRESS is not configured');
  }

  const keeperKeypair = loadKeeperKeypair();
  const connection = new Connection(rpcUrl, 'confirmed');
  const provider = new AnchorProvider(connection, new Wallet(keeperKeypair), {
    commitment: 'confirmed',
  });
  const program = new Program(IDL as any, provider);

  // Use shared PDA derivation functions
  const globalPda = deriveGlobalPda(program.programId);
  const { creatorTreasury: creatorTreasuryPda } =
    deriveMarketPdas(program.programId, program.programId); // dummy market for treasury PDAs
  const usdcMint = new PublicKey(usdcMintAddress);

  const results: Array<{
    marketId: string;
    title: string;
    status: string;
    signature?: string;
    reason?: string;
  }> = [];
  let terminatedCount = 0;
  let skippedCount = 0;

  // Filter valid candidates
  const validCandidates = candidates.filter((c) => {
    if (!c.solana_market_account) {
      skippedCount += 1;
      results.push({
        marketId: c.id,
        title: c.title,
        status: 'skipped',
        reason: 'Missing solana_market_account',
      });
      return false;
    }
    return true;
  });

  if (useBatch && validCandidates.length > 1) {
    // Process in batches
    for (let i = 0; i < validCandidates.length; i += MAX_BATCH_SIZE) {
      const batch = validCandidates.slice(i, i + MAX_BATCH_SIZE);
      
      try {
        // Fetch market accounts to get creators
        const marketInfos = await Promise.all(
          batch.map(async (c) => {
            const pubkey = new PublicKey(c.solana_market_account!);
            const account = await (program.account as any).market.fetch(pubkey);
            return {
              candidate: c,
              pubkey,
              creator: account.creator as PublicKey,
            };
          })
        );

        const { signature } = await terminateMarketsBatch(
          program,
          connection,
          keeperKeypair,
          marketInfos.map((m) => ({ pubkey: m.pubkey, creator: m.creator })),
          usdcMint,
          globalPda,
          creatorTreasuryPda
        );

        // Update database and record results
        for (const market of batch) {
          await supabase
            .from('markets')
            .update({ status: 'terminated', updated_at: new Date().toISOString() })
            .eq('id', market.id);

          terminatedCount += 1;
          results.push({
            marketId: market.id,
            title: market.title,
            status: 'terminated',
            signature: signature || undefined,
          });
        }
      } catch (error: any) {
        // If batch fails, try individual processing
        console.error('Batch termination failed, falling back to individual:', error.message);
        
        for (const market of batch) {
          try {
            const marketPubkey = new PublicKey(market.solana_market_account!);
            const signature = await terminateSingleMarket(
              program,
              connection,
              keeperKeypair,
              marketPubkey,
              usdcMint,
              globalPda,
              creatorTreasuryPda
            );

            await supabase
              .from('markets')
              .update({ status: 'terminated', updated_at: new Date().toISOString() })
              .eq('id', market.id);

            terminatedCount += 1;
            results.push({
              marketId: market.id,
              title: market.title,
              status: 'terminated',
              signature,
            });
          } catch (err: any) {
            skippedCount += 1;
            results.push({
              marketId: market.id,
              title: market.title,
              status: 'failed',
              reason: err.message || 'Unknown error',
            });
          }
        }
      }
    }
  } else {
    // Process individually
    for (const market of validCandidates) {
      try {
        const marketPubkey = new PublicKey(market.solana_market_account!);
        const signature = await terminateSingleMarket(
          program,
          connection,
          keeperKeypair,
          marketPubkey,
          usdcMint,
          globalPda,
          creatorTreasuryPda
        );

        await supabase
          .from('markets')
          .update({ status: 'terminated', updated_at: new Date().toISOString() })
          .eq('id', market.id);

        terminatedCount += 1;
        results.push({
          marketId: market.id,
          title: market.title,
          status: 'terminated',
          signature,
        });
      } catch (error: any) {
        skippedCount += 1;
        results.push({
          marketId: market.id,
          title: market.title,
          status: 'failed',
          reason: error.message || 'Unknown error',
        });
      }
    }
  }

  return { terminated: terminatedCount, skipped: skippedCount, results };
}
