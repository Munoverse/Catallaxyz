/**
 * Hook to get Anchor Provider instance
 */

import { useMemo, useCallback } from 'react';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { getConnection } from '@/lib/solana-connection';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Transaction, VersionedTransaction, PublicKey } from '@solana/web3.js';

export function useAnchorProvider() {
  const connection = getConnection();
  const { publicKey, isConnected, solana } = usePhantomWallet();
  
  // Create an Anchor-compatible wallet adapter
  // Note: We use a type assertion because Anchor's Wallet type includes a 'payer' property
  // that is only needed for NodeWallet, not for browser wallets
  const anchorWallet = useMemo(() => {
    if (!publicKey || !isConnected || !solana) {
      return null;
    }
    
    return {
      publicKey,
      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
        const signedTx = await solana.signTransaction(tx);
        return signedTx as T;
      },
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
        const signedTxs: T[] = [];
        for (const tx of txs) {
          const signedTx = await solana.signTransaction(tx);
          signedTxs.push(signedTx as T);
        }
        return signedTxs;
      },
    } as Wallet;
  }, [publicKey, isConnected, solana]);
  
  const provider = useMemo(() => {
    if (!anchorWallet) {
      return null;
    }
    
    return new AnchorProvider(
      connection,
      anchorWallet,
      {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
      }
    );
  }, [connection, anchorWallet]);
  
  return provider;
}

