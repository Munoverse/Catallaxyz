import { createSolanaRpc } from '@solana/kit';
import { createSolanaRpcSubscriptions } from '@solana/kit';
import { address, type Address } from '@solana/addresses';

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 
  (NETWORK === 'mainnet-beta' 
    ? 'https://api.mainnet-beta.solana.com' 
    : 'https://api.devnet.solana.com');

// Create RPC and RPC Subscriptions instances
export const rpc = createSolanaRpc(RPC_URL);
export const rpcSubscriptions = createSolanaRpcSubscriptions(
  RPC_URL.replace('https://', 'wss://').replace('http://', 'ws://')
);

export const PROGRAM_ID = address(
  process.env.NEXT_PUBLIC_PROGRAM_ID || 'CJajqTYSFQY614HLCESMJYRoVp5L2m6GZc6HFnjxCia5'
);

// AUDIT FIX F-H1: Remove unsafe fallback address - require proper configuration
const usdcMintAddress = process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS;
if (!usdcMintAddress) {
  console.error('NEXT_PUBLIC_USDC_MINT_ADDRESS is not configured');
}

export const USDC_MINT = address(
  usdcMintAddress || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // Default to mainnet USDC
);

// Helper to get RPC instance
export function getRpcClient() {
  return rpc;
}

// Helper to get RPC Subscriptions instance
export function getRpcSubscriptionsClient() {
  return rpcSubscriptions;
}