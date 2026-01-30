import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import type { Catallaxyz } from "../../target/types/catallaxyz";
import { INACTIVITY_TIMEOUT_SECONDS } from "../../shared/constants";
import { TerminationReason } from "../../shared/types";
import { createLogger } from "./logger";
// AUDIT FIX v1.2.5: Import shared validation functions instead of duplicating
import { parseBool, parseNum, validatePublicKey as validatePubKey } from "./env-validation";
// Use shared PDA and ATA utilities
import {
  deriveGlobalPda as sharedDeriveGlobalPda,
  deriveMarketPdas as sharedDeriveMarketPdas,
  resolveUsdcAccounts as sharedResolveUsdcAccounts,
} from "@catallaxyz/shared";

// AUDIT FIX v1.1.2: Use structured logging
const logger = createLogger('termination');

// ============================================
// Type Definitions for Account Data
// ============================================

/**
 * Global account data from on-chain program
 */
export interface GlobalAccount {
  authority: PublicKey;
  usdcMint: PublicKey;
  platformFeeRate: anchor.BN;
  makerRebateRate: anchor.BN;
  centerTakerFeeRate: anchor.BN;
  extremeTakerFeeRate: anchor.BN;
  creatorIncentiveRate: anchor.BN;
  platformTreasury: PublicKey;
  creatorTreasury: PublicKey;
  bump: number;
}

/**
 * Market account data from on-chain program
 */
export interface MarketAccount {
  creator: PublicKey;
  global: PublicKey;
  marketId: number[];
  status: number;
  isPaused: boolean;
  pausedAt: anchor.BN | null;
  totalTrades: anchor.BN;
  totalPositionCollateral: anchor.BN;
  lastTradeYesPrice: anchor.BN | null;
  lastTradeNoPrice: anchor.BN | null;
  lastActivityTimestamp: anchor.BN;
  lastActivitySlot: anchor.BN;
  lastTradeOutcome: number | null;
  referenceAgent: PublicKey | null;
  createdAt: anchor.BN;
  switchboardQueue: PublicKey | null;
  randomnessAccount: PublicKey | null;
  bump: number;
}

export type TerminationLogEntry = {
  market: string;
  tx: string;
  terminatedAt: string;
  executor: string;
  reason: TerminationReason;
};

export const LOG_PATH = path.resolve("backend/db/termination_log.json");
export const DEFAULT_INACTIVITY_SECONDS = INACTIVITY_TIMEOUT_SECONDS;

export const loadIdl = () => {
  const idlPath = path.resolve("target/idl/catallaxyz.json");
  if (!fs.existsSync(idlPath)) {
    throw new Error("IDL not found. Run: anchor build");
  }
  return JSON.parse(fs.readFileSync(idlPath, "utf8"));
};

export const readTerminationLog = (): TerminationLogEntry[] => {
  try {
    if (!fs.existsSync(LOG_PATH)) {
      return [];
    }
    const raw = fs.readFileSync(LOG_PATH, "utf8").trim();
    if (!raw) {
      return [];
    }
    return JSON.parse(raw) as TerminationLogEntry[];
  } catch (err) {
    // AUDIT FIX v1.1.2: Use structured logging
    logger.error("Failed to read termination log", err);
    return [];
  }
};

/**
 * Write termination log atomically using temp file + rename
 * This ensures the log file is never corrupted if the process crashes mid-write
 */
export const writeTerminationLog = (entries: TerminationLogEntry[]) => {
  try {
    const dir = path.dirname(LOG_PATH);
    const tempPath = `${LOG_PATH}.tmp`;
    
    // Ensure directory exists
    fs.mkdirSync(dir, { recursive: true });
    
    // Write to temp file first
    fs.writeFileSync(tempPath, JSON.stringify(entries, null, 2));
    
    // Atomic rename (overwrites existing file)
    fs.renameSync(tempPath, LOG_PATH);
  } catch (err) {
    // AUDIT FIX v1.1.2: Use structured logging
    logger.error("Failed to write termination log", err);
    throw err;
  }
};

export const getProgram = (provider = anchor.AnchorProvider.env()) => {
  anchor.setProvider(provider);
  const idl = loadIdl();
  const programId = new PublicKey(idl.address);
  const program = new Program(idl, provider) as Program<Catallaxyz>;
  return { program, programId, provider };
};

// Re-export shared PDA utilities for backward compatibility
export const deriveGlobalPda = sharedDeriveGlobalPda;
export const deriveMarketPdas = sharedDeriveMarketPdas;

// AUDIT FIX v1.2.6: Removed deprecated parseBooleanEnv and parseNumberEnv functions
// Use parseBool and parseNum from env-validation.ts directly

/**
 * Parse and validate a required public key from string
 */
export const parsePublicKey = (value: string | undefined, name: string): PublicKey => {
  if (!value) {
    throw new Error(`Missing env ${name}`);
  }
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid ${name}: ${value}`);
  }
};

/**
 * Parse and validate an optional public key from string
 */
export const parseOptionalPublicKey = (value: string | undefined, name: string): PublicKey | undefined => {
  if (!value) {
    return undefined;
  }
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid ${name}: ${value}`);
  }
};

type ResolveUsdcAccountsArgs = {
  usdcMint: PublicKey;
  creator: PublicKey;
  authority: PublicKey;
  creatorOverride?: string;
  adminOverride?: string;
};

/**
 * Resolve USDC accounts using shared utility
 * Wraps sharedResolveUsdcAccounts for backward compatibility (adminUsdcAccount alias)
 */
export const resolveUsdcAccounts = ({
  usdcMint,
  creator,
  authority,
  creatorOverride,
  adminOverride,
}: ResolveUsdcAccountsArgs) => {
  const { creatorUsdcAccount, authorityUsdcAccount } = sharedResolveUsdcAccounts({
    usdcMint,
    creator,
    authority,
    creatorOverride,
    authorityOverride: adminOverride,
  });

  return { creatorUsdcAccount, adminUsdcAccount: authorityUsdcAccount };
};

// ============================================
// Shared Termination Executor
// ============================================

export type TerminateMarketArgs = {
  program: Program<Catallaxyz>;
  programId: PublicKey;
  market: PublicKey;
  globalPda: PublicKey;
  globalAccount: GlobalAccount;
  authority: PublicKey;
  marketAccount?: MarketAccount;
};

/**
 * Build a termination instruction without executing it
 * Used for batch transactions
 */
export const buildTerminationInstruction = async ({
  program,
  programId,
  market,
  globalPda,
  globalAccount,
  authority,
  marketAccount,
}: TerminateMarketArgs) => {
  const { marketUsdcVault, platformTreasury, creatorTreasury } = deriveMarketPdas(
    programId,
    market
  );

  const usdcMint = globalAccount.usdcMint;
  const creator = marketAccount
    ? marketAccount.creator
    : ((await program.account.market.fetch(market)) as unknown as MarketAccount).creator;

  const { creatorUsdcAccount, adminUsdcAccount } = resolveUsdcAccounts({
    usdcMint,
    creator,
    authority,
    creatorOverride: process.env.CREATOR_USDC_ACCOUNT,
    adminOverride: process.env.ADMIN_USDC_ACCOUNT,
  });

  const instruction = await program.methods
    .terminateIfInactive()
    .accounts({
      global: globalPda,
      authority,
      market,
      marketUsdcVault,
      platformTreasury,
      creatorTreasury,
      creatorUsdcAccount,
      callerUsdcAccount: adminUsdcAccount,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return instruction;
};

export const executeTermination = async ({
  program,
  programId,
  market,
  globalPda,
  globalAccount,
  authority,
  marketAccount,
}: TerminateMarketArgs): Promise<string> => {
  const { marketUsdcVault, platformTreasury, creatorTreasury } = deriveMarketPdas(
    programId,
    market
  );

  const usdcMint = globalAccount.usdcMint;
  const creator = marketAccount
    ? marketAccount.creator
    : ((await program.account.market.fetch(market)) as unknown as MarketAccount).creator;

  const { creatorUsdcAccount, adminUsdcAccount } = resolveUsdcAccounts({
    usdcMint,
    creator,
    authority,
    creatorOverride: process.env.CREATOR_USDC_ACCOUNT,
    adminOverride: process.env.ADMIN_USDC_ACCOUNT,
  });

  const tx = await program.methods
    .terminateIfInactive()
    .accounts({
      global: globalPda,
      authority,
      market,
      marketUsdcVault,
      platformTreasury,
      creatorTreasury,
      creatorUsdcAccount,
      callerUsdcAccount: adminUsdcAccount,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  return tx;
};
