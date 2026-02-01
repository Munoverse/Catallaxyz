'use client'

import { useModal } from '@phantom/react-sdk'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Shield } from 'lucide-react'
import HeaderUserMenu from '@/components/HeaderUserMenu'
import HeaderPortfolio from '@/components/HeaderPortfolio'
import HeaderNotifications from '@/components/HeaderNotifications'
import { isAdminWallet } from '@/lib/admin'

export default function HeaderMenu() {
  const [mounted, setMounted] = useState(false)
  const { isConnected, walletAddress, isLoading } = usePhantomWallet()
  const { open: openModal } = useModal()
  const { t } = useTranslation()
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])
  
  const handleAdminClick = () => {
    router.push('/admin')
  }

  const handleDepositClick = () => {
    router.push('/cash')
  }

  const storeCurrentRoute = () => {
    try {
      const current =
        window.location.pathname + window.location.search + window.location.hash
      sessionStorage.setItem('auth.redirect', current)
    } catch {
      // no-op
    }
  }

  if (!mounted) {
    return (
      <div className="flex gap-2">
        <Skeleton className="h-9 w-20" />
      </div>
    )
  }

  const showAdminButton = isConnected && walletAddress && isAdminWallet(walletAddress)

  return (
    <>
      {isConnected ? (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDepositClick}
          >
            {t('header.deposit')}
          </Button>
          <HeaderPortfolio />
          <HeaderNotifications />
          {showAdminButton && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleAdminClick}
              className="gap-2"
              title="Admin Panel"
            >
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Admin</span>
            </Button>
          )}
          <HeaderUserMenu />
        </>
      ) : (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDepositClick}
          >
            {t('header.deposit')}
          </Button>
          <Button
            size="sm"
            data-testid="header-connect-wallet-button"
            onClick={() => {
              storeCurrentRoute()
              openModal()
            }}
            disabled={isLoading}
          >
            {isLoading ? t('header.connecting') : t('header.connectWallet')}
          </Button>
        </>
      )}
    </>
  )
}

