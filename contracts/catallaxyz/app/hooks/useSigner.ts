import { useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMagicAuth } from '../components/magic-auth';
import type { SignerLike } from '../lib/solana';

export const useSigner = () => {
  const { publicKey, connected, signAllTransactions, signTransaction, signMessage } = useWallet();
  const { isMagicAuthenticated, getMagicSigner, loginWithMagic, error: magicError, signMessage: magicSignMessage } =
    useMagicAuth();

  const authenticated = connected || isMagicAuthenticated;

  const resolveSigner = useCallback(async (): Promise<SignerLike | null> => {
    if (connected && publicKey && signTransaction) {
      return {
        publicKey,
        signTransaction,
        signAllTransactions:
          signAllTransactions ??
          (async (txs) => Promise.all(txs.map((tx) => signTransaction(tx)))),
      };
    }
    if (isMagicAuthenticated) {
      return await getMagicSigner();
    }
    return null;
  }, [connected, publicKey, signTransaction, signAllTransactions, isMagicAuthenticated, getMagicSigner]);

  return {
    authenticated,
    magicError,
    loginWithMagic,
    resolveSigner,
    signMessage: signMessage ?? magicSignMessage,
  };
};
