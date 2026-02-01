/**
 * Hook to get catallaxyz Program instance
 */

import { useMemo } from 'react';
import { useAnchorProvider } from './useAnchorProvider';
import { Program } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';

// Import generated IDL and types
import IDL from '@/generated/catallaxyz/catallaxyz.json';
import type { Catallaxyz } from '@/generated/catallaxyz/catallaxyz';

// catallaxyz Program ID (from IDL)
const catallaxyz_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
  process.env.NEXT_PUBLIC_catallaxyz_PROGRAM_ID ||
  '5pYqj2e28TRpfK8NBAdJA78ZBG9r2XoMT39tqyHnTsRv'
);

export function usecatallaxyzProgram() {
  const provider = useAnchorProvider();
  
  const program = useMemo(() => {
    if (!provider) return null;
    
    try {
      return new Program<Catallaxyz>(IDL as any, provider);
    } catch (error) {
      console.error('Failed to create catallaxyz program:', error);
      return null;
    }
  }, [provider]);
  
  return program;
}

export { catallaxyz_PROGRAM_ID };
