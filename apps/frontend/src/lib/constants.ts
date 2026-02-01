/**
 * Application Constants
 * Centralized environment variable access and configuration
 * 
 * AUDIT FIX F-A7: Unified constants to avoid repetition
 */

import { address, type Address } from '@solana/addresses';
import { PublicKey } from '@solana/web3.js';

// ============================================
// Network Configuration
// ============================================

export const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';

export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 
  (NETWORK === 'mainnet-beta' 
    ? 'https://api.mainnet-beta.solana.com' 
    : 'https://api.devnet.solana.com');

// ============================================
// Program and Token Addresses
// ============================================

/** Main program ID */
export const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || 'CJajqTYSFQY614HLCESMJYRoVp5L2m6GZc6HFnjxCia5';

/** 
 * USDC mint address
 * AUDIT FIX HIGH-5: Removed invalid fallback - USDC_MINT must be explicitly configured
 */
export const USDC_MINT_ADDRESS = process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS;

// Validate critical environment variables at import time
if (typeof window !== 'undefined' && !USDC_MINT_ADDRESS) {
  console.error('[CRITICAL] NEXT_PUBLIC_USDC_MINT_ADDRESS is not set. Trading features will not work.');
}

/** Global account address (if available) */
export const GLOBAL_ACCOUNT_ADDRESS = process.env.NEXT_PUBLIC_GLOBAL_ACCOUNT_ADDRESS;

// ============================================
// Typed Address Helpers (@solana/kit)
// ============================================

/** Program ID as @solana/kit Address */
export const PROGRAM_ID_ADDRESS: Address = address(PROGRAM_ID);

/** USDC Mint as @solana/kit Address (only available if USDC_MINT_ADDRESS is set) */
export const USDC_MINT: Address | null = USDC_MINT_ADDRESS ? address(USDC_MINT_ADDRESS) : null;

/** Get USDC Mint Address (throws if not configured) */
export function getUsdcMintAddress(): Address {
  if (!USDC_MINT) {
    throw new Error('USDC_MINT_ADDRESS is not configured. Set NEXT_PUBLIC_USDC_MINT_ADDRESS environment variable.');
  }
  return USDC_MINT;
}

// ============================================
// PublicKey Helpers (@solana/web3.js)
// ============================================

/** Get USDC Mint as PublicKey - cached instance (throws if not configured) */
let _usdcMintPublicKey: PublicKey | null = null;
export function getUsdcMintPublicKey(): PublicKey {
  if (!_usdcMintPublicKey) {
    if (!USDC_MINT_ADDRESS) {
      throw new Error('USDC_MINT_ADDRESS is not configured. Set NEXT_PUBLIC_USDC_MINT_ADDRESS environment variable.');
    }
    _usdcMintPublicKey = new PublicKey(USDC_MINT_ADDRESS);
  }
  return _usdcMintPublicKey;
}

/** Get Program ID as PublicKey - cached instance */
let _programIdPublicKey: PublicKey | null = null;
export function getProgramIdPublicKey(): PublicKey {
  if (!_programIdPublicKey) {
    _programIdPublicKey = new PublicKey(PROGRAM_ID);
  }
  return _programIdPublicKey;
}

// ============================================
// API Configuration
// ============================================

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL;

// ============================================
// Price and Fee Constants
// ============================================

/** Price scale factor (10^6 = 1_000_000) */
export const PRICE_SCALE = 1_000_000;

/** USDC decimals */
export const USDC_DECIMALS = 6;

/** Max outcome tokens (binary markets = 2) */
export const MAX_OUTCOME_TOKENS = 2;

// ============================================
// Market Status Constants
// ============================================

export const MARKET_STATUS = {
  ACTIVE: 0,
  SETTLED: 1,
  TERMINATED: 4,
} as const;

export const OUTCOME = {
  YES: 0,
  NO: 1,
} as const;

// ============================================
// UI Constants
// ============================================

/** Default polling interval for notifications (ms) */
export const NOTIFICATION_POLL_INTERVAL = 30_000;

/** Default debounce delay (ms) */
export const DEFAULT_DEBOUNCE_DELAY = 300;

// ============================================
// Feature Flags
// ============================================

export const FEATURES = {
  CLOB_ENABLED: process.env.NEXT_PUBLIC_CLOB_ENABLED === 'true',
  TIPS_ENABLED: process.env.NEXT_PUBLIC_TIPS_ENABLED === 'true',
} as const;
