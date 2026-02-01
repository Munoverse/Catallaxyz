'use client'

import { CheckIcon, CopyIcon, UserIcon, SettingsIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface UserProfile {
  username: string
  address?: string
  avatarUrl?: string
  joinedAt?: string
  bio?: string
}

interface PublicProfileHeaderProps {
  profile: UserProfile
  isOwnProfile?: boolean
}

export default function PublicProfileHeader({ profile, isOwnProfile }: PublicProfileHeaderProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopyAddress = async () => {
    if (profile.address) {
      await navigator.clipboard.writeText(profile.address)
      setCopied(true)
      toast.success(t('profile.addressCopied'))
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const truncateAddress = (address: string) => {
    if (!address) return ''
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const formatJoinDate = (dateString?: string) => {
    if (!dateString) return t('profile.recently')
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
    catch {
      return t('profile.recently')
    }
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
      {/* Avatar */}
      <div className="size-28 overflow-hidden rounded-full border-2 border-primary/20 bg-gradient-to-br from-primary/20 to-primary/5 shadow-lg">
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt={`${profile.username} avatar`}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <UserIcon className="size-12 text-primary/50" />
          </div>
        )}
      </div>

      {/* Profile Info */}
      <div className="flex-1 space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          {profile.username}
        </h1>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          {profile.address && (
            <Button
              variant="ghost"
              type="button"
              size="sm"
              onClick={handleCopyAddress}
              className="-ml-2 gap-2 text-muted-foreground"
              title={copied ? t('profile.copied') : t('profile.copyAddress')}
            >
              <span className="font-mono">{truncateAddress(profile.address)}</span>
              {copied ? (
                <CheckIcon className="size-3.5 text-green-500" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
            </Button>
          )}

          <span className="text-muted-foreground">
            {t('profile.joined')}
            {' '}
            {formatJoinDate(profile.joinedAt)}
          </span>
        </div>

        {profile.bio && (
          <p className="text-muted-foreground">{profile.bio}</p>
        )}
      </div>

      {/* Actions */}
      {isOwnProfile && (
        <div className="flex flex-col gap-2 lg:self-start">
          <Link href="/settings">
            <Button variant="outline" className="w-full lg:w-auto gap-2">
              <SettingsIcon className="size-4" />
              {t('profile.editProfile')}
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}

