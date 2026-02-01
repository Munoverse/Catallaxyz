/**
 * Transaction Fee Payment Utilities
 * 
 * Simple SOL-based gas payment for all wallet types.
 * Users pay transaction fees directly with SOL.
 */

import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'

const MIN_SOL_FEE_BALANCE = 0.001 * LAMPORTS_PER_SOL

type WalletSigner = {
  publicKey: PublicKey
  signTransaction: (tx: Transaction) => Promise<Transaction>
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>
}

/**
 * Transaction fee payment result
 */
export type FeePaymentResult = {
  signature: string
  feeMethod: 'sol'
}

/**
 * Send a transaction with SOL gas payment
 * 
 * All wallet types (embedded and extension) pay gas with native SOL.
 * 
 * @param connection - Solana connection
 * @param walletSigner - Wallet signer object
 * @param instructions - Transaction instructions to execute
 */
export async function sendTransactionWithFeePolicy({
  connection,
  walletSigner,
  instructions,
}: {
  connection: Connection
  walletSigner: WalletSigner
  instructions: TransactionInstruction[]
  // These parameters are kept for backwards compatibility but are ignored
  isEmbeddedWallet?: boolean
  preferredFeeToken?: PublicKey | null
  usdcMint?: PublicKey | null
}): Promise<FeePaymentResult> {
  // Check SOL balance for gas
  const balance = await connection.getBalance(walletSigner.publicKey)
  if (balance < MIN_SOL_FEE_BALANCE) {
    throw new Error('Insufficient SOL balance to pay gas fees. Please add SOL to your wallet.')
  }

  // Build and send transaction with SOL gas
  const transaction = new Transaction().add(...instructions)
  transaction.feePayer = walletSigner.publicKey
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  transaction.recentBlockhash = blockhash
  
  const signature = await walletSigner.sendTransaction(transaction, connection)
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  
  return {
    signature,
    feeMethod: 'sol' as const,
  }
}
