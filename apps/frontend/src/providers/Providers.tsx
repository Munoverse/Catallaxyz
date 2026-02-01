'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import { SolanaWalletProvider } from '@/providers/SolanaWalletProvider'
import { WalletAuthWrapper } from '@/components/WalletAuthWrapper'
import { I18nProvider } from '@/providers/I18nProvider'
import { getLocaleFromStorage, type Locale } from '@/lib/get-locale-client'

function ProvidersContent({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const detectedLocale = getLocaleFromStorage()
    setLocale(detectedLocale)
  }, [])

  return (
    <I18nProvider locale={mounted ? locale : 'en'}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <SolanaWalletProvider>
          <WalletAuthWrapper>
            <div className="min-h-screen bg-background">
              {children}
            </div>
            <Toaster position="top-center" />
          </WalletAuthWrapper>
        </SolanaWalletProvider>
      </ThemeProvider>
    </I18nProvider>
  )
}

export function Providers({ children }: { children: ReactNode }) {
  return <ProvidersContent>{children}</ProvidersContent>
}

