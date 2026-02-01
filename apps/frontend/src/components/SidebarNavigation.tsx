'use client'

import type { Route } from 'next'
import { memo, useState, useMemo, useCallback } from 'react'
import {
  BookOpenIcon,
  CompassIcon,
  FileTextIcon,
  GiftIcon,
  HeartIcon,
  HistoryIcon,
  MedalIcon,
  PlusCircleIcon,
  TrendingUpIcon,
  TrophyIcon,
} from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import toast from 'react-hot-toast'
import LanguageSelector from '@/components/LanguageSelector'
import ThemeToggle from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AuthDialog } from '@/components/AuthDialog'
import RecommendedMarkets from '@/components/RecommendedMarkets'

/**
 * AUDIT FIX v2.0.3: Navigation items defined outside component to prevent recreation
 */
const NAVIGATION_ITEMS = [
  { slug: 'recommended', translationKey: 'navigation.recommended', href: '/', icon: TrendingUpIcon },
  { slug: 'all-markets', translationKey: 'navigation.allMarkets', href: '/markets', icon: CompassIcon },
  { slug: 'following', translationKey: 'navigation.following', href: '/following', icon: HeartIcon },
  { slug: 'leaderboard', translationKey: 'navigation.leaderboard', href: '/leaderboard', icon: TrophyIcon },
  { slug: 'tip-leaderboard', translationKey: 'navigation.tipLeaderboard', href: '/tips/leaderboard', icon: MedalIcon },
  { slug: 'tip-history', translationKey: 'navigation.tipHistory', href: '/tips/history', icon: HistoryIcon },
  { slug: 'rewards', translationKey: 'navigation.rewards', href: '/rewards', icon: GiftIcon },
  { slug: 'documentation', translationKey: 'navigation.documentation', href: '/docs/users', icon: BookOpenIcon },
  { slug: 'terms-of-use', translationKey: 'navigation.termsOfUse', href: '/terms-of-use', icon: FileTextIcon },
] as const

/**
 * AUDIT FIX v2.0.3: Memoized Sidebar component to prevent unnecessary re-renders
 */
function SidebarNavigationComponent() {
  const pathname = usePathname()
  const router = useRouter()
  const isHomePage = pathname === '/'
  const { t } = useTranslation()
  const { isConnected } = usePhantomWallet()
  const [showAuthDialog, setShowAuthDialog] = useState(false)

  // AUDIT FIX: Memoize isActive check
  const isActive = useCallback((href: string) => {
    if (href === '/') {
      return isHomePage
    }
    return pathname.startsWith(href === '/' ? '' : href)
  }, [pathname, isHomePage])

  // AUDIT FIX: Memoize navigation handler factory
  const handleNavigation = useCallback((href: string) => {
    return (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      router.push(href as Route)
    }
  }, [router])

  const isCreateMarketActive = useMemo(() => pathname.startsWith('/markets/create'), [pathname])

  // AUDIT FIX: Memoize create market handler
  const handleCreateMarketClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    
    // Check authentication before navigating
    if (!isConnected) {
      toast.error(t('header.navigation.loginRequired', { defaultValue: 'Please log in to create a market' }))
      setShowAuthDialog(true)
      return
    }
    
    router.push('/markets/create' as Route)
  }, [isConnected, router, t])

  return (
    <div className="flex h-full flex-col">
      <nav className="flex flex-1 flex-col gap-1">
        {/* Place Create Market button at top with dark background */}
        <div className="mb-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleCreateMarketClick}
            className={cn(
              'w-full justify-center gap-2 rounded-xl px-3 py-2.5 text-base transition-colors',
              isCreateMarketActive
                ? 'bg-primary font-bold text-primary-foreground'
                : 'bg-primary font-medium text-primary-foreground hover:bg-primary/90',
            )}
          >
            <PlusCircleIcon
              className={cn(
                'size-5 shrink-0',
                isCreateMarketActive ? 'stroke-[2.5]' : 'stroke-[2]',
              )}
            />
            <span>{t('header.navigation.create')}</span>
          </Button>
        </div>

        {NAVIGATION_ITEMS.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)

          return (
            <button
              key={item.slug}
              type="button"
              onClick={handleNavigation(item.href)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 transition-all',
                active
                  ? 'bg-muted text-base font-bold text-foreground dark:bg-slate-800/80'
                  : 'text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              {Icon && (
                <Icon
                  className={cn(
                    'shrink-0 transition-all',
                    active ? 'size-5 stroke-foreground stroke-[3]' : 'size-4 stroke-muted-foreground stroke-[2]',
                  )}
                />
              )}
              <span>{t(`header.${item.translationKey}`)}</span>
            </button>
          )
        })}
      </nav>
      <div className="mt-4 space-y-2 border-t pt-4">
        <p className="px-3 text-xs font-semibold text-muted-foreground">
          {t('sidebar.recommended', { defaultValue: 'Recommended markets' })}
        </p>
        <div className="px-2">
          <RecommendedMarkets />
        </div>
      </div>
      <div className="mt-auto space-y-3 border-t pt-4">
        <div className="flex items-center justify-between px-3">
          <span className="text-sm text-muted-foreground">{t('header.navigation.theme')}</span>
          <ThemeToggle />
        </div>
        <div className="flex items-center justify-between px-3">
          <span className="text-sm text-muted-foreground">{t('header.navigation.language')}</span>
          <LanguageSelector />
        </div>
      </div>
      <AuthDialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
    </div>
  )
}

/**
 * AUDIT FIX v2.0.3: Export memoized component to prevent unnecessary re-renders
 */
export default memo(SidebarNavigationComponent)
