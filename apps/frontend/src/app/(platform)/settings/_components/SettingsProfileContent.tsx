'use client'

import { useState } from 'react'
import type { User } from '@/hooks/useUser'
import { useTranslation } from 'react-i18next'
import { UserIcon, CopyIcon, CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

export default function SettingsProfileContent({ user }: { user: User }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  // Form state
  const [email, setEmail] = useState(user.email || '')
  const [username, setUsername] = useState(user.username || '')
  const [bio, setBio] = useState(user.bio || '')
  const [twitterHandle, setTwitterHandle] = useState(user.twitterHandle || '')

  // Get display name
  const getDisplayName = () => {
    if (user.username) {
      return user.username
    }
    if (user.walletAddress) {
      return `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`
    }
    return 'User'
  }

  // Get user avatar
  const getUserAvatar = () => {
    if (user.avatarUrl) {
      return user.avatarUrl
    }
    return null
  }

  const displayName = getDisplayName()
  const avatarUrl = getUserAvatar()
  const walletAddress = user.walletAddress

  const handleCopyAddress = async () => {
    if (walletAddress) {
      await navigator.clipboard.writeText(walletAddress)
      setCopied(true)
      toast.success(t('settings.profile.addressCopied'))
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="grid gap-8">
      {/* Profile Avatar */}
      <div className="rounded-lg border border-border p-6">
        <div className="flex items-center gap-6">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/60 ring-4 ring-primary/10">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile"
                className="size-full object-cover"
              />
            ) : (
              <UserIcon className="size-10 text-primary-foreground" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">{displayName}</h3>
            <p className="text-sm text-muted-foreground">
              {t('settings.profile.managedByWallet')}
            </p>
          </div>
        </div>
      </div>

      {/* User Information */}
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="display-name">{t('settings.profile.displayName')}</Label>
          <Input
            id="display-name"
            type="text"
            value={displayName}
            disabled
            className="bg-muted"
          />
          <p className="text-xs text-muted-foreground">
            {t('settings.profile.displayNameNote')}
          </p>
        </div>

        {user.email && (
          <div className="grid gap-2">
            <Label htmlFor="email">{t('settings.profile.email')}</Label>
            <Input
              id="email"
              type="email"
              value={user.email}
              disabled
              className="bg-muted"
            />
          </div>
        )}

        {walletAddress && (
          <div className="grid gap-2">
            <Label htmlFor="wallet">{t('settings.profile.walletAddress')}</Label>
            <div className="flex gap-2">
              <Input
                id="wallet"
                type="text"
                value={walletAddress}
                disabled
                className="flex-1 bg-muted font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopyAddress}
                title={copied ? t('settings.profile.copied') : t('settings.profile.copyAddress')}
              >
                {copied ? (
                  <CheckIcon className="size-4 text-green-500" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.profile.walletNote')}
            </p>
          </div>
        )}

        {/* Connected Accounts */}
        <div className="rounded-lg border border-border p-4">
          <h3 className="mb-4 text-sm font-semibold">
            {t('settings.profile.connectedAccounts')}
          </h3>
          <div className="grid gap-3">
            {user.email && (
              <div className="flex items-center justify-between">
                <span className="text-sm">{t('settings.profile.email')}</span>
                <span className="text-sm text-muted-foreground">{user.email}</span>
              </div>
            )}
            {user.twitterHandle && (
              <div className="flex items-center justify-between">
                <span className="text-sm">{t('settings.profile.twitter')}</span>
                <span className="text-sm text-muted-foreground">@{user.twitterHandle}</span>
              </div>
            )}
            {!user.email && !user.twitterHandle && (
              <p className="text-sm text-muted-foreground">
                {t('settings.profile.noConnectedAccounts')}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">
          {t('settings.profile.walletNote2')}
        </p>
      </div>
    </div>
  )
}
