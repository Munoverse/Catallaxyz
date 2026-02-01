/**
 * Solana Account Calculation Utilities
 * 
 * This module provides utilities for calculating PDAs (Program Derived Addresses)
 * and ATAs (Associated Token Accounts) for the catallaxyz program.
 */

import { 
  address, 
  type Address, 
  getProgramDerivedAddress,
} from '@solana/addresses';
import { PROGRAM_ID, USDC_MINT } from '../solana';
import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';

/**
 * Get associated token address using @solana/spl-token
 */
async function getAssociatedTokenAddress({
  mint,
  owner,
}: {
  mint: Address;
  owner: Address;
}): Promise<Address> {
  const mintPubkey = new PublicKey(mint);
  const ownerPubkey = new PublicKey(owner);
  const ata = getAssociatedTokenAddressSync(mintPubkey, ownerPubkey);
  return ata.toBase58() as Address;
}

/**
 * Calculate Global PDA
 */
export async function getGlobalPda(): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [new TextEncoder().encode('global')],
  });
  return pda;
}

/**
 * Calculate Market PDA
 * @param creator Creator's public key
 */
export async function getMarketPda(creator: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [
      new TextEncoder().encode('market'),
      creator,
    ],
  });
  return pda;
}

/**
 * Calculate YES Token Mint PDA
 * @param marketPda Market PDA address
 */
export async function getYesTokenMintPda(marketPda: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [
      new TextEncoder().encode('yes_token'),
      marketPda,
    ],
  });
  return pda;
}

/**
 * Calculate NO Token Mint PDA
 * @param marketPda Market PDA address
 */
export async function getNoTokenMintPda(marketPda: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [
      new TextEncoder().encode('no_token'),
      marketPda,
    ],
  });
  return pda;
}

/**
 * Calculate Market USDC Vault PDA
 * @param marketPda Market PDA address
 */
export async function getMarketUsdcVaultPda(marketPda: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [
      new TextEncoder().encode('market_vault'),
      marketPda,
    ],
  });
  return pda;
}

/**
 * Calculate Associated Token Account (ATA) for a user and mint
 * @param owner Owner's public key
 * @param mint Mint address
 */
export async function getAssociatedTokenAccount(
  owner: Address,
  mint: Address
): Promise<Address> {
  return await getAssociatedTokenAddress({
    mint,
    owner,
  });
}

/**
 * Calculate User USDC ATA
 * @param userAddress User's public key
 */
export async function getUserUsdcAccount(userAddress: Address): Promise<Address> {
  return await getAssociatedTokenAccount(userAddress, USDC_MINT);
}

/**
 * Calculate User YES Token ATA
 * @param userAddress User's public key
 * @param marketPda Market PDA address
 */
export async function getUserYesTokenAccount(
  userAddress: Address,
  marketPda: Address
): Promise<Address> {
  const yesTokenMint = await getYesTokenMintPda(marketPda);
  return await getAssociatedTokenAccount(userAddress, yesTokenMint);
}

/**
 * Calculate User NO Token ATA
 * @param userAddress User's public key
 * @param marketPda Market PDA address
 */
export async function getUserNoTokenAccount(
  userAddress: Address,
  marketPda: Address
): Promise<Address> {
  const noTokenMint = await getNoTokenMintPda(marketPda);
  return await getAssociatedTokenAccount(userAddress, noTokenMint);
}

/**
 * Market Account Structure
 * Contains all PDAs and ATAs needed for market operations
 */
export interface MarketAccounts {
  marketPda: Address;
  globalPda: Address;
  yesTokenMint: Address;
  noTokenMint: Address;
  marketUsdcVault: Address;
  userUsdcAccount: Address;
  userYesTokenAccount: Address;
  userNoTokenAccount: Address;
}

/**
 * Calculate all accounts needed for a market operation
 * @param marketPda Market PDA address
 * @param userAddress User's public key
 */
export async function getMarketAccounts(
  marketPda: Address,
  userAddress: Address
): Promise<MarketAccounts> {
  const [
    globalPda,
    yesTokenMint,
    noTokenMint,
    marketUsdcVault,
    userUsdcAccount,
    userYesTokenAccount,
    userNoTokenAccount,
  ] = await Promise.all([
    getGlobalPda(),
    getYesTokenMintPda(marketPda),
    getNoTokenMintPda(marketPda),
    getMarketUsdcVaultPda(marketPda),
    getUserUsdcAccount(userAddress),
    getUserYesTokenAccount(userAddress, marketPda),
    getUserNoTokenAccount(userAddress, marketPda),
  ]);

  return {
    marketPda,
    globalPda,
    yesTokenMint,
    noTokenMint,
    marketUsdcVault,
    userUsdcAccount,
    userYesTokenAccount,
    userNoTokenAccount,
  };
}

// AUDIT FIX F-C4: Re-export address conversion utilities from wallet.ts to avoid duplication
// Import from centralized location instead of duplicating
export { addressToPublicKey, publicKeyToAddress } from './wallet';

