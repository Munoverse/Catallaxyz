'use client'

import { useState } from 'react'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { buildWalletAuthHeaders } from '@/lib/wallet-auth'

interface UsernameSetupDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function UsernameSetupDialog({ open, onClose, onSuccess }: UsernameSetupDialogProps) {
  const { t } = useTranslation()
  const { publicKey, walletAddress, solana } = usePhantomWallet()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Username validation
  const validateUsername = (value: string) => {
    if (value.length === 0) {
      setValidationError(null)
      return
    }

    if (value.length < 3) {
      setValidationError('Username must be at least 3 characters')
      return
    }

    if (value.length > 30) {
      setValidationError('Username must be at most 30 characters')
      return
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      setValidationError('Username can only contain letters, numbers, underscores, and hyphens')
      return
    }

    setValidationError(null)
  }

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setUsername(value)
    validateUsername(value)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!publicKey) {
      setError('Please log in first')
      return
    }

    if (validationError) {
      return
    }

    if (!username || username.length < 3) {
      setValidationError('Username must be at least 3 characters')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      if (!solana) {
        setError('Wallet does not support message signing')
        return
      }

      const signMessage = async (message: Uint8Array) => {
        const { signature } = await solana.signMessage(message)
        return signature
      }
      const authHeaders = await buildWalletAuthHeaders({ walletAddress: walletAddress!, signMessage })
      const response = await apiFetch('/api/users/create-with-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          walletAddress: walletAddress!,
          username: username.trim(),
          displayName: displayName.trim() || username.trim(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.error?.code === 'USERNAME_TAKEN') {
          setError('This username is already taken. Please try another one.')
        } else if (data.error?.code === 'WALLET_EXISTS') {
          setError('This wallet already has an account.')
        } else {
          setError(data.error?.message || 'Failed to create account')
        }
        return
      }

      // Success!
      onSuccess()
    } catch (err) {
      console.error('Error creating user:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {/* Prevent closing */}}>
      <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-2xl">Welcome to catallaxyz (Alpha)!</DialogTitle>
          <DialogDescription>
            Please choose a username to continue. Your username will be used as your profile URL (@username).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">
              Username <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
              <Input
                id="username"
                value={username}
                onChange={handleUsernameChange}
                placeholder="your_username"
                disabled={isSubmitting}
                className={`pl-7 ${validationError ? 'border-red-500' : ''}`}
                autoFocus
              />
            </div>
            {validationError && (
              <p className="flex items-center gap-1 text-sm text-red-500">
                <AlertCircle className="size-4" />
                {validationError}
              </p>
            )}
            {username && !validationError && username.length >= 3 && (
              <p className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="size-4" />
                Username is available
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Your profile will be available at /@{username || 'your_username'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">
              Display Name <span className="text-muted-foreground text-sm">(Optional)</span>
            </Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your Display Name"
              disabled={isSubmitting}
            />
            <p className="text-sm text-muted-foreground">
              This is how others will see your name. If not provided, your username will be used.
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3 dark:bg-red-950/20">
              <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="size-4" />
                {error}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="submit"
              disabled={isSubmitting || !!validationError || !username || username.length < 3}
              className="w-full"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Create Account & Continue'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
