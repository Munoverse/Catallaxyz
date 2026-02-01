'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { getConnection } from '@/lib/solana-connection'
import { PublicKey } from '@solana/web3.js'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'

interface MarketRow {
  id: string
  title: string
  category: string | null
  status: string | null
  created_at: string | null
  total_volume: number | null
  solana_market_account: string | null
  market_usdc_vault: string | null
}

export default function AdminAllMarkets() {
  const { publicKey } = usePhantomWallet()
  const connection = getConnection()

  const [items, setItems] = useState<MarketRow[]>([])
  const [loading, setLoading] = useState(false)
  const [balances, setBalances] = useState<Record<string, string>>({})
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const rememberWallet = publicKey?.toBase58() || ''

  const loadList = async () => {
    if (!rememberWallet) return
    setLoading(true)
    try {
      const response = await apiFetch('/api/admin/markets', {
        headers: { 'x-admin-wallet': rememberWallet },
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load markets')
      }
      setItems(data?.data || [])
    } catch (error: any) {
      toast.error('Failed to load markets', { description: error.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadList()
  }, [rememberWallet])

  useEffect(() => {
    const loadBalances = async () => {
      if (!connection) return
      const next: Record<string, string> = {}
      await Promise.all(
        items.map(async (item) => {
          if (!item.market_usdc_vault) return
          try {
            const balance = await connection.getTokenAccountBalance(
              new PublicKey(item.market_usdc_vault)
            )
            next[item.id] = balance.value.uiAmountString || '0'
          } catch (error) {
            next[item.id] = 'N/A'
          }
        })
      )
      setBalances(next)
    }
    loadBalances()
  }, [items, connection])

  const categories = useMemo(() => {
    const set = new Set(items.map((item) => item.category).filter(Boolean) as string[])
    return ['all', ...Array.from(set).sort()]
  }, [items])

  const filteredItems = useMemo(() => {
    if (categoryFilter === 'all') return items
    return items.filter((item) => item.category === categoryFilter)
  }, [items, categoryFilter])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category === 'all' ? 'All categories' : category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={loadList} disabled={loading || !rememberWallet}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">No markets found.</Card>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((market) => (
            <Card key={market.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">{market.title}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {market.category && <Badge variant="outline">{market.category}</Badge>}
                    {market.status && <Badge variant="secondary">{market.status}</Badge>}
                    <Badge variant="outline">
                      Vault:{' '}
                      {market.market_usdc_vault ? balances[market.id] ?? '...' : 'N/A'} USDC
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created: {market.created_at || 'N/A'} | Volume:{' '}
                    {market.total_volume ?? 0}
                  </div>
                  {market.solana_market_account && (
                    <div className="text-xs text-muted-foreground">
                      {market.solana_market_account}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
