'use client';

import { useEffect, useState, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { usecatallaxyzProgram } from '@/hooks/useCatallaxyzProgram';

export interface UserPosition {
  yesBalance: number;
  noBalance: number;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to load user's position for a market
 * 
 * @param marketPda - Market PDA address
 * @returns User position data with YES and NO balances
 * 
 * @example
 * const { yesBalance, noBalance, loading, refresh } = useUserPosition(marketPda);
 */
export function useUserPosition(marketPda: string | null) {
  const [yesBalance, setYesBalance] = useState(0);
  const [noBalance, setNoBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const program = usecatallaxyzProgram();
  const { publicKey } = usePhantomWallet();

  const loadPosition = useCallback(async () => {
    if (!program || !publicKey || !marketPda) {
      setYesBalance(0);
      setNoBalance(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const marketKey = new PublicKey(marketPda);
      const [userPositionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('user_position'), marketKey.toBuffer(), publicKey.toBuffer()],
        program.programId
      );
      
      const userPosition = await program.account.userPosition.fetch(userPositionPda);
      setYesBalance(Number(userPosition.yesBalance || 0) / 1e6);
      setNoBalance(Number(userPosition.noBalance || 0) / 1e6);
    } catch (err) {
      // Position doesn't exist yet, set to 0
      setYesBalance(0);
      setNoBalance(0);
      // Only set error if it's not a "account not found" error
      if (err instanceof Error && !err.message.includes('Account does not exist')) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [program, publicKey, marketPda]);

  useEffect(() => {
    loadPosition();
  }, [loadPosition]);

  return {
    yesBalance,
    noBalance,
    loading,
    error,
    refresh: loadPosition,
  };
}

export default useUserPosition;
