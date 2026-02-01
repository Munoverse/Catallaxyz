/**
 * Token Account Utilities
 * Helper functions for managing SPL Token accounts
 */

import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';

/**
 * Get or create an Associated Token Account (ATA)
 * @param connection Solana connection
 * @param wallet User wallet
 * @param mint Token mint address
 * @param owner Token account owner (usually wallet.publicKey)
 * @returns Token account address
 */
export async function getOrCreateTokenAccount(
  connection: Connection,
  wallet: any,
  mint: PublicKey,
  owner: PublicKey,
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID
): Promise<{ address: PublicKey; instruction?: TransactionInstruction }> {
  const ata = await getAssociatedTokenAddress(
    mint,
    owner,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  try {
    // Try to get account info
    const accountInfo = await connection.getAccountInfo(ata);
    
    if (accountInfo) {
      // Account exists
      return { address: ata };
    }
  } catch (error) {
    console.log('Token account does not exist, will create');
  }

  // Account doesn't exist, create instruction
  const instruction = createAssociatedTokenAccountInstruction(
    wallet.publicKey,
    ata,
    owner,
    mint,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  return { address: ata, instruction };
}

/**
 * Get token balance for a token account
 * @param connection Solana connection
 * @param tokenAccount Token account address
 * @returns Balance as a number (with decimals applied)
 */
export async function getTokenBalance(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<number> {
  try {
    const info = await connection.getTokenAccountBalance(tokenAccount);
    return parseFloat(info.value.amount) / Math.pow(10, info.value.decimals);
  } catch (error) {
    console.error('Error fetching token balance:', error);
    return 0;
  }
}

/**
 * Get token balance with raw amount
 * @param connection Solana connection
 * @param tokenAccount Token account address
 * @returns Balance object with amount and decimals
 */
export async function getTokenBalanceRaw(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<{ amount: string; decimals: number; uiAmount: number }> {
  try {
    const info = await connection.getTokenAccountBalance(tokenAccount);
    return {
      amount: info.value.amount,
      decimals: info.value.decimals,
      uiAmount: info.value.uiAmount || 0,
    };
  } catch (error) {
    console.error('Error fetching token balance:', error);
    return { amount: '0', decimals: 6, uiAmount: 0 };
  }
}

/**
 * Check if a token account exists
 * @param connection Solana connection
 * @param tokenAccount Token account address
 * @returns true if account exists
 */
export async function tokenAccountExists(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<boolean> {
  try {
    const info = await connection.getAccountInfo(tokenAccount);
    return info !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Get multiple token balances at once
 * @param connection Solana connection
 * @param tokenAccounts Array of token account addresses
 * @returns Array of balances
 */
export async function getMultipleTokenBalances(
  connection: Connection,
  tokenAccounts: PublicKey[]
): Promise<number[]> {
  try {
    const balances = await Promise.all(
      tokenAccounts.map((account) => getTokenBalance(connection, account))
    );
    return balances;
  } catch (error) {
    console.error('Error fetching multiple balances:', error);
    return tokenAccounts.map(() => 0);
  }
}

/**
 * Convert UI amount to raw amount (with decimals)
 * @param uiAmount Amount with decimals (e.g., 10.5)
 * @param decimals Token decimals (e.g., 6 for USDC)
 * @returns Raw amount as bigint
 */
export function toRawAmount(uiAmount: number, decimals: number): bigint {
  return BigInt(Math.floor(uiAmount * Math.pow(10, decimals)));
}

/**
 * Convert raw amount to UI amount (with decimals)
 * @param rawAmount Raw amount as string or bigint
 * @param decimals Token decimals
 * @returns UI amount as number
 */
export function toUIAmount(rawAmount: string | bigint, decimals: number): number {
  const amount = typeof rawAmount === 'string' ? BigInt(rawAmount) : rawAmount;
  return Number(amount) / Math.pow(10, decimals);
}

