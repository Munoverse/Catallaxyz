'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { UserIcon, WalletIcon, BellIcon, FileTextIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MenuItem {
  id: string
  translationKey: string
  href: Route
  icon: React.ComponentType<{ className?: string }>
}

const menuItems: MenuItem[] = [
  { 
    id: 'profile', 
    translationKey: 'settings.menu.profile', 
    href: '/settings' as Route,
    icon: UserIcon,
  },
  { 
    id: 'account', 
    translationKey: 'settings.menu.account', 
    href: '/settings/account' as Route,
    icon: WalletIcon,
  },
  { 
    id: 'notifications', 
    translationKey: 'settings.menu.notifications', 
    href: '/settings/notifications' as Route,
    icon: BellIcon,
  },
  { 
    id: 'privacy', 
    translationKey: 'settings.menu.privacy', 
    href: '/settings/privacy' as Route,
    icon: FileTextIcon,
  },
]

export default function SettingsSidebar() {
  const pathname = usePathname()
  const { t } = useTranslation()
  
  const activeItem = menuItems.find(item => pathname === item.href)
  const active = activeItem?.id ?? 'profile'

  return (
    <aside className="lg:sticky lg:top-28 lg:self-start">
      <nav className="grid gap-1">
        {menuItems.map((item) => {
          const Icon = item.icon
          return (
            <Button
              key={item.id}
              type="button"
              variant={active === item.id ? 'default' : 'ghost'}
              className="justify-start gap-2"
              asChild
            >
              <Link href={item.href}>
                <Icon className="size-4" />
                {t(item.translationKey)}
              </Link>
            </Button>
          )
        })}
      </nav>
    </aside>
  )
}
