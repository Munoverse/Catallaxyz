/**
 * Catallaxyz PDA derivation utilities
 *
 * Shared between apps/backend and contracts/backend
 * to avoid duplicating PDA derivation logic.
 *
 * @packageDocumentation
 */

import { PublicKey } from '@solana/web3.js';

// ============================================
// PDA Seeds (must match on-chain constants)
// ============================================

export const PDA_SEEDS = {
  GLOBAL: 'global',
  PLATFORM_TREASURY: 'platform_treasury',
  CREATOR_TREASURY: 'creator_treasury',
  MARKET_VAULT: 'market_vault',
  USER_POSITION: 'user_position',
  USER_BALANCE: 'user_balance',
} as const;

// ============================================
// Global PDAs
// ============================================

/**
 * Derive the global state PDA
 */
export function deriveGlobalPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.GLOBAL)],
    programId
  );
  return pda;
}

/**
 * Derive the platform treasury PDA
 */
export function derivePlatformTreasuryPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.PLATFORM_TREASURY)],
    programId
  );
  return pda;
}

/**
 * Derive the creator treasury PDA
 */
export function deriveCreatorTreasuryPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.CREATOR_TREASURY)],
    programId
  );
  return pda;
}

// ============================================
// Market PDAs
// ============================================

/**
 * Derive all market-related PDAs at once
 */
export function deriveMarketPdas(programId: PublicKey, market: PublicKey) {
  const [marketUsdcVault] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.MARKET_VAULT), market.toBuffer()],
    programId
  );
  const [platformTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.PLATFORM_TREASURY)],
    programId
  );
  const [creatorTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.CREATOR_TREASURY)],
    programId
  );
  return { marketUsdcVault, platformTreasury, creatorTreasury };
}

/**
 * Derive the market USDC vault PDA
 */
export function deriveMarketVaultPda(
  programId: PublicKey,
  market: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.MARKET_VAULT), market.toBuffer()],
    programId
  );
  return pda;
}

// ============================================
// User PDAs
// ============================================

/**
 * Derive user position PDA
 */
export function deriveUserPositionPda(
  programId: PublicKey,
  market: PublicKey,
  user: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.USER_POSITION), market.toBuffer(), user.toBuffer()],
    programId
  );
  return pda;
}

/**
 * Derive user balance PDA (for CLOB)
 */
export function deriveUserBalancePda(
  programId: PublicKey,
  market: PublicKey,
  user: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.USER_BALANCE), market.toBuffer(), user.toBuffer()],
    programId
  );
  return pda;
}
