'use client'

import { Suspense } from 'react'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import HeaderHowItWorks from '@/components/HeaderHowItWorks'
import HeaderLogo from '@/components/HeaderLogo'
import HeaderMenu from '@/components/HeaderMenu'
import HeaderSearch from '@/components/HeaderSearch'

export default function Header() {
  const { isConnected } = usePhantomWallet()

  return (
    <header className="sticky top-0 z-50 bg-background border-b">
      <div className="container flex h-14 items-center gap-4">
        <HeaderLogo />
        <div className="flex flex-1 items-center gap-2">
          <Suspense fallback={<div className="flex-1 sm:max-w-xl" />}>
            <HeaderSearch />
          </Suspense>
          {/* Show How it works only when not connected */}
          {!isConnected && <HeaderHowItWorks />}
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2 lg:gap-4">
          <HeaderMenu />
        </div>
      </div>
    </header>
  )
}

