'use client'

import { PhantomProvider, darkTheme, AddressType } from '@phantom/react-sdk'

interface SolanaWalletProviderProps {
  children: React.ReactNode
}

// Phantom Portal App ID - get this from https://phantom.com/portal/
const PHANTOM_APP_ID = process.env.NEXT_PUBLIC_PHANTOM_APP_ID || ''

// Auth callback URL for OAuth providers
const AUTH_REDIRECT_URL = process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL || 
  (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '')

export function SolanaWalletProvider({ children }: SolanaWalletProviderProps) {
  return (
    <PhantomProvider
      config={{
        // Enable all connection methods: OAuth, browser extension, mobile deeplink
        providers: ['google', 'apple', 'injected', 'deeplink'],
        // Only Solana for now (EVM support coming soon)
        addressTypes: [AddressType.solana],
        // App ID from Phantom Portal (required for OAuth providers)
        appId: PHANTOM_APP_ID,
        // Auth options for OAuth callbacks
        authOptions: {
          redirectUrl: AUTH_REDIRECT_URL,
        },
      }}
      theme={darkTheme}
      appIcon="/icon.png"
      appName="Catallaxyz"
    >
      {children}
    </PhantomProvider>
  )
}
