'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import { 
  Gift, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  DollarSign, 
  Loader2, 
  AlertCircle,
  ChevronRight,
  Trophy,
  Wallet
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { AuthDialog } from '@/components/AuthDialog'
import { apiFetch } from '@/lib/api-client'
import { formatUsdc, formatDate, formatPriceDecimal } from '@/lib/format'

interface RewardSummary {
  totalEarned: number
  totalPending: number
  totalClaimed: number
  rewardsCount: number
}

interface RewardEntry {
  id: string
  rewardPeriod: string
  marketId: string
  marketTitle: string
  rewardAmount: number
  rewardShare: number
  status: 'pending' | 'distributed' | 'claimed'
  createdAt: string
}

type StatusFilter = 'all' | 'pending' | 'distributed' | 'claimed'

export default function RewardsPage() {
  const { t } = useTranslation()
  const { isConnected: connected, publicKey } = usePhantomWallet()
  
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<RewardSummary | null>(null)
  const [rewards, setRewards] = useState<RewardEntry[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [error, setError] = useState<string | null>(null)

  const fetchRewards = useCallback(async () => {
    if (!connected || !publicKey) return

    setLoading(true)
    setError(null)

    try {
      // Fetch summary
      const summaryResponse = await apiFetch('/api/rewards/summary')
      const summaryData = await summaryResponse.json()
      
      if (summaryResponse.ok && summaryData?.success) {
        setSummary(summaryData.data)
      }

      // Fetch rewards list
      const rewardsResponse = await apiFetch('/api/rewards')
      const rewardsData = await rewardsResponse.json()
      
      if (rewardsResponse.ok && rewardsData?.success) {
        setRewards(rewardsData.data?.rewards || [])
      }
    } catch (err) {
      console.error('Failed to fetch rewards:', err)
      setError('Failed to load rewards. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [connected, publicKey])

  useEffect(() => {
    if (connected && publicKey) {
      fetchRewards()
    }
  }, [connected, publicKey, fetchRewards])

  // Filter rewards by status
  const filteredRewards = statusFilter === 'all' 
    ? rewards 
    : rewards.filter((r) => r.status === statusFilter)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
            <Clock className="size-3 mr-1" />
            {t('rewards.status.pending', { defaultValue: 'Pending' })}
          </Badge>
        )
      case 'distributed':
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
            <TrendingUp className="size-3 mr-1" />
            {t('rewards.status.distributed', { defaultValue: 'Distributed' })}
          </Badge>
        )
      case 'claimed':
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle className="size-3 mr-1" />
            {t('rewards.status.claimed', { defaultValue: 'Claimed' })}
          </Badge>
        )
      default:
        return null
    }
  }

  // Not connected state
  if (!connected) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Card className="text-center py-12">
          <CardContent className="space-y-4">
            <Wallet className="mx-auto size-16 text-muted-foreground" />
            <h2 className="text-2xl font-bold">
              {t('rewards.signInRequired', { defaultValue: 'Sign in to view your rewards' })}
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              {t('rewards.signInDescription', { 
                defaultValue: 'Connect your wallet to view and claim your liquidity rewards' 
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
          <Gift className="size-8 text-primary" />
          {t('rewards.title', { defaultValue: 'Liquidity Rewards' })}
        </h1>
        <p className="text-muted-foreground">
          {t('rewards.subtitle', { 
            defaultValue: 'Earn rewards by providing liquidity to prediction markets' 
          })}
        </p>
      </div>

      {/* Loading state */}
      {loading && (
        <Card className="text-center py-12">
          <CardContent className="flex flex-col items-center gap-4">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-muted-foreground">
              {t('common.loading', { defaultValue: 'Loading rewards...' })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && !loading && (
        <Card className="text-center py-12 border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
          <CardContent className="space-y-4">
            <AlertCircle className="mx-auto size-12 text-red-500" />
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <Button variant="outline" onClick={fetchRewards}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Trophy className="size-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    {t('rewards.summary.totalEarned', { defaultValue: 'Total Earned' })}
                  </span>
                </div>
                <div className="text-2xl font-bold">
                  ${formatUsdc(summary?.totalEarned || 0)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-yellow-500/10 rounded-lg">
                    <Clock className="size-5 text-yellow-600" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    {t('rewards.summary.pending', { defaultValue: 'Pending' })}
                  </span>
                </div>
                <div className="text-2xl font-bold">
                  ${formatUsdc(summary?.totalPending || 0)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <CheckCircle className="size-5 text-green-600" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    {t('rewards.summary.claimed', { defaultValue: 'Claimed' })}
                  </span>
                </div>
                <div className="text-2xl font-bold">
                  ${formatUsdc(summary?.totalClaimed || 0)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Gift className="size-5 text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    {t('rewards.summary.count', { defaultValue: 'Total Rewards' })}
                  </span>
                </div>
                <div className="text-2xl font-bold">
                  {summary?.rewardsCount || 0}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* How It Works */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-lg">
                {t('rewards.howItWorks.title', { defaultValue: 'How Liquidity Rewards Work' })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex gap-4">
                  <div className="shrink-0 size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    1
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">
                      {t('rewards.howItWorks.step1Title', { defaultValue: 'Provide Liquidity' })}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t('rewards.howItWorks.step1Desc', { 
                        defaultValue: 'Place limit orders on prediction markets to provide liquidity' 
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="shrink-0 size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    2
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">
                      {t('rewards.howItWorks.step2Title', { defaultValue: 'Earn Points' })}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t('rewards.howItWorks.step2Desc', { 
                        defaultValue: 'Accumulate liquidity score based on order size and duration' 
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="shrink-0 size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    3
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">
                      {t('rewards.howItWorks.step3Title', { defaultValue: 'Receive Rewards' })}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t('rewards.howItWorks.step3Desc', { 
                        defaultValue: 'Rewards are distributed daily based on your share of total liquidity' 
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rewards History */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {t('rewards.history.title', { defaultValue: 'Reward History' })}
                </CardTitle>
                <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                  <TabsList>
                    <TabsTrigger value="all">
                      {t('rewards.filter.all', { defaultValue: 'All' })}
                    </TabsTrigger>
                    <TabsTrigger value="pending">
                      {t('rewards.filter.pending', { defaultValue: 'Pending' })}
                    </TabsTrigger>
                    <TabsTrigger value="distributed">
                      {t('rewards.filter.distributed', { defaultValue: 'Distributed' })}
                    </TabsTrigger>
                    <TabsTrigger value="claimed">
                      {t('rewards.filter.claimed', { defaultValue: 'Claimed' })}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {filteredRewards.length === 0 ? (
                <div className="text-center py-12">
                  <Gift className="mx-auto size-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    {t('rewards.history.empty', { defaultValue: 'No rewards yet' })}
                  </h3>
                  <p className="text-muted-foreground max-w-md mx-auto mb-4">
                    {t('rewards.history.emptyDesc', { 
                      defaultValue: 'Start providing liquidity to markets to earn rewards' 
                    })}
                  </p>
                  <Button asChild>
                    <Link href="/markets">
                      {t('rewards.history.exploreMarkets', { defaultValue: 'Explore Markets' })}
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRewards.map((reward) => (
                    <Link 
                      key={reward.id} 
                      href={`/markets/${reward.marketId}`}
                      className="block"
                    >
                      <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            {getStatusBadge(reward.status)}
                            <span className="text-sm text-muted-foreground">
                              {formatDate(reward.rewardPeriod)}
                            </span>
                          </div>
                          <h4 className="font-medium truncate">
                            {reward.marketTitle}
                          </h4>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            <span>
                              {t('rewards.history.share', { defaultValue: 'Share' })}: {formatPriceDecimal(reward.rewardShare * 100)}%
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-lg font-bold text-primary">
                              +${formatUsdc(reward.rewardAmount)}
                            </div>
                          </div>
                          <ChevronRight className="size-5 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
