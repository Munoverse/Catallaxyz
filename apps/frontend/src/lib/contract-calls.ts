/**
 * catallaxyz Call Utilities (positions-only)
 * 
 * Provides contract call helpers with SOL gas payment.
 * All users pay gas fees with native SOL.
 */

import { Program, BN } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, TransactionInstruction, Connection, VersionedTransaction, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import type { Catallaxyz } from '@/generated/catallaxyz/catallaxyz';

// Type alias for backward compatibility
type catallaxyz = Catallaxyz;
import { sendTransactionWithFeePolicy, type FeePaymentResult } from '@/lib/kora';

/** Wallet interface compatible with wallet-adapter and Phantom */
interface WalletAdapter {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>;
}

type WalletSigner = {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>;
};

/**
 * Gas payment options for contract calls
 * Note: These options are kept for backward compatibility but are now ignored.
 * All transactions use SOL for gas payment.
 */
export interface GasPaymentOptions {
  /** Whether this is a Phantom embedded wallet (OAuth login) - ignored */
  isEmbeddedWallet?: boolean;
  /** User's preferred fee token mint - ignored, SOL is always used */
  preferredFeeToken?: PublicKey | null;
}

function getWalletSigner(wallet: WalletAdapter): WalletSigner {
  if (!wallet?.publicKey || !wallet?.signTransaction || !wallet?.sendTransaction) {
    throw new Error('Wallet does not support transaction signing');
  }
  return {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction,
    sendTransaction: wallet.sendTransaction,
  };
}

/**
 * Send transaction with SOL gas payment
 * All wallet types pay with native SOL.
 */
async function sendWithFeePolicy({
  connection,
  wallet,
  instructions,
}: {
  connection: Connection;
  wallet: WalletAdapter;
  instructions: TransactionInstruction[];
  // These parameters are kept for backward compatibility but ignored
  isEmbeddedWallet?: boolean;
  preferredFeeToken?: PublicKey | null;
  usdcMint?: PublicKey;
}): Promise<FeePaymentResult> {
  const walletSigner = getWalletSigner(wallet);
  return sendTransactionWithFeePolicy({
    connection,
    walletSigner,
    instructions,
  });
}

export async function splitPositionSingle(
  program: Program<catallaxyz>,
  wallet: WalletAdapter,
  connection: Connection,
  params: {
    marketPda: PublicKey;
    amount: BN; // USDC lamports (6 decimals)
    usdcMint: PublicKey;
    /** Gas payment options - ignored, SOL is used for gas */
    gasPayment?: GasPaymentOptions;
  }
) {
  const { marketPda, amount, usdcMint } = params;
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    program.programId
  );
  const [marketVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('market_vault'), marketPda.toBuffer()],
    program.programId
  );
  const [userPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_position'), marketPda.toBuffer(), wallet.publicKey.toBuffer()],
    program.programId
  );
  const userUsdcAccount = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);

  // Note: Using 'as any' because some PDAs are auto-derived by Anchor
  const transaction = await (program.methods
    .splitPositionSingle({ amount })
    .accounts({
      user: wallet.publicKey,
      global: globalPda,
      market: marketPda,
      userUsdcAccount,
      marketUsdcVault: marketVault,
      userPosition,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as any))
    .transaction();

  const result = await sendWithFeePolicy({
    connection,
    wallet,
    instructions: transaction.instructions,
  });
  return result.signature;
}

export async function mergePositionSingle(
  program: Program<catallaxyz>,
  wallet: WalletAdapter,
  connection: Connection,
  params: {
    marketPda: PublicKey;
    amount: BN;
    usdcMint: PublicKey;
    /** Gas payment options - ignored, SOL is used for gas */
    gasPayment?: GasPaymentOptions;
  }
) {
  const { marketPda, amount, usdcMint } = params;
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    program.programId
  );
  const [marketVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('market_vault'), marketPda.toBuffer()],
    program.programId
  );
  const [userPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_position'), marketPda.toBuffer(), wallet.publicKey.toBuffer()],
    program.programId
  );
  const userUsdcAccount = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);

  const transaction = await (program.methods
    .mergePositionSingle({ amount })
    .accounts({
      user: wallet.publicKey,
      global: globalPda,
      market: marketPda,
      userUsdcAccount,
      marketUsdcVault: marketVault,
      userPosition,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as any))
    .transaction();

  const result = await sendWithFeePolicy({
    connection,
    wallet,
    instructions: transaction.instructions,
  });
  return result.signature;
}

export async function redeemSingleOutcome(
  program: Program<catallaxyz>,
  wallet: WalletAdapter,
  connection: Connection,
  params: {
    marketPda: PublicKey;
    userPositionPda: PublicKey;
    marketVault: PublicKey;
    userUsdcAccount: PublicKey;
    usdcMint: PublicKey;
    outcomeType: 0 | 1;
    tokenAmount: BN;
    /** Gas payment options - ignored, SOL is used for gas */
    gasPayment?: GasPaymentOptions;
  }
) {
  const {
    marketPda,
    userPositionPda,
    marketVault,
    userUsdcAccount,
    usdcMint,
    outcomeType,
    tokenAmount,
  } = params;

  const transaction = await (program.methods
    .redeemSingleOutcome({
      questionIndex: 0,
      outcomeType,
      tokenAmount,
    })
    .accounts({
      market: marketPda,
      userOutcomeToken: userPositionPda,
      marketVault,
      userUsdcAccount,
      usdcMint,
      user: wallet.publicKey,
    } as any))
    .transaction();

  const result = await sendWithFeePolicy({
    connection,
    wallet,
    instructions: transaction.instructions,
  });
  return result.signature;
}

// ============================================
// AUDIT FIX CRIT-3: Add missing contract call functions
// ============================================

/**
 * Deposit USDC to market vault
 * This locks USDC in the market for trading
 */
export async function depositUsdc(
  program: Program<catallaxyz>,
  wallet: WalletAdapter,
  connection: Connection,
  params: {
    marketPda: PublicKey;
    amount: BN; // USDC lamports (6 decimals)
    usdcMint: PublicKey;
    /** Gas payment options - ignored, SOL is used for gas */
    gasPayment?: GasPaymentOptions;
  }
) {
  const { marketPda, amount, usdcMint } = params;
  
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    program.programId
  );
  const [marketVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('market_vault'), marketPda.toBuffer()],
    program.programId
  );
  const [userBalance] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_balance'), marketPda.toBuffer(), wallet.publicKey.toBuffer()],
    program.programId
  );
  const userUsdcAccount = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);

  const transaction = await (program.methods
    .depositUsdc({ amount })
    .accounts({
      user: wallet.publicKey,
      global: globalPda,
      market: marketPda,
      userUsdcAccount,
      marketUsdcVault: marketVault,
      userBalance,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as any))
    .transaction();

  const result = await sendWithFeePolicy({
    connection,
    wallet,
    instructions: transaction.instructions,
  });
  return result.signature;
}

/**
 * Withdraw USDC from market vault
 * This unlocks USDC from the market
 */
export async function withdrawUsdc(
  program: Program<catallaxyz>,
  wallet: WalletAdapter,
  connection: Connection,
  params: {
    marketPda: PublicKey;
    amount: BN; // USDC lamports (6 decimals)
    usdcMint: PublicKey;
    /** Gas payment options - ignored, SOL is used for gas */
    gasPayment?: GasPaymentOptions;
  }
) {
  const { marketPda, amount, usdcMint } = params;
  
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    program.programId
  );
  const [marketVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('market_vault'), marketPda.toBuffer()],
    program.programId
  );
  const [userBalance] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_balance'), marketPda.toBuffer(), wallet.publicKey.toBuffer()],
    program.programId
  );
  const userUsdcAccount = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);

  const transaction = await (program.methods
    .withdrawUsdc({ amount })
    .accounts({
      user: wallet.publicKey,
      global: globalPda,
      market: marketPda,
      userUsdcAccount,
      marketUsdcVault: marketVault,
      userBalance,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as any))
    .transaction();

  const result = await sendWithFeePolicy({
    connection,
    wallet,
    instructions: transaction.instructions,
  });
  return result.signature;
}

/**
 * Settle with randomness (termination check)
 * Called after trade to check for random termination
 * 
 * Updated to match new IDL with SettleWithRandomnessParams structure
 */
export async function settleWithRandomness(
  program: Program<catallaxyz>,
  wallet: WalletAdapter,
  connection: Connection,
  params: {
    marketPda: PublicKey;
    randomnessAccount: PublicKey;
    usdcMint: PublicKey;
    settlementThreshold: BN; // Scaled by 10^8, e.g. 10000000 = 10%
    lastTradeYesPrice: BN; // Scaled by 10^6
    lastTradeNoPrice: BN; // Scaled by 10^6
    lastTradeSlot: BN;
    userOptedTerminationCheck?: boolean;
    /** Gas payment options - ignored, SOL is used for gas */
    gasPayment?: GasPaymentOptions;
  }
) {
  const {
    marketPda,
    randomnessAccount,
    usdcMint,
    settlementThreshold,
    lastTradeYesPrice,
    lastTradeNoPrice,
    lastTradeSlot,
    userOptedTerminationCheck = true,
  } = params;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    program.programId
  );
  const [marketVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('market_vault'), marketPda.toBuffer()],
    program.programId
  );

  const transaction = await (program.methods
    .settleWithRandomness({
      settlementThreshold,
      lastTradeYesPrice,
      lastTradeNoPrice,
      lastTradeSlot,
      userOptedTerminationCheck,
    })
    .accounts({
      global: globalPda,
      market: marketPda,
      creatorTreasury: PublicKey.findProgramAddressSync(
        [Buffer.from('creator_treasury')],
        program.programId
      )[0],
      marketUsdcVault: marketVault,
      randomnessAccount,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as any))
    .transaction();

  const result = await sendWithFeePolicy({
    connection,
    wallet,
    instructions: transaction.instructions,
  });
  return result.signature;
}
