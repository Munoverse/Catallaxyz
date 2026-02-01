/**
 * Anchor Client Utilities
 * AUDIT FIX v2.0.5: Consolidated Anchor Provider creation
 * 
 * This module provides a unified way to create and manage Anchor providers
 * and programs across the codebase.
 * 
 * Note: This module requires @coral-xyz/anchor as a peer dependency.
 * Import Anchor types dynamically when needed to avoid build issues in
 * environments without Anchor.
 */

import { Connection, Keypair, PublicKey, Commitment } from '@solana/web3.js';

// ============================================
// Types
// ============================================

export interface AnchorClientConfig {
  /** Solana RPC URL */
  rpcUrl?: string;
  /** Commitment level */
  commitment?: Commitment;
  /** Pre-flight commitment */
  preflightCommitment?: Commitment;
}

export interface ProgramConfig {
  /** Program ID */
  programId: PublicKey;
  /** IDL (Interface Definition Language) */
  idl: any;
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';
const DEFAULT_COMMITMENT: Commitment = 'confirmed';

// ============================================
// Connection Management
// ============================================

let _connection: Connection | null = null;

/**
 * Get or create a Solana connection
 * Uses singleton pattern to reuse connection
 */
export function getConnection(config?: AnchorClientConfig): Connection {
  const rpcUrl = config?.rpcUrl || process.env.SOLANA_RPC_URL || DEFAULT_RPC_URL;
  const commitment = config?.commitment || DEFAULT_COMMITMENT;

  // Create new connection if URL changed or doesn't exist
  if (!_connection) {
    _connection = new Connection(rpcUrl, commitment);
  }

  return _connection;
}

/**
 * Create a new connection (doesn't use singleton)
 */
export function createConnection(config?: AnchorClientConfig): Connection {
  const rpcUrl = config?.rpcUrl || process.env.SOLANA_RPC_URL || DEFAULT_RPC_URL;
  const commitment = config?.commitment || DEFAULT_COMMITMENT;
  return new Connection(rpcUrl, commitment);
}

// ============================================
// Provider Management
// Note: These are factory function signatures for use with Anchor
// The actual Anchor imports should be done by the consumer
// ============================================

/**
 * Configuration object for creating Anchor providers
 * Consumer should use these options with their own Anchor imports
 */
export function getProviderOptions(config?: AnchorClientConfig) {
  return {
    commitment: config?.commitment || DEFAULT_COMMITMENT,
    preflightCommitment: config?.preflightCommitment || DEFAULT_COMMITMENT,
  };
}

/**
 * Example usage for consumers with Anchor:
 * 
 * ```typescript
 * import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
 * import { getConnection, getProviderOptions, loadKeypairFromEnv } from '@catallaxyz/shared';
 * 
 * const wallet = loadKeypairFromEnv('KEEPER_SECRET_KEY');
 * const connection = getConnection();
 * const anchorWallet = new Wallet(wallet);
 * const provider = new AnchorProvider(connection, anchorWallet, getProviderOptions());
 * const program = new Program(IDL, provider);
 * ```
 */

// ============================================
// Keypair Loading
// ============================================

/**
 * Load a keypair from a JSON secret key string
 */
export function loadKeypairFromJson(secretKeyJson: string): Keypair {
  try {
    const secretKey = JSON.parse(secretKeyJson);
    return Keypair.fromSecretKey(new Uint8Array(secretKey));
  } catch (error) {
    throw new Error('Invalid secret key JSON format. Expected JSON array of numbers.');
  }
}

/**
 * Load a keypair from environment variable
 */
export function loadKeypairFromEnv(envVarName: string): Keypair {
  const secretKey = process.env[envVarName];
  if (!secretKey) {
    throw new Error(`Environment variable ${envVarName} is not configured`);
  }
  return loadKeypairFromJson(secretKey);
}

// ============================================
// PDA Utilities
// Note: Additional PDA derivation functions are in ./solana/pda.ts
// ============================================

/**
 * Find PDA with common seeds
 */
export function findPda(
  seeds: Array<Buffer | Uint8Array>,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

/**
 * Derive market PDA (not in solana/pda.ts)
 */
export function deriveMarketPda(
  programId: PublicKey,
  creator: PublicKey,
  nonce: Buffer | Uint8Array
): PublicKey {
  const [pda] = findPda(
    [Buffer.from('market'), creator.toBuffer(), nonce],
    programId
  );
  return pda;
}

/**
 * Derive reward treasury PDA (not in solana/pda.ts)
 */
export function deriveRewardTreasuryPda(programId: PublicKey): PublicKey {
  const [pda] = findPda([Buffer.from('reward_treasury')], programId);
  return pda;
}

/**
 * Derive VRF treasury PDA (not in solana/pda.ts)
 */
export function deriveVrfTreasuryPda(programId: PublicKey): PublicKey {
  const [pda] = findPda([Buffer.from('vrf_treasury')], programId);
  return pda;
}
