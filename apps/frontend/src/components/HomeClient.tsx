'use client'

import Link from 'next/link'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { useMarkets } from '@/hooks/useMarkets'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AuthDialog } from '@/components/AuthDialog'
import { useState } from 'react'
import { Heart } from 'lucide-react'
import toast from 'react-hot-toast'
import { useFavorites } from '@/hooks/useFavorites'

export default function HomeClient() {
  const { isConnected } = usePhantomWallet()
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const { markets, loading: marketsLoading } = useMarkets({ status: 'active', sort: 'tip_amount' })
  const { t } = useTranslation()
  const { favoriteIds, toggleFavorite } = useFavorites()

  if (marketsLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">{t('home.recommendedTitle')}</h1>
          <p className="text-muted-foreground text-sm">{t('home.recommendedSubtitle')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-[180px]" />
          ))}
        </div>
      </div>
    )
  }

  if (markets.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">{t('home.recommendedTitle')}</h1>
          <p className="text-muted-foreground text-sm">{t('home.recommendedSubtitle')}</p>
        </div>
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">
              {isConnected ? t('home.noMarkets') : t('home.connectWallet')}
            </p>
            {!isConnected && (
              <Button onClick={() => setShowAuthDialog(true)}>
                {t('header.logIn')}
              </Button>
            )}
            <AuthDialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">{t('home.recommendedTitle')}</h1>
        <p className="text-muted-foreground text-sm">{t('home.recommendedSubtitle')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {markets.map((market) => {
          const isFavorite = favoriteIds.has(market.id)
          return (
            <Card
              key={market.id}
              className="relative h-[180px] cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <button
                type="button"
                onClick={async (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  try {
                    await toggleFavorite(market.id)
                  } catch (error: any) {
                    toast.error(error.message || 'Failed to update favorite')
                  }
                }}
                className="absolute right-2 top-2 z-10 rounded-full bg-background/80 p-1.5 text-muted-foreground hover:text-red-500"
                aria-label={isFavorite ? 'Unfavorite market' : 'Favorite market'}
              >
                <Heart className={isFavorite ? 'h-4 w-4 fill-red-500 text-red-500' : 'h-4 w-4'} />
              </button>
              <Link href={`/markets/${market.id}`}>
                <CardContent className="p-4 h-full flex flex-col">
                <h3 className="text-sm font-semibold mb-2 line-clamp-2 leading-tight">
                  {market.title}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-2 flex-1 mb-3">
                  {market.question}
                </p>
                <div className="flex justify-between text-xs text-muted-foreground mt-auto">
                  <span>{t('home.settlements')}: {market.settlement_count || 0}</span>
                  <span className="capitalize">{market.status}</span>
                </div>
                </CardContent>
              </Link>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

