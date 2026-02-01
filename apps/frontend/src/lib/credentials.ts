'use client'

/**
 * CLOB Credentials Storage Utility
 * 
 * AUDIT FIX P2-1: Centralized credential storage management
 * Extracted from useClobOrderbook.ts and HeaderNotifications.tsx
 * 
 * Security considerations:
 * - Uses sessionStorage to clear credentials when browser tab is closed
 * - Migrates from localStorage for backwards compatibility (one-time)
 * - Validates credentials structure before parsing
 */

import type { ClobCredentials } from '@/lib/clob-client'

const STORAGE_KEY = 'catallaxyz_clob_creds'

/**
 * Get stored CLOB credentials
 * Prefers sessionStorage, falls back to localStorage for migration
 */
export function getStoredCredentials(): ClobCredentials | null {
  if (typeof window === 'undefined') return null
  
  // Try sessionStorage first (more secure)
  const session = window.sessionStorage.getItem(STORAGE_KEY)
  if (session) {
    try {
      const data = JSON.parse(session)
      if (isValidCredentials(data)) {
        return data
      }
    } catch {
      // Invalid JSON, clear it
      window.sessionStorage.removeItem(STORAGE_KEY)
    }
  }
  
  // Check localStorage for migration (one-time read and clear)
  const local = window.localStorage.getItem(STORAGE_KEY)
  if (local) {
    try {
      const data = JSON.parse(local)
      if (isValidCredentials(data)) {
        // Migrate to sessionStorage and clear localStorage
        window.sessionStorage.setItem(STORAGE_KEY, local)
        window.localStorage.removeItem(STORAGE_KEY)
        return data
      }
    } catch {
      // Invalid JSON, clear it
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }
  
  return null
}

/**
 * Store CLOB credentials securely
 */
export function setStoredCredentials(data: ClobCredentials): void {
  if (typeof window === 'undefined') return
  if (!isValidCredentials(data)) {
    throw new Error('Invalid credentials structure')
  }
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

/**
 * Clear stored credentials from all storage
 */
export function clearStoredCredentials(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(STORAGE_KEY)
  window.localStorage.removeItem(STORAGE_KEY)
}

/**
 * Check if credentials exist for a specific wallet
 */
export function hasCredentialsForWallet(walletAddress: string): boolean {
  const stored = getStoredCredentials()
  return stored?.walletAddress === walletAddress
}

/**
 * Get credentials only if they match the provided wallet address
 */
export function getCredentialsForWallet(walletAddress: string): ClobCredentials | null {
  const stored = getStoredCredentials()
  if (stored?.walletAddress === walletAddress) {
    return stored
  }
  return null
}

/**
 * Validate credentials structure
 */
function isValidCredentials(data: unknown): data is ClobCredentials {
  if (!data || typeof data !== 'object') return false
  const creds = data as Record<string, unknown>
  return (
    typeof creds.apiKey === 'string' &&
    typeof creds.passphrase === 'string' &&
    typeof creds.secret === 'string' &&
    typeof creds.walletAddress === 'string'
  )
}

/**
 * Credentials storage object for convenience
 */
export const credentialStorage = {
  get: getStoredCredentials,
  set: setStoredCredentials,
  clear: clearStoredCredentials,
  hasForWallet: hasCredentialsForWallet,
  getForWallet: getCredentialsForWallet,
}

export default credentialStorage
