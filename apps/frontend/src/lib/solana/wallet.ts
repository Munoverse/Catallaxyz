/**
 * Solana Wallet Utilities
 * 
 * This module provides wallet utilities for Jupiter Unified Wallet Kit integration
 */

import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { 
  Transaction, 
  VersionedTransaction,
  PublicKey,
  Connection,
  TransactionMessage,
} from '@solana/web3.js';
import { address, type Address } from '@solana/addresses';

/**
 * Convert Solana Kit Address to Web3.js PublicKey
 */
export function addressToPublicKey(addr: Address): PublicKey {
  return new PublicKey(addr);
}

/**
 * Convert Web3.js PublicKey to Solana Kit Address
 */
export function publicKeyToAddress(pubkey: PublicKey): Address {
  return address(pubkey.toBase58());
}

/**
 * Sign and send a transaction using connected wallet
 * @param transaction Transaction to sign and send
 * @param connection Solana connection
 * @param signTransaction Wallet sign function
 * @param sendTransaction Wallet send function
 * @returns Transaction signature
 */
export async function signAndSendTransaction(
  transaction: Transaction | VersionedTransaction,
  connection: Connection,
  signTransaction: (tx: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>,
  sendTransaction: (tx: Transaction | VersionedTransaction, connection: Connection) => Promise<string>
): Promise<string> {
  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  
  if (transaction instanceof VersionedTransaction) {
    // Sign transaction with wallet
    const signedTx = await signTransaction(transaction);
    
    // Send transaction
    const signature = await sendTransaction(signedTx, connection);
    
    // Wait for confirmation
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
    
    return signature;
  } else {
    // For legacy transactions
    transaction.recentBlockhash = blockhash;
    
    // Sign transaction
    const signedTx = await signTransaction(transaction);
    
    // Send transaction
    const signature = await sendTransaction(signedTx, connection);
    
    // Wait for confirmation
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
    
    return signature;
  }
}

/**
 * Create a versioned transaction from instructions
 */
export async function createVersionedTransaction(
  connection: Connection,
  payer: PublicKey,
  instructions: any[],
  signers?: any[]
): Promise<VersionedTransaction> {
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  
  const messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  
  return new VersionedTransaction(messageV0);
}

/**
 * Hook for using Solana wallet adapter
 */
export function useSolanaWalletSigner() {
  const { publicKey, solana, isConnected: connected } = usePhantomWallet();
  
  const getWalletAddress = (): Address | null => {
    if (!publicKey) return null;
    return address(publicKey.toBase58());
  };
  
  const signTransaction = async (
    transaction: Transaction | VersionedTransaction
  ): Promise<Transaction | VersionedTransaction> => {
    if (!solana?.signTransaction) {
      throw new Error('Wallet does not support transaction signing');
    }
    const signedTx = await solana.signTransaction(transaction as any);
    return signedTx as Transaction | VersionedTransaction;
  };
  
  const sendTransaction = async (
    transaction: Transaction | VersionedTransaction,
    connection: Connection
  ): Promise<string> => {
    if (!solana?.signAndSendTransaction) {
      throw new Error('Wallet does not support sending transactions');
    }
    
    // Sign and send transaction
    const { signature } = await solana.signAndSendTransaction(transaction as any);
    
    // Wait for confirmation
    await connection.confirmTransaction(signature, 'confirmed');
    
    return signature;
  };
  
  return {
    walletAddress: getWalletAddress(),
    signTransaction,
    sendTransaction,
    isReady: connected && !!publicKey && !!solana,
  };
}

