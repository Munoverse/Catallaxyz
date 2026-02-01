'use client'

import { useDisconnect } from '@phantom/react-sdk'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { useWalletUser } from '@/hooks/useWalletUser'
import { ChevronDownIcon, UserIcon, SettingsIcon, LogOutIcon } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function HeaderUserMenu() {
  const { publicKey, walletAddress } = usePhantomWallet()
  const { disconnect } = useDisconnect()
  const { user } = useWalletUser()
  const { t } = useTranslation()

  if (!walletAddress) {
    return null
  }

  // Get display name
  const getDisplayName = () => {
    if (user?.displayName) {
      return user.displayName
    }
    if (user?.username) {
      return user.username
    }
    // Fallback to shortened wallet address
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
  }

  const displayName = getDisplayName()
  const avatarUrl = user?.avatarUrl

  // Build profile link (primary route /profile/[walletAddress])
  const getProfileLink = () => {
    // Always use wallet address (primary, permanent route)
    return `/profile/${walletAddress}`
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="flex h-auto items-center gap-2 px-2 py-1"
          data-testid="header-user-menu-button"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="User avatar"
              className="size-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <UserIcon className="size-4" />
            </div>
          )}
          <span className="hidden sm:inline text-sm font-medium max-w-[120px] truncate">
            {displayName}
          </span>
          <ChevronDownIcon className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" collisionPadding={16}>
        {/* View Profile */}
        <DropdownMenuItem asChild>
          <Link 
            href={getProfileLink()}
            className="flex items-center gap-2 cursor-pointer"
          >
            <UserIcon className="size-4" />
            <span>{t('header.viewProfile')}</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Settings */}
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex items-center gap-2 cursor-pointer">
            <SettingsIcon className="size-4" />
            <span>{t('header.navigation.settings')}</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Disconnect Wallet */}
        <DropdownMenuItem asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 cursor-pointer"
            onClick={() => disconnect()}
          >
            <LogOutIcon className="size-4" />
            <span>{t('header.logOut')}</span>
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

