'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { History } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { AuthDialog } from '@/components/AuthDialog'
import { formatTipAmount, TIP_TOKEN_SYMBOL } from '@/lib/tips'
import { UserProfileLink } from '@/components/UserProfileLink'
import { useTranslation } from 'react-i18next'

type TipType = 'all' | 'market' | 'comment'
type Direction = 'all' | 'sent' | 'received'

interface TipHistoryEntry {
  id: string
  target_type: 'market' | 'comment'
  target_id: string
  sender_wallet: string
  recipient_wallet: string
  amount_raw: string
  token_mint: string
  tx_signature: string
  created_at: string
  market?: { id: string; title: string } | null
  comment?: { id: string; content: any; market_id: string } | null
  sender?: { username?: string | null; avatar_url?: string | null; wallet_address?: string | null } | null
  recipient?: { username?: string | null; avatar_url?: string | null; wallet_address?: string | null } | null
}

function getCommentSnippet(comment: { content: any } | null | undefined, fallback: string) {
  if (!comment?.content) return fallback
  if (typeof comment.content === 'string') {
    return comment.content.slice(0, 80)
  }
  try {
    return JSON.stringify(comment.content).slice(0, 80)
  } catch {
    return fallback
  }
}

export default function TipHistoryPage() {
  const { publicKey, isConnected: connected } = usePhantomWallet()
  const { t } = useTranslation()
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [type, setType] = useState<TipType>('all')
  const [direction, setDirection] = useState<Direction>('all')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<TipHistoryEntry[]>([])

  const walletAddress = useMemo(() => publicKey?.toString() || '', [publicKey])

  useEffect(() => {
    if (!connected || !walletAddress) return

    const loadHistory = async () => {
      setLoading(true)
      try {
        const response = await fetch(
          `/api/tips/history?wallet=${walletAddress}&type=${type}&direction=${direction}`
        )
        const data = await response.json()
        setHistory(data?.data?.history || [])
      } catch (error) {
        console.error('Failed to load tip history:', error)
        setHistory([])
      } finally {
        setLoading(false)
      }
    }

    loadHistory()
  }, [connected, walletAddress, type, direction])

  if (!connected) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-4xl text-center">
        <h1 className="text-2xl font-bold mb-4">{t('tips.history.title')}</h1>
        <p className="text-muted-foreground mb-6">{t('tips.history.loginRequired')}</p>
        <Button onClick={() => setShowAuthDialog(true)}>{t('header.logIn')}</Button>
        <AuthDialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <History className="size-8 text-primary" />
          {t('tips.history.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('tips.history.subtitle')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <Tabs value={direction} onValueChange={(v) => setDirection(v as Direction)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">{t('tips.direction.all')}</TabsTrigger>
            <TabsTrigger value="sent">{t('tips.direction.sent')}</TabsTrigger>
            <TabsTrigger value="received">{t('tips.direction.received')}</TabsTrigger>
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
          <CardTitle>{t('tips.history.tableTitle')}</CardTitle>
          <CardDescription>{t('tips.history.count', { count: history.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">{t('tips.history.empty')}</div>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => {
                const isSender = entry.sender_wallet === walletAddress
                const otherWallet = isSender ? entry.recipient_wallet : entry.sender_wallet
                const otherName = isSender ? entry.recipient?.username : entry.sender?.username
                const title = entry.target_type === 'market'
                  ? entry.market?.title || t('tips.history.marketFallback')
                  : getCommentSnippet(entry.comment, t('tips.history.commentFallback'))

                const link = entry.target_type === 'market'
                  ? `/markets/${entry.market?.id || entry.target_id}`
                  : `/markets/${entry.comment?.market_id || ''}`

                return (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-2 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">
                        {isSender ? t('tips.history.sentTo') : t('tips.history.receivedFrom')}
                        <UserProfileLink walletAddress={otherWallet} className="ml-1 font-semibold text-foreground">
                          {otherName ? `@${otherName}` : `${otherWallet.slice(0, 6)}...${otherWallet.slice(-4)}`}
                        </UserProfileLink>
                      </div>
                      <div className="font-medium">
                        <Link href={link} className="hover:text-primary">
                          {title}
                        </Link>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">
                        {formatTipAmount(entry.amount_raw)} {TIP_TOKEN_SYMBOL}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entry.target_type === 'market' ? t('tips.type.market') : t('tips.type.comment')}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
