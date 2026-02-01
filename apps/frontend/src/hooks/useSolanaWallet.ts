import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { useMemo, useCallback } from 'react';
import { PublicKey, Connection, Transaction, VersionedTransaction } from '@solana/web3.js';

export interface SolanaWalletAdapter {
  address: PublicKey;
  signTransaction: (tx: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
  sendTransaction: (tx: Transaction | VersionedTransaction, connection: Connection) => Promise<string>;
  isReady: boolean;
}

export function useSolanaWallet() {
  const { publicKey, isConnected, solana } = usePhantomWallet();
  const isReady = isConnected && !!publicKey;

  const signTransaction = useCallback(
    async (tx: Transaction | VersionedTransaction) => {
      if (!solana) {
        throw new Error('Wallet does not support transaction signing');
      }
      const signedTx = await solana.signTransaction(tx);
      return signedTx;
    },
    [solana]
  );

  const sendTransaction = useCallback(
    async (tx: Transaction | VersionedTransaction, connection: Connection) => {
      if (!solana) {
        throw new Error('Wallet does not support sending transactions');
      }
      
      // Sign and send in one call
      const result = await solana.signAndSendTransaction(tx);
      await connection.confirmTransaction(result.signature, 'confirmed');
      return result.signature;
    },
    [solana]
  );

  const activeWallet = useMemo<SolanaWalletAdapter | null>(() => {
    if (!isReady || !publicKey) return null;

    return {
      address: publicKey,
      signTransaction,
      sendTransaction,
      isReady: true,
    };
  }, [isReady, publicKey, signTransaction, sendTransaction]);

  return {
    wallet: activeWallet,
    connected: isReady,
    address: publicKey,
    publicKey,
  };
}
