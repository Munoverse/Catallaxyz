/**
 * Treasury Initialization Utilities
 * AUDIT FIX v2.0.5: Consolidated treasury initialization logic
 * 
 * This module provides shared functions for initializing various treasuries
 * used by initialize-devnet.ts and initialize-mainnet.ts
 */

import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { getConnection, loadWallet, printConfig } from "./anchor-config.js";

// ============================================
// Types
// ============================================

export interface TreasuryConfig {
  /** Treasury name for logging */
  name: string;
  /** PDA seed */
  seed: string;
  /** Whether this is a token account treasury */
  isTokenAccount: boolean;
}

export interface InitTreasuryParams {
  program: Program;
  connection: Connection;
  payer: Keypair;
  usdcMint: PublicKey;
  programId: PublicKey;
}

export interface TreasuryResult {
  name: string;
  address: PublicKey;
  initialized: boolean;
  signature?: string;
}

// ============================================
// Treasury Configurations
// ============================================

export const TREASURY_CONFIGS: Record<string, TreasuryConfig> = {
  platform: {
    name: "Platform Treasury",
    seed: "platform_treasury",
    isTokenAccount: true,
  },
  creator: {
    name: "Creator Treasury",
    seed: "creator_treasury",
    isTokenAccount: true,
  },
  reward: {
    name: "Reward Treasury",
    seed: "reward_treasury",
    isTokenAccount: true,
  },
  vrf: {
    name: "VRF Treasury",
    seed: "vrf_treasury",
    isTokenAccount: true,
  },
};

// ============================================
// PDA Derivation
// ============================================

/**
 * Derive a treasury PDA
 */
export function deriveTreasuryPda(
  seed: string,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(seed)],
    programId
  );
}

/**
 * Derive global PDA
 */
export function deriveGlobalPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  );
}

// ============================================
// Treasury Initialization
// ============================================

/**
 * Check if a treasury account exists
 */
export async function treasuryExists(
  connection: Connection,
  treasuryPda: PublicKey
): Promise<boolean> {
  const accountInfo = await connection.getAccountInfo(treasuryPda);
  return accountInfo !== null;
}

/**
 * Initialize a single treasury
 */
export async function initializeTreasury(
  params: InitTreasuryParams,
  config: TreasuryConfig
): Promise<TreasuryResult> {
  const { program, connection, payer, usdcMint, programId } = params;
  const [treasuryPda] = deriveTreasuryPda(config.seed, programId);

  console.log(`\n📦 Checking ${config.name}...`);
  console.log(`   PDA: ${treasuryPda.toString()}`);

  // Check if already exists
  const exists = await treasuryExists(connection, treasuryPda);
  if (exists) {
    console.log(`   ✅ Already initialized`);
    return {
      name: config.name,
      address: treasuryPda,
      initialized: false, // Already existed
    };
  }

  console.log(`   🔄 Initializing...`);

  try {
    // Get the initialize method based on treasury type
    const methodName = getInitMethodName(config.seed);
    const [globalPda] = deriveGlobalPda(programId);

    let signature: string;

    if (config.isTokenAccount) {
      // For token account treasuries
      signature = await (program.methods as any)[methodName]()
        .accounts({
          authority: payer.publicKey,
          global: globalPda,
          treasury: treasuryPda,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: PublicKey.default,
        })
        .signers([payer])
        .rpc();
    } else {
      // For non-token treasuries
      signature = await (program.methods as any)[methodName]()
        .accounts({
          authority: payer.publicKey,
          global: globalPda,
          treasury: treasuryPda,
          systemProgram: PublicKey.default,
        })
        .signers([payer])
        .rpc();
    }

    console.log(`   ✅ Initialized! Signature: ${signature}`);
    return {
      name: config.name,
      address: treasuryPda,
      initialized: true,
      signature,
    };
  } catch (error: any) {
    // Handle "already initialized" error gracefully
    if (error.message?.includes("already in use") || 
        error.message?.includes("already initialized")) {
      console.log(`   ✅ Already initialized (concurrent init)`);
      return {
        name: config.name,
        address: treasuryPda,
        initialized: false,
      };
    }
    throw error;
  }
}

/**
 * Get the initialization method name for a treasury
 */
function getInitMethodName(seed: string): string {
  switch (seed) {
    case "platform_treasury":
      return "initializePlatformTreasury";
    case "creator_treasury":
      return "initializeCreatorTreasury";
    case "reward_treasury":
      return "initializeRewardTreasury";
    case "vrf_treasury":
      return "initializeVrfTreasury";
    default:
      throw new Error(`Unknown treasury seed: ${seed}`);
  }
}

/**
 * Initialize all treasuries
 */
export async function initializeAllTreasuries(
  params: InitTreasuryParams
): Promise<TreasuryResult[]> {
  const results: TreasuryResult[] = [];

  for (const [key, config] of Object.entries(TREASURY_CONFIGS)) {
    try {
      const result = await initializeTreasury(params, config);
      results.push(result);
    } catch (error: any) {
      console.error(`   ❌ Failed to initialize ${config.name}:`, error.message);
      results.push({
        name: config.name,
        address: deriveTreasuryPda(config.seed, params.programId)[0],
        initialized: false,
      });
    }
  }

  return results;
}

// ============================================
// ATA Management
// ============================================

/**
 * Ensure an Associated Token Account exists
 */
export async function ensureAta(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, true);
  
  const accountInfo = await connection.getAccountInfo(ata);
  if (accountInfo) {
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
  await connection.confirmTransaction(signature, "confirmed");

  return ata;
}

// ============================================
// Summary Printing
// ============================================

/**
 * Print initialization summary
 */
export function printInitSummary(results: TreasuryResult[]): void {
  console.log("\n" + "=".repeat(60));
  console.log("📊 Initialization Summary");
  console.log("=".repeat(60));

  const initialized = results.filter((r) => r.initialized);
  const existing = results.filter((r) => !r.initialized);

  if (initialized.length > 0) {
    console.log(`\n✅ Newly Initialized (${initialized.length}):`);
    for (const r of initialized) {
      console.log(`   - ${r.name}: ${r.address.toString().slice(0, 20)}...`);
    }
  }

  if (existing.length > 0) {
    console.log(`\n📌 Already Existed (${existing.length}):`);
    for (const r of existing) {
      console.log(`   - ${r.name}: ${r.address.toString().slice(0, 20)}...`);
    }
  }

  console.log("\n" + "=".repeat(60));
}
