'use client'

import { useEffect, useState } from 'react'
import { Award } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatTipAmount, TIP_TOKEN_SYMBOL } from '@/lib/tips'
import { UserProfileLink } from '@/components/UserProfileLink'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '@/lib/api-client'

type TimePeriod = 'day' | 'week' | 'month' | 'all'
type TipType = 'all' | 'market' | 'comment'

interface TipLeaderboardEntry {
  rank: number
  recipient_wallet: string
  username?: string | null
  avatar_url?: string | null
  total_amount: string
  tip_count: number
}

export default function TipLeaderboardPage() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<TimePeriod>('week')
  const [type, setType] = useState<TipType>('all')
  const [loading, setLoading] = useState(false)
  const [leaderboard, setLeaderboard] = useState<TipLeaderboardEntry[]>([])

  useEffect(() => {
    const loadLeaderboard = async () => {
      setLoading(true)
      try {
        const response = await apiFetch(`/api/tips/leaderboard?period=${period}&type=${type}`)
        const data = await response.json()
        setLeaderboard(data?.data?.leaderboard || [])
      } catch (error) {
        console.error('Failed to load tip leaderboard:', error)
        setLeaderboard([])
      } finally {
        setLoading(false)
      }
    }

    loadLeaderboard()
  }, [period, type])

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Award className="size-8 text-primary" />
          {t('tips.leaderboard.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('tips.leaderboard.subtitle')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="day">{t('tips.period.day')}</TabsTrigger>
            <TabsTrigger value="week">{t('tips.period.week')}</TabsTrigger>
            <TabsTrigger value="month">{t('tips.period.month')}</TabsTrigger>
            <TabsTrigger value="all">{t('tips.period.all')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={type} onValueChange={(v) => setType(v as TipType)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">{t('tips.type.all')}</TabsTrigger>
            <TabsTrigger value="market">{t('tips.type.market')}</TabsTrigger>
            <TabsTrigger value="comment">{t('tips.type.comment')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('tips.leaderboard.tableTitle')}</CardTitle>
          <CardDescription>
            {t('tips.leaderboard.count', { count: leaderboard.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">{t('tips.leaderboard.empty')}</div>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry) => (
                <div
                  key={entry.recipient_wallet}
                  className="flex items-center justify-between gap-4 rounded-lg border p-4 hover:bg-muted/40 transition"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-sm font-semibold text-muted-foreground w-8 text-center">
                      #{entry.rank}
                    </div>
                    <Avatar className="size-10">
                      <AvatarImage src={entry.avatar_url || undefined} />
                      <AvatarFallback>
                        {(entry.username || entry.recipient_wallet).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <UserProfileLink walletAddress={entry.recipient_wallet}>
                        <div className="font-semibold">
                          {entry.username ? `@${entry.username}` : entry.recipient_wallet.slice(0, 8)}
                        </div>
                      </UserProfileLink>
                      <div className="text-xs text-muted-foreground">
                        {entry.recipient_wallet.slice(0, 6)}...{entry.recipient_wallet.slice(-4)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      {formatTipAmount(entry.total_amount)} {TIP_TOKEN_SYMBOL}
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {t('tips.leaderboard.tipCount', { count: entry.tip_count })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
