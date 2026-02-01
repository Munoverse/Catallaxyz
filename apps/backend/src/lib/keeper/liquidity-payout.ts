import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import IDL from '../../generated/catallaxyz/catallaxyz.json' with { type: 'json' };
import { getUtc12Window } from '@catallaxyz/shared';
import { loadKeeperKeypair } from '../solana.js';

interface RewardRow {
  id: string;
  market_id: string;
  user_id: string;
  reward_amount: number;
  status: string;
}

interface UserRow {
  id: string;
  wallet_address: string;
}

async function ensureAta(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  const info = await connection.getAccountInfo(ata);
  if (info) {
    return ata;
  }

  const tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      owner,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(payer);
  const signature = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(signature, 'confirmed');
  return ata;
}

export async function processLiquidityPayouts(
  supabase: SupabaseClient,
  now: Date = new Date(),
  maxPayouts: number = 100
) {
  const { rewardPeriod } = getUtc12Window(now);

  const { data: rewards, error: rewardsError } = await supabase
    .from('liquidity_rewards')
    .select('id, market_id, user_id, reward_amount, status')
    .eq('reward_period', rewardPeriod)
    .eq('status', 'pending')
    .gt('reward_amount', 0)
    .limit(maxPayouts);

  if (rewardsError) {
    throw new Error(`Failed to load rewards: ${rewardsError.message}`);
  }

  if (!rewards || rewards.length === 0) {
    return { rewardPeriod, processed: 0, results: [] };
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

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    program.programId
  );
  const [rewardTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('reward_treasury')],
    program.programId
  );

  const usdcMint = new PublicKey(usdcMintAddress);

  const userIds = Array.from(new Set(rewards.map((row) => row.user_id)));
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, wallet_address')
    .in('id', userIds);

  if (usersError) {
    throw new Error(`Failed to load users: ${usersError.message}`);
  }

  const userWallets = new Map<string, string>();
  for (const user of (users || []) as UserRow[]) {
    userWallets.set(user.id, user.wallet_address);
  }

  const results = [];
  let processed = 0;

  for (const reward of rewards as RewardRow[]) {
    const wallet = userWallets.get(reward.user_id);
    if (!wallet) {
      results.push({
        rewardId: reward.id,
        status: 'skipped',
        reason: 'Missing wallet address',
      });
      continue;
    }

    try {
      const recipient = new PublicKey(wallet);
      const recipientUsdcAccount = await ensureAta(
        connection,
        keeperKeypair,
        usdcMint,
        recipient
      );

      const signature = await program.methods
        .withdrawRewardFees({ amount: Number(reward.reward_amount) })
        .accounts({
          authority: keeperKeypair.publicKey,
          global: globalPda,
          rewardTreasury: rewardTreasuryPda,
          recipientUsdcAccount,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([keeperKeypair])
        .rpc();

      await supabase
        .from('liquidity_rewards')
        .update({
          status: 'distributed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', reward.id);

      processed += 1;
      results.push({
        rewardId: reward.id,
        status: 'distributed',
        signature,
      });
    } catch (error: any) {
      results.push({
        rewardId: reward.id,
        status: 'failed',
        reason: error.message || 'Unknown error',
      });
    }
  }

  return { rewardPeriod, processed, results };
}
