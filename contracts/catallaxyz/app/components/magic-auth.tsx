'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Magic } from 'magic-sdk';
import { OAuthExtension } from '@magic-ext/oauth2';
import { SolanaExtension } from '@magic-ext/solana';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

type MagicUserMetadata = {
  email?: string;
  issuer?: string;
  publicAddress?: string;
};

// AUDIT FIX: Proper type definitions for Magic Solana extension
type SerializableTransaction = Transaction | VersionedTransaction;

interface MagicSignMessageResult {
  signature?: number[];
}

interface MagicSolanaExtended {
  signTransaction: <T extends SerializableTransaction>(tx: T) => Promise<T>;
  signMessage: (message: Uint8Array) => Promise<MagicSignMessageResult | Uint8Array>;
}

type MagicSigner = {
  publicKey: PublicKey;
  signTransaction: <T extends SerializableTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends SerializableTransaction>(txs: T[]) => Promise<T[]>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
};

type MagicAuthContextValue = {
  isMagicAuthenticated: boolean;
  magicMetadata: MagicUserMetadata | null;
  magicPublicKey: PublicKey | null;
  loginWithMagic: (provider?: string) => Promise<void>;
  completeMagicRedirect: () => Promise<void>;
  logoutMagic: () => Promise<void>;
  getMagicSigner: () => Promise<MagicSigner | null>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array> | null;
  error: string | null;
};

const MagicAuthContext = createContext<MagicAuthContextValue | null>(null);

let magicInstance: Magic | null = null;

const getMagic = () => {
  if (magicInstance) {
    return magicInstance;
  }
  const apiKey = process.env.NEXT_PUBLIC_MAGIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing env var NEXT_PUBLIC_MAGIC_API_KEY');
  }
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  magicInstance = new Magic(apiKey, {
    extensions: [new SolanaExtension({ rpcUrl }), new OAuthExtension()],
  });
  return magicInstance;
};

export function MagicAuthProvider({ children }: { children: React.ReactNode }) {
  const [magicMetadata, setMagicMetadata] = useState<MagicUserMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshMagicUser = useCallback(async () => {
    try {
      const magic = getMagic();
      const isLoggedIn = await magic.user.isLoggedIn();
      if (!isLoggedIn) {
        setMagicMetadata(null);
        return;
      }
      const metadata = (await magic.user.getMetadata()) as MagicUserMetadata;
      setMagicMetadata(metadata);
    } catch (err: unknown) {
      // AUDIT FIX: Use 'unknown' type and type guard
      const message = err instanceof Error ? err.message : 'Failed to load Magic user session.';
      setError(message);
      setMagicMetadata(null);
    }
  }, []);

  useEffect(() => {
    void refreshMagicUser();
  }, [refreshMagicUser]);

  const loginWithMagic = useCallback(async (provider = 'google') => {
    try {
      setError(null);
      const magic = getMagic();
      await magic.oauth2.loginWithRedirect({
        provider,
        redirectURI: `${window.location.origin}/magic/callback`,
      });
    } catch (err: unknown) {
      // AUDIT FIX: Use 'unknown' type and type guard
      const message = err instanceof Error ? err.message : 'Magic login failed.';
      setError(message);
    }
  }, []);

  const completeMagicRedirect = useCallback(async () => {
    try {
      setError(null);
      const magic = getMagic();
      await magic.oauth2.getRedirectResult();
      await refreshMagicUser();
    } catch (err: unknown) {
      // AUDIT FIX: Use 'unknown' type and type guard
      const message = err instanceof Error ? err.message : 'Magic redirect handling failed.';
      setError(message);
    }
  }, [refreshMagicUser]);

  const logoutMagic = useCallback(async () => {
    try {
      const magic = getMagic();
      await magic.user.logout();
      setMagicMetadata(null);
    } catch (err: unknown) {
      // AUDIT FIX: Use 'unknown' type and type guard
      const message = err instanceof Error ? err.message : 'Magic logout failed.';
      setError(message);
    }
  }, []);

  const getMagicSigner = useCallback(async (): Promise<MagicSigner | null> => {
    if (!magicMetadata?.publicAddress) {
      return null;
    }
    const magic = getMagic();
    const publicKey = new PublicKey(magicMetadata.publicAddress);
    // AUDIT FIX: Use proper type assertion
    const solanaExt = magic.solana as unknown as MagicSolanaExtended;
    return {
      publicKey,
      signTransaction: async <T extends SerializableTransaction>(tx: T) => 
        solanaExt.signTransaction(tx) as Promise<T>,
      signAllTransactions: async <T extends SerializableTransaction>(txs: T[]) =>
        Promise.all(txs.map((tx) => solanaExt.signTransaction(tx) as Promise<T>)),
      signMessage: async (message: Uint8Array) => {
        const result = await solanaExt.signMessage(message);
        if (result && typeof result === 'object' && 'signature' in result && result.signature) {
          return Uint8Array.from(result.signature);
        }
        if (result instanceof Uint8Array) {
          return result;
        }
        throw new Error('Magic signMessage unavailable.');
      },
    };
  }, [magicMetadata?.publicAddress]);

  const signMessage = useCallback(
    (message: Uint8Array) => {
      if (!magicMetadata?.publicAddress) {
        return null;
      }
      const magic = getMagic();
      // AUDIT FIX: Use proper type assertion
      const solanaExt = magic.solana as unknown as MagicSolanaExtended;
      return solanaExt.signMessage(message).then((result) => {
        if (result && typeof result === 'object' && 'signature' in result && result.signature) {
          return Uint8Array.from(result.signature);
        }
        if (result instanceof Uint8Array) {
          return result;
        }
        throw new Error('Magic signMessage unavailable.');
      });
    },
    [magicMetadata?.publicAddress]
  );

  const value = useMemo(
    () => ({
      isMagicAuthenticated: Boolean(magicMetadata?.publicAddress),
      magicMetadata,
      magicPublicKey: magicMetadata?.publicAddress ? new PublicKey(magicMetadata.publicAddress) : null,
      loginWithMagic,
      completeMagicRedirect,
      logoutMagic,
      getMagicSigner,
      signMessage,
      error,
    }),
    [
      magicMetadata,
      loginWithMagic,
      completeMagicRedirect,
      logoutMagic,
      getMagicSigner,
      signMessage,
      error,
    ]
  );

  return <MagicAuthContext.Provider value={value}>{children}</MagicAuthContext.Provider>;
}

export const useMagicAuth = () => {
  const context = useContext(MagicAuthContext);
  if (!context) {
    throw new Error('useMagicAuth must be used within MagicAuthProvider');
  }
  return context;
};
