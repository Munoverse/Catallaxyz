'use client'

import { useEffect, useState } from 'react'
import { useWalletUser } from '@/hooks/useWalletUser'
import { UsernameSetupDialog } from '@/components/UsernameSetupDialog'

interface WalletAuthWrapperProps {
  children: React.ReactNode
}

/**
 * Wrapper component that handles wallet authentication flow
 * Shows username setup dialog when a new wallet connects
 */
export function WalletAuthWrapper({ children }: WalletAuthWrapperProps) {
  const { error, isLoading, refetchUser } = useWalletUser()
  const [showUsernameSetup, setShowUsernameSetup] = useState(false)

  useEffect(() => {
    // Show username setup dialog if user needs to set username
    if (!isLoading && error === 'username_required') {
      setShowUsernameSetup(true)
    } else {
      setShowUsernameSetup(false)
    }
  }, [error, isLoading])

  const handleUsernameSetupSuccess = async () => {
    setShowUsernameSetup(false)
    // Refetch user data after successful setup
    await refetchUser()
  }

  const handleUsernameSetupClose = () => {
    // Allow closing the dialog, but it will reappear if wallet is still connected
    // without a username
    setShowUsernameSetup(false)
  }

  return (
    <>
      {children}
      <UsernameSetupDialog
        open={showUsernameSetup}
        onClose={handleUsernameSetupClose}
        onSuccess={handleUsernameSetupSuccess}
      />
    </>
  )
}
