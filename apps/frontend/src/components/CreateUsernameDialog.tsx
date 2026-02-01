'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { CheckCircleIcon, XCircleIcon, LoaderIcon } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { apiFetch } from '@/lib/api-client'
import { buildWalletAuthHeaders } from '@/lib/wallet-auth'

interface CreateUsernameDialogProps {
  open: boolean
  onComplete: (username: string) => void
}

export default function CreateUsernameDialog({ open, onComplete }: CreateUsernameDialogProps) {
  const { t } = useTranslation()
  const { walletAddress, solana } = usePhantomWallet()
  const [username, setUsername] = useState('')
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [error, setError] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const debouncedUsername = useDebounce(username, 500)

  // Check username availability when debounced value changes
  useEffect(() => {
    if (debouncedUsername && debouncedUsername.length >= 3) {
      checkAvailability(debouncedUsername)
    } else if (debouncedUsername && debouncedUsername.length > 0) {
      setAvailable(false)
      setError(t('createUsername.tooShort'))
    } else {
      setAvailable(null)
      setError('')
    }
  }, [debouncedUsername])

  const validateUsername = (value: string): string | null => {
    if (value.length < 3) {
      return t('createUsername.tooShort')
    }
    if (value.length > 30) {
      return t('createUsername.tooLong')
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      return t('createUsername.invalidChars')
    }
    return null
  }

  const checkAvailability = async (value: string) => {
    const validationError = validateUsername(value)
    if (validationError) {
      setError(validationError)
      setAvailable(false)
      return
    }

    setError('')
    setChecking(true)
    setAvailable(null)

    try {
      const response = await apiFetch(`/api/users/check-username?username=${encodeURIComponent(value)}`)
      const result = await response.json()
      
      if (result.success) {
        setAvailable(result.data.available)
        if (!result.data.available) {
          setError(result.data.reason || t('createUsername.taken'))
        }
      } else {
        setError(result.error?.message || t('createUsername.checkError'))
        setAvailable(false)
      }
    } catch (err) {
      console.error('Error checking username:', err)
      setError(t('createUsername.checkError'))
      setAvailable(false)
    } finally {
      setChecking(false)
    }
  }

  const handleUsernameChange = (value: string) => {
    setUsername(value)
    setAvailable(null)
    setError('')
  }

  const handleSubmit = async () => {
    if (!available || !username) return

    if (!walletAddress) {
      setError('Wallet address not found')
      return
    }

    setSubmitting(true)
    try {
      if (!solana) {
        setError('Wallet does not support message signing')
        return
      }

      const signMessage = async (message: Uint8Array) => {
        const { signature } = await solana.signMessage(message)
        return signature
      }
      const authHeaders = await buildWalletAuthHeaders({ walletAddress, signMessage })
      const response = await apiFetch('/api/users/register-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          walletAddress,
          username,
        }),
      })

      const result = await response.json()

      if (result.success) {
        onComplete(username)
      } else {
        setError(result.error?.message || t('createUsername.submitError'))
      }
    } catch (err) {
      console.error('Error creating username:', err)
      setError(t('createUsername.submitError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {/* Prevent closing */}}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('createUsername.title')}</DialogTitle>
          <DialogDescription>
            {t('createUsername.description')} Your profile will be available at /@username.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="username">{t('createUsername.username')}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10">@</span>
              <Input
                id="username"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder={t('createUsername.placeholder')}
                maxLength={30}
                disabled={submitting}
                className={cn(
                  'pl-7 pr-10',
                  available === true && 'border-yes',
                  available === false && 'border-no'
                )}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {checking && (
                  <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
                )}
                {!checking && available === true && (
                  <CheckCircleIcon className="size-4 text-yes" />
                )}
                {!checking && available === false && (
                  <XCircleIcon className="size-4 text-no" />
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('createUsername.requirements')}
            </p>
            {username && (
              <p className="text-xs text-muted-foreground">
                Profile URL: /@{username}
              </p>
            )}
            {error && (
              <p className="text-xs text-no">{error}</p>
            )}
            {available === true && (
              <p className="text-xs text-yes">{t('createUsername.available')}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!available || submitting}
            className="w-full"
          >
            {submitting ? t('createUsername.creating') : t('createUsername.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

