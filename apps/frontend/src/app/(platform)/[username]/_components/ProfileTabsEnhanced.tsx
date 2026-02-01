'use client'

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchIcon, TrendingUpIcon, ActivityIcon, ArrowUpDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// AUDIT FIX F-C5: Removed unused mock data arrays (mockPositions, mockActivity)
// Real data should come from API hooks when implemented

interface ProfileTabsEnhancedProps {
  username?: string
  isOwnProfile?: boolean
}

export default function ProfileTabsEnhanced({ username, isOwnProfile }: ProfileTabsEnhancedProps = {}) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [activityType, setActivityType] = useState<'all' | 'buy' | 'sell'>('all')
  const [positionsStatus, setPositionsStatus] = useState<'active' | 'closed'>('active')
  const [sortBy, setSortBy] = useState<'value' | 'profitLoss' | 'avgPrice' | 'currentPrice' | 'alphabetical'>('value')

  return (
    <Tabs defaultValue="activity" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="positions" className="flex items-center gap-2">
          <TrendingUpIcon className="size-4" />
          {t('profile.positions')}
        </TabsTrigger>
        <TabsTrigger value="activity" className="flex items-center gap-2">
          <ActivityIcon className="size-4" />
          {t('profile.activity')}
        </TabsTrigger>
      </TabsList>

      {/* Positions Tab */}
      <TabsContent value="positions" className="mt-4">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* Active/Closed Toggle */}
          <div className="flex rounded-md border border-border p-1">
            <Button
              size="sm"
              variant={positionsStatus === 'active' ? 'default' : 'ghost'}
              className="h-8"
              onClick={() => setPositionsStatus('active')}
            >
              Active
            </Button>
            <Button
              size="sm"
              variant={positionsStatus === 'closed' ? 'default' : 'ghost'}
              className="h-8"
              onClick={() => setPositionsStatus('closed')}
            >
              Closed
            </Button>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('profile.searchMarkets')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Sort */}
          <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
            <SelectTrigger className="w-[180px]">
              <ArrowUpDownIcon className="mr-2 size-4" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="value">Value</SelectItem>
              <SelectItem value="profitLoss">Profit/Loss %</SelectItem>
              <SelectItem value="avgPrice">Avg Price</SelectItem>
              <SelectItem value="currentPrice">Current Price</SelectItem>
              <SelectItem value="alphabetical">Alphabetical</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Empty State */}
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
          <TrendingUpIcon className="mb-4 size-12 text-muted-foreground/50" />
          <h3 className="mb-2 text-lg font-semibold">{t('profile.noPositions')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('profile.noPositionsDescription')}
          </p>
        </div>
      </TabsContent>

      {/* Activity Tab */}
      <TabsContent value="activity" className="mt-4">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* Type Filter */}
          <Select value={activityType} onValueChange={(value: any) => setActivityType(value)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="buy">Buy</SelectItem>
              <SelectItem value="sell">Sell</SelectItem>
            </SelectContent>
          </Select>

          {/* Market Filter */}
          <Select defaultValue="all">
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Market" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Markets</SelectItem>
            </SelectContent>
          </Select>

          {/* Amount Filter */}
          <Select defaultValue="all">
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Amount" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Amounts</SelectItem>
              <SelectItem value="high">High to Low</SelectItem>
              <SelectItem value="low">Low to High</SelectItem>
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('profile.searchActivity')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Empty State */}
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
          <ActivityIcon className="mb-4 size-12 text-muted-foreground/50" />
          <h3 className="mb-2 text-lg font-semibold">{t('profile.noActivity')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('profile.noActivityDescription')}
          </p>
        </div>
      </TabsContent>
    </Tabs>
  )
}

