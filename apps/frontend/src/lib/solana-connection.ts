/**
 * Solana Connection Singleton
 * 
 * Provides a shared Connection instance for all Solana operations.
 * This replaces the useConnection hook from wallet-adapter.
 */

import { Connection, Commitment } from '@solana/web3.js'

// RPC endpoint configuration
function getRpcEndpoint(): string {
  const customRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL
  if (customRpc) {
    return customRpc
  }
  
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet'
  switch (network) {
    case 'mainnet-beta':
    case 'mainnet':
      return 'https://api.mainnet-beta.solana.com'
    case 'devnet':
      return 'https://api.devnet.solana.com'
    case 'testnet':
      return 'https://api.testnet.solana.com'
    default:
      return 'https://api.devnet.solana.com'
  }
}

// Singleton connection instance
let connectionInstance: Connection | null = null

/**
 * Get the shared Solana connection instance
 */
export function getConnection(commitment: Commitment = 'confirmed'): Connection {
  if (!connectionInstance) {
    connectionInstance = new Connection(getRpcEndpoint(), commitment)
  }
  return connectionInstance
}

/**
 * Get the RPC endpoint URL
 */
export function getRpcUrl(): string {
  return getRpcEndpoint()
}

/**
 * Get the current network name
 */
export function getNetworkName(): string {
  return process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet'
}

export default getConnection
