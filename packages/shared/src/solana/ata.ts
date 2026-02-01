/**
 * Associated Token Account utilities
 *
 * Shared ATA creation and resolution logic.
 *
 * @packageDocumentation
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

// ============================================
// ATA Resolution
// ============================================

export interface ResolveUsdcAccountsArgs {
  usdcMint: PublicKey;
  creator: PublicKey;
  authority: PublicKey;
  creatorOverride?: string;
  authorityOverride?: string;
}

/**
 * Parse and validate an optional public key from string
 */
function parseOptionalPublicKey(
  value: string | undefined,
  name: string
): PublicKey | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid ${name}: ${value}`);
  }
}

/**
 * Resolve USDC token accounts for creator and authority
 *
 * Uses override values if provided, otherwise derives ATAs.
 */
export function resolveUsdcAccounts({
  usdcMint,
  creator,
  authority,
  creatorOverride,
  authorityOverride,
}: ResolveUsdcAccountsArgs) {
  const creatorOverrideKey = parseOptionalPublicKey(
    creatorOverride,
    'CREATOR_USDC_ACCOUNT'
  );
  const authorityOverrideKey = parseOptionalPublicKey(
    authorityOverride,
    'AUTHORITY_USDC_ACCOUNT'
  );

  const creatorUsdcAccount = creatorOverrideKey
    ? creatorOverrideKey
    : getAssociatedTokenAddressSync(usdcMint, creator, false, TOKEN_PROGRAM_ID);

  const authorityUsdcAccount = authorityOverrideKey
    ? authorityOverrideKey
    : getAssociatedTokenAddressSync(
        usdcMint,
        authority,
        false,
        TOKEN_PROGRAM_ID
      );

  return { creatorUsdcAccount, authorityUsdcAccount };
}

// ============================================
// ATA Creation
// ============================================

/**
 * Ensure an ATA exists for the given owner, creating it if needed
 *
 * @param connection Solana connection
 * @param payer Keypair to pay for account creation
 * @param mint Token mint address
 * @param owner Owner of the ATA
 * @returns ATA address
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
 * Get ATA address synchronously (does not create)
 */
export function getAtaAddress(mint: PublicKey, owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
}
