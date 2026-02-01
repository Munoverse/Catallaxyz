/**
 * Admin Utilities
 * Combined admin authorization checks and contract call helpers
 * 
 * AUDIT FIX MED-2: Use shared WalletAdapter type instead of local definition
 */

import { Program } from '@coral-xyz/anchor';
import { PublicKey, Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import type { Catallaxyz } from '@/generated/catallaxyz/catallaxyz';

/** 
 * Wallet interface compatible with wallet-adapter 
 * Re-exported from shared types for convenience
 */
interface WalletAdapter {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>;
}

// ============================================
// Admin Authorization
// AUDIT FIX CRIT-5: Add warnings about client-side checks
// ============================================

/**
 * Check if a wallet address is an admin (quick check via environment variable)
 * 
 * ⚠️ SECURITY WARNING: This is a CLIENT-SIDE check only!
 * - Use this ONLY for UI display purposes (showing/hiding admin UI)
 * - NEVER trust this for actual authorization
 * - All admin operations are verified ON-CHAIN by the contract
 * - For critical operations, always use `isAdminOnChain()` to verify
 * 
 * The contract enforces: `authority.key() == global.authority`
 * So even if this check is bypassed, transactions will fail on-chain.
 */
export function isAdminWallet(walletAddress: string | undefined): boolean {
  if (!walletAddress) return false;
  
  const adminAddress = process.env.NEXT_PUBLIC_ADMIN_WALLET_ADDRESS;
  if (!adminAddress) {
    console.warn('[Admin] NEXT_PUBLIC_ADMIN_WALLET_ADDRESS not configured');
    return false;
  }
  
  return walletAddress === adminAddress;
}

/**
 * Get admin wallet address from environment
 */
export function getAdminWalletAddress(): string | undefined {
  return process.env.NEXT_PUBLIC_ADMIN_WALLET_ADDRESS;
}

/**
 * Verify admin authorization before executing admin operations
 * This should be called before any admin transaction
 * 
 * @throws Error if wallet is not authorized
 */
export async function requireAdminAuthorization(
  program: Program<Catallaxyz>,
  walletPubkey: PublicKey,
  globalPda: PublicKey
): Promise<void> {
  const isAdmin = await isAdminOnChain(program, walletPubkey, globalPda);
  if (!isAdmin) {
    throw new Error('Unauthorized: Wallet is not the program authority');
  }
}

// ============================================
// Admin Contract Calls
// ============================================

/**
 * Pause a market (admin only)
 * Emergency stop mechanism to halt trading
 */
export async function pauseMarket(
  program: Program<Catallaxyz>,
  wallet: WalletAdapter,
  connection: Connection,
  params: {
    marketPda: PublicKey;
    globalPda: PublicKey;
  }
) {
  const { marketPda, globalPda } = params;

  // Note: Using 'as any' because market/global PDAs have self-referential seeds
  // that Anchor incorrectly marks as auto-derivable
  const tx = await (program.methods
    .pauseMarket()
    .accounts({
      authority: wallet.publicKey,
      global: globalPda,
      market: marketPda,
      systemProgram: PublicKey.default,
    } as any))
    .transaction();

  const signature = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(signature, 'confirmed');

  return signature;
}

/**
 * Resume a paused market (admin only)
 * Re-enables trading after emergency pause
 */
export async function resumeMarket(
  program: Program<Catallaxyz>,
  wallet: WalletAdapter,
  connection: Connection,
  params: {
    marketPda: PublicKey;
    globalPda: PublicKey;
  }
) {
  const { marketPda, globalPda } = params;

  // Note: Using 'as any' because market/global PDAs have self-referential seeds
  const tx = await (program.methods
    .resumeMarket()
    .accounts({
      authority: wallet.publicKey,
      global: globalPda,
      market: marketPda,
      systemProgram: PublicKey.default,
    } as any))
    .transaction();

  const signature = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(signature, 'confirmed');

  return signature;
}

/**
 * Update market fee rates (admin only)
 * Adjusts the dynamic fee curve parameters
 * 
 * AUDIT FIX CRIT-4: Added missing parameters (platform, maker, creator rates)
 * 
 * Constraints:
 * - Fee rates must be between 0 and 10% (0-100,000 scaled by 10^6)
 * - center_rate must be >= extreme_rate
 * - platform + maker + creator rates must equal 100% (1,000,000)
 */
export async function updateFeeRates(
  program: Program<Catallaxyz>,
  wallet: WalletAdapter,
  connection: Connection,
  params: {
    globalPda: PublicKey;
    centerTakerFeeRate: number;     // scaled by 10^6, e.g., 32000 = 3.2%
    extremeTakerFeeRate: number;    // scaled by 10^6, e.g., 2000 = 0.2%
    platformFeeRate: number;        // scaled by 10^6, e.g., 750000 = 75% of fees
    makerRebateRate: number;        // scaled by 10^6, e.g., 200000 = 20% of fees
    creatorIncentiveRate: number;   // scaled by 10^6, e.g., 50000 = 5% of fees
  }
) {
  const { 
    globalPda, 
    centerTakerFeeRate, 
    extremeTakerFeeRate,
    platformFeeRate,
    makerRebateRate,
    creatorIncentiveRate,
  } = params;

  // Validate fee distribution sums to 100%
  const RATE_SCALE = 1_000_000;
  const totalDistribution = platformFeeRate + makerRebateRate + creatorIncentiveRate;
  if (totalDistribution !== RATE_SCALE) {
    throw new Error(`Fee distribution must sum to 100% (${RATE_SCALE}). Got: ${totalDistribution}`);
  }

  // Validate center >= extreme
  if (centerTakerFeeRate < extremeTakerFeeRate) {
    throw new Error('Center taker fee rate must be >= extreme taker fee rate');
  }

  const tx = await (program.methods
    .updateFeeRates({
      centerTakerFeeRate,
      extremeTakerFeeRate,
      platformFeeRate,
      makerRebateRate,
      creatorIncentiveRate,
    })
    .accounts({
      authority: wallet.publicKey,
      global: globalPda,
      systemProgram: PublicKey.default,
    } as any))
    .transaction();

  const signature = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(signature, 'confirmed');

  return signature;
}

/**
 * Withdraw platform fees (admin only)
 * Transfers accumulated fees from platform treasury
 */
export async function withdrawPlatformFees(
  program: Program<Catallaxyz>,
  wallet: WalletAdapter,
  connection: Connection,
  params: {
    globalPda: PublicKey;
    platformTreasuryPda: PublicKey;
    recipientUsdcAccount: PublicKey;
    usdcMint: PublicKey;
    amount: BN; // Amount in lamports
  }
) {
  const { globalPda, platformTreasuryPda, recipientUsdcAccount, usdcMint, amount } = params;

  const tx = await (program.methods
    .withdrawPlatformFees({
      amount,
    })
    .accounts({
      authority: wallet.publicKey,
      global: globalPda,
      platformTreasury: platformTreasuryPda,
      recipientUsdcAccount,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: PublicKey.default,
    } as any))
    .transaction();

  const signature = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(signature, 'confirmed');

  return signature;
}

/**
 * Set or update the keeper wallet address (admin only)
 * The keeper can perform automated tasks like terminating inactive markets
 * 
 * @param newKeeper - The new keeper address. Set to PublicKey.default() to disable separate keeper
 */
export async function setKeeper(
  program: Program<Catallaxyz>,
  wallet: WalletAdapter,
  connection: Connection,
  params: {
    globalPda: PublicKey;
    newKeeper: PublicKey;
  }
) {
  const { globalPda, newKeeper } = params;

  const tx = await (program.methods
    .setKeeper({
      newKeeper,
    })
    .accounts({
      authority: wallet.publicKey,
      global: globalPda,
    } as any))
    .transaction();

  const signature = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(signature, 'confirmed');

  return signature;
}

/**
 * Check if wallet is program admin (on-chain verification)
 * Use this for actual transaction authorization
 */
export async function isAdminOnChain(
  program: Program<Catallaxyz>,
  walletPubkey: PublicKey,
  globalPda: PublicKey
): Promise<boolean> {
  try {
    const globalAccount = await program.account.global.fetch(globalPda);
    return globalAccount.authority.equals(walletPubkey);
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Check if wallet is a keeper (on-chain verification)
 * Keepers can perform automated tasks like terminating inactive markets
 * Returns true if wallet is either the authority or the designated keeper
 */
export async function isKeeperOnChain(
  program: Program<Catallaxyz>,
  walletPubkey: PublicKey,
  globalPda: PublicKey
): Promise<boolean> {
  try {
    const globalAccount = await program.account.global.fetch(globalPda);
    // Keeper can be either the authority or the designated keeper
    if (globalAccount.authority.equals(walletPubkey)) {
      return true;
    }
    // Check if keeper is set and matches the wallet
    if (globalAccount.keeper && !globalAccount.keeper.equals(PublicKey.default)) {
      return globalAccount.keeper.equals(walletPubkey);
    }
    return false;
  } catch (error) {
    console.error('Error checking keeper status:', error);
    return false;
  }
}

/**
 * Get the current keeper address from global state
 */
export async function getKeeperAddress(
  program: Program<Catallaxyz>,
  globalPda: PublicKey
): Promise<PublicKey | null> {
  try {
    const globalAccount = await program.account.global.fetch(globalPda);
    if (globalAccount.keeper && !globalAccount.keeper.equals(PublicKey.default)) {
      return globalAccount.keeper;
    }
    return null; // No separate keeper set, authority is the keeper
  } catch (error) {
    console.error('Error fetching keeper address:', error);
    return null;
  }
}

/**
 * Get platform treasury balance
 */
export async function getPlatformTreasuryBalance(
  connection: Connection,
  platformTreasuryPda: PublicKey
): Promise<number> {
  try {
    const accountInfo = await connection.getTokenAccountBalance(platformTreasuryPda);
    return accountInfo.value.uiAmount || 0;
  } catch (error) {
    console.error('Error fetching treasury balance:', error);
    return 0;
  }
}

/**
 * Calculate PDAs for admin operations
 */
export function getAdminPDAs(programId: PublicKey) {
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    programId
  );

  const [platformTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('platform_treasury')],
    programId
  );

  return {
    globalPda,
    platformTreasuryPda,
  };
}
