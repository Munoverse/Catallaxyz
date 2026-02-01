import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

const DEFAULT_SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

export function getSolanaRpcUrl() {
  return DEFAULT_SOLANA_RPC_URL;
}

export function getConnection(): Connection {
  return new Connection(getSolanaRpcUrl(), 'confirmed');
}

export function isValidSolanaAddress(address: string) {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// Keypair Loading Functions
// ============================================

/**
 * Load the Keeper keypair from environment variable
 * Used for automated operations like termination, fee updates, etc.
 * 
 * @throws Error if KEEPER_SECRET_KEY is not configured
 */
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

// ============================================
// Token Account Functions
// ============================================

/**
 * Ensure an Associated Token Account exists, creating if necessary
 * 
 * @param connection - Solana connection
 * @param payer - Keypair to pay for account creation
 * @param mint - Token mint address
 * @param owner - Account owner
 * @returns ATA public key
 */
export async function ensureAta(
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

/**
 * Get ATA address without creating
 */
export async function getAta(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
  return getAssociatedTokenAddress(mint, owner);
}

export type TransactionVerificationResult = {
  ok: boolean;
  error?: string;
  slot?: number | null;
  blockTime?: string | null;
};

export async function verifyOnChainTransaction({
  transactionSignature,
  walletAddress,
}: {
  transactionSignature: string;
  walletAddress: string;
}): Promise<TransactionVerificationResult> {
  const connection = new Connection(getSolanaRpcUrl(), 'confirmed');
  const transaction = await connection.getParsedTransaction(transactionSignature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!transaction) {
    return { ok: false, error: 'Transaction not found' };
  }

  if (transaction.meta?.err) {
    return { ok: false, error: 'Transaction failed' };
  }

  const signerMatch = transaction.transaction.message.accountKeys.some((account) => {
    return account.pubkey.toBase58() === walletAddress && account.signer;
  });

  if (!signerMatch) {
    return { ok: false, error: 'Transaction not signed by wallet' };
  }

  const blockTime = transaction.blockTime
    ? new Date(transaction.blockTime * 1000).toISOString()
    : null;

  return {
    ok: true,
    slot: transaction.slot ?? null,
    blockTime,
  };
}
