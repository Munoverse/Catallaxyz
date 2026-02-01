'use client'

import { useModal } from '@phantom/react-sdk'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { Wallet } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface AuthDialogProps {
  open: boolean
  onClose: () => void
}

export function AuthDialog({ open, onClose }: AuthDialogProps) {
  const { isConnected, isLoading } = usePhantomWallet()
  const { open: openModal } = useModal()

  const storeCurrentRoute = () => {
    try {
      const current =
        window.location.pathname + window.location.search + window.location.hash
      sessionStorage.setItem('auth.redirect', current)
    } catch {
      // no-op
    }
  }

  // Close dialog when wallet connects
  useEffect(() => {
    if (isConnected && open) {
      onClose()
    }
  }, [isConnected, open, onClose])

  const handleConnect = () => {
    storeCurrentRoute()
    openModal()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Connect your wallet</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect your Phantom wallet to start trading on Catallaxyz.
          </p>

          <Button
            type="button"
            className="w-full"
            disabled={isLoading}
            onClick={handleConnect}
          >
            <Wallet className="mr-2 size-4" />
            {isLoading ? 'Connecting...' : 'Connect Phantom Wallet'}
          </Button>

          <p className="text-xs text-muted-foreground">
            Don't have Phantom? Download it from{' '}
            <a
              href="https://phantom.app"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              phantom.app
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
