'use client';

import { AnchorProvider, Program, web3 } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import idl from '../../target/idl/catallaxyz.json';
import type { Catallaxyz } from '../../target/types/catallaxyz';

const IDL = idl as unknown as Catallaxyz;

export type SignerLike = {
  publicKey: PublicKey;
  signTransaction: (tx: web3.Transaction) => Promise<web3.Transaction>;
  signAllTransactions: (txs: web3.Transaction[]) => Promise<web3.Transaction[]>;
};

export const getProgramId = () => {
  const programId = process.env.NEXT_PUBLIC_PROGRAM_ID;
  if (!programId) {
    throw new Error('Missing env var NEXT_PUBLIC_PROGRAM_ID');
  }
  return new PublicKey(programId);
};

export const getConnection = () => {
  return new web3.Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );
};

export const buildProvider = (connection: web3.Connection, signer: SignerLike) =>
  new AnchorProvider(
    connection,
    {
      publicKey: signer.publicKey,
      signTransaction: signer.signTransaction,
      signAllTransactions: signer.signAllTransactions,
    },
    { commitment: 'confirmed' }
  );

export const getReadOnlyProvider = (connection: web3.Connection) => {
  const dummyKey = web3.Keypair.generate().publicKey;
  const dummySigner: SignerLike = {
    publicKey: dummyKey,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  };
  return buildProvider(connection, dummySigner);
};

export const getProgram = (connection: web3.Connection, signer?: SignerLike) => {
  const provider = signer ? buildProvider(connection, signer) : getReadOnlyProvider(connection);
  return new Program(IDL, getProgramId(), provider) as Program<Catallaxyz>;
};

export const deriveGlobalPda = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from('global')], programId)[0];

export const deriveMarketPda = (
  programId: PublicKey,
  creator: PublicKey,
  marketId: Uint8Array
) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('market'), creator.toBuffer(), Buffer.from(marketId)],
    programId
  )[0];

export const deriveMarketVaultPda = (programId: PublicKey, market: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from('market_vault'), market.toBuffer()], programId)[0];

export const deriveCreatorTreasuryPda = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from('creator_treasury')], programId)[0];

export const derivePlatformTreasuryPda = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from('platform_treasury')], programId)[0];

export const deriveUserPositionPda = (
  programId: PublicKey,
  market: PublicKey,
  user: PublicKey
) => PublicKey.findProgramAddressSync([Buffer.from('user_position'), market.toBuffer(), user.toBuffer()], programId)[0];

export const deriveUserBalancePda = (
  programId: PublicKey,
  market: PublicKey,
  user: PublicKey
) => PublicKey.findProgramAddressSync([Buffer.from('user_balance'), market.toBuffer(), user.toBuffer()], programId)[0];
