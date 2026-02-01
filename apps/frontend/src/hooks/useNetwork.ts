'use client'

/**
 * Network Detection Hooks
 * 
 * AUDIT FIX P3-1: Centralized network detection to avoid repeated env checks
 */

/**
 * Check if we're running on Solana devnet
 */
export function useIsDevnet(): boolean {
  return process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'devnet'
}

/**
 * Check if we're running on Solana mainnet
 */
export function useIsMainnet(): boolean {
  return process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta'
}

/**
 * Get the current Solana network
 */
export function useNetwork(): 'devnet' | 'mainnet-beta' | 'localnet' {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK
  if (network === 'mainnet-beta') return 'mainnet-beta'
  if (network === 'localnet') return 'localnet'
  return 'devnet'
}

/**
 * Get the Solana RPC endpoint
 */
export function useRpcEndpoint(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
}

/**
 * Non-hook version for use outside of React components
 */
export const network = {
  isDevnet: () => process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'devnet',
  isMainnet: () => process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta',
  get: () => process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet',
  rpcEndpoint: () => process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
}

export default { useIsDevnet, useIsMainnet, useNetwork, useRpcEndpoint, network }
