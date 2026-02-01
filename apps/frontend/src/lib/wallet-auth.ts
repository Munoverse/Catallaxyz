'use client'

import bs58 from 'bs58'
import { buildL1Message } from '@/lib/clob-client'

export async function buildWalletAuthHeaders({
  walletAddress,
  signMessage,
}: {
  walletAddress: string
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
}) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = `nonce-${Date.now()}`
  const message = buildL1Message(walletAddress, timestamp, nonce)
  const signature = await signMessage(new TextEncoder().encode(message))

  return {
    poly_signature: bs58.encode(signature),
    poly_timestamp: timestamp,
    poly_nonce: nonce,
    poly_address: walletAddress,
  }
}
