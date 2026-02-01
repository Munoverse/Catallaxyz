'use client'

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import { Heart, Search, TrendingUp, Users, DollarSign, Filter, Loader2, HeartOff } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFavorites } from '@/hooks/useFavorites'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { AuthDialog } from '@/components/AuthDialog'
import { formatUsdc, formatCompact } from '@/lib/format'

type SortOption = 'recent' | 'volume' | 'participants' | 'tips'
type StatusFilter = 'all' | 'active' | 'running' | 'settled' | 'terminated'

export default function FollowingPage() {
  const { t } = useTranslation()
  const { isConnected: connected } = usePhantomWallet()
  const { favorites, loading, toggleFavorite, refetch } = useFavorites()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('recent')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showAuthDialog, setShowAuthDialog] = useState(false)

  // Filter and sort favorites
  const filteredFavorites = useMemo(() => {
    let result = [...favorites]

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (fav) =>
          fav.market?.title?.toLowerCase().includes(query) ||
          fav.market?.question?.toLowerCase().includes(query) ||
          fav.market?.category?.toLowerCase().includes(query)
      )
    }

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter((fav) => fav.market?.status === statusFilter)
    }

    // Sort
    switch (sortBy) {
      case 'volume':
        result.sort((a, b) => {
          const volA = Number(a.market?.total_volume || 0)
          const volB = Number(b.market?.total_volume || 0)
          return volB - volA
        })
        break
      case 'participants':
        result.sort((a, b) => {
          const partA = a.market?.participants_count || 0
          const partB = b.market?.participants_count || 0
          return partB - partA
        })
        break
      case 'tips':
        result.sort((a, b) => {
          const tipA = Number(a.market?.tip_amount || 0)
          const tipB = Number(b.market?.tip_amount || 0)
          return tipB - tipA
        })
        break
      case 'recent':
      default:
        result.sort((a, b) => {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
    }

    return result
  }, [favorites, searchQuery, sortBy, statusFilter])

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active':
      case 'running':
        return 'bg-green-500/10 text-green-500'
      case 'settled':
        return 'bg-blue-500/10 text-blue-500'
      case 'terminated':
        return 'bg-red-500/10 text-red-500'
      case 'paused':
        return 'bg-yellow-500/10 text-yellow-500'
      default:
        return 'bg-gray-500/10 text-gray-500'
    }
  }

  const handleRemoveFavorite = async (marketId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await toggleFavorite(marketId)
    } catch (error) {
      console.error('Failed to remove favorite:', error)
    }
  }

  // Not connected state
  if (!connected) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Card className="text-center py-12">
          <CardContent className="space-y-4">
            <Heart className="mx-auto size-16 text-muted-foreground" />
            <h2 className="text-2xl font-bold">
              {t('following.signInRequired', { defaultValue: 'Sign in to view your favorites' })}
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              {t('following.signInDescription', { 
                defaultValue: 'Connect your wallet to save and track your favorite markets' 
              })}
            </p>
            <Button onClick={() => setShowAuthDialog(true)} className="mt-4">
              {t('common.connectWallet', { defaultValue: 'Connect Wallet' })}
            </Button>
          </CardContent>
        </Card>
        <AuthDialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Heart className="size-8 text-primary fill-primary" />
          {t('following.title', { defaultValue: 'My Favorites' })}
        </h1>
        <p className="text-muted-foreground">
          {t('following.subtitle', { 
            defaultValue: 'Markets you\'ve saved for quick access' 
          })}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={t('following.searchPlaceholder', { defaultValue: 'Search favorites...' })}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[140px]">
              <Filter className="size-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('following.filter.all', { defaultValue: 'All Status' })}</SelectItem>
              <SelectItem value="active">{t('following.filter.active', { defaultValue: 'Active' })}</SelectItem>
              <SelectItem value="running">{t('following.filter.running', { defaultValue: 'Running' })}</SelectItem>
              <SelectItem value="settled">{t('following.filter.settled', { defaultValue: 'Settled' })}</SelectItem>
              <SelectItem value="terminated">{t('following.filter.terminated', { defaultValue: 'Terminated' })}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[160px]">
              <TrendingUp className="size-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">{t('following.sort.recent', { defaultValue: 'Recently Added' })}</SelectItem>
              <SelectItem value="volume">{t('following.sort.volume', { defaultValue: 'Highest Volume' })}</SelectItem>
              <SelectItem value="participants">{t('following.sort.participants', { defaultValue: 'Most Participants' })}</SelectItem>
              <SelectItem value="tips">{t('following.sort.tips', { defaultValue: 'Most Tips' })}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{favorites.length}</div>
            <div className="text-sm text-muted-foreground">
              {t('following.stats.total', { defaultValue: 'Total Favorites' })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">
              {favorites.filter((f) => f.market?.status === 'active' || f.market?.status === 'running').length}
            </div>
            <div className="text-sm text-muted-foreground">
              {t('following.stats.active', { defaultValue: 'Active Markets' })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">
              {formatUsdc(
                favorites.reduce((sum, f) => sum + Number(f.market?.total_volume || 0), 0),
                { compact: true }
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {t('following.stats.volume', { defaultValue: 'Total Volume' })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">
              {formatCompact(
                favorites.reduce((sum, f) => sum + (f.market?.participants_count || 0), 0)
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {t('following.stats.participants', { defaultValue: 'Participants' })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loading state */}
      {loading && (
        <Card className="text-center py-12">
          <CardContent className="flex flex-col items-center gap-4">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-muted-foreground">
              {t('common.loading', { defaultValue: 'Loading...' })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && filteredFavorites.length === 0 && (
        <Card className="text-center py-12">
          <CardContent className="space-y-4">
            <HeartOff className="mx-auto size-16 text-muted-foreground" />
            <h2 className="text-xl font-semibold">
              {searchQuery || statusFilter !== 'all'
                ? t('following.noResults', { defaultValue: 'No markets match your filters' })
                : t('following.empty', { defaultValue: 'No favorites yet' })}
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              {searchQuery || statusFilter !== 'all'
                ? t('following.tryDifferentFilters', { defaultValue: 'Try adjusting your search or filters' })
                : t('following.emptyDescription', { 
                    defaultValue: 'Start exploring markets and save the ones you want to track' 
                  })}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button asChild className="mt-4">
                <Link href="/markets">
                  {t('following.exploreMarkets', { defaultValue: 'Explore Markets' })}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Favorites list */}
      {!loading && filteredFavorites.length > 0 && (
        <div className="space-y-3">
          {filteredFavorites.map((favorite) => (
            <Link key={favorite.marketId} href={`/markets/${favorite.marketId}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className={getStatusColor(favorite.market?.status)}>
                          {favorite.market?.status || 'Unknown'}
                        </Badge>
                        {favorite.market?.category && (
                          <Badge variant="secondary" className="text-xs">
                            {favorite.market.category}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-lg truncate">
                        {favorite.market?.title || 'Untitled Market'}
                      </h3>
                      {favorite.market?.question && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {favorite.market.question}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <DollarSign className="size-4" />
                          {formatUsdc(favorite.market?.total_volume, { compact: true })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="size-4" />
                          {favorite.market?.participants_count || 0}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                      onClick={(e) => handleRemoveFavorite(favorite.marketId, e)}
                    >
                      <Heart className="size-5 fill-current" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
