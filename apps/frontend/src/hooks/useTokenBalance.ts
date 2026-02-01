/**
 * Hook to fetch and subscribe to token balance
 */

import { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { getTokenBalance } from '@/lib/token-utils';
import { getConnection } from '@/lib/solana-connection';

export function useTokenBalance(
  owner: PublicKey | null | undefined,
  mint: PublicKey | null | undefined
) {
  const connection = getConnection();
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenAccount, setTokenAccount] = useState<string | null>(null);

  useEffect(() => {
    if (!owner || !mint || !connection) {
      setBalance(0);
      setTokenAccount(null);
      return;
    }

    let subscriptionId: number | null = null;
    let isMounted = true;

    const setupBalanceTracking = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const ata = await getAssociatedTokenAddress(mint, owner);
        
        if (!isMounted) return;
        
        setTokenAccount(ata.toBase58());
        const bal = await getTokenBalance(connection, ata);
        
        if (!isMounted) return;
        
        setBalance(bal);

        // Subscribe to account changes AFTER we have the ata key
        // AUDIT FIX CRIT-2: Fixed subscription race condition
        subscriptionId = connection.onAccountChange(
          ata,
          async () => {
            if (!isMounted) return;
            try {
              const newBal = await getTokenBalance(connection, ata);
              if (isMounted) setBalance(newBal);
            } catch (err) {
              console.error('Error refreshing balance:', err);
            }
          },
          'confirmed'
        );
      } catch (err: unknown) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'Failed to fetch balance';
        console.error('Error fetching balance:', err);
        setError(message);
        setBalance(0);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    setupBalanceTracking();

    // Cleanup
    return () => {
      isMounted = false;
      if (subscriptionId !== null) {
        connection.removeAccountChangeListener(subscriptionId);
      }
    };
  }, [owner?.toBase58(), mint?.toBase58(), connection]);

  return { balance, loading, error, tokenAccount };
}

/**
 * Hook to fetch multiple token balances
 */
export function useMultipleTokenBalances(tokenAccounts: (string | null)[]) {
  const connection = getConnection();
  const [balances, setBalances] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!connection || tokenAccounts.length === 0) {
      setBalances([]);
      return;
    }

    const fetchBalances = async () => {
      setLoading(true);
      
      try {
        const bals = await Promise.all(
          tokenAccounts.map(async (account) => {
            if (!account) return 0;
            try {
              const pubkey = new PublicKey(account);
              return await getTokenBalance(connection, pubkey);
            } catch {
              return 0;
            }
          })
        );
        setBalances(bals);
      } catch (err) {
        console.error('Error fetching balances:', err);
        setBalances(tokenAccounts.map(() => 0));
      } finally {
        setLoading(false);
      }
    };

    fetchBalances();

    // Refresh every 10 seconds
    const interval = setInterval(fetchBalances, 10000);

    return () => clearInterval(interval);
  }, [tokenAccounts.join(','), connection]);

  return { balances, loading };
}

