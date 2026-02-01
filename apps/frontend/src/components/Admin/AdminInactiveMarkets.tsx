'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { getConnection } from '@/lib/solana-connection'
import { PublicKey, Transaction } from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { apiFetch } from '@/lib/api-client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { usecatallaxyzProgram } from '@/hooks/useCatallaxyzProgram'

interface InactiveMarketCandidate {
  id: string
  market_id: string
  market_title: string
  solana_market_account: string | null
  market_usdc_vault: string | null
  market_created_at: string | null
  total_volume: number | null
  category: string | null
  last_trade_at: string | null
  days_inactive: number
  status: string | null
  reason: string | null
  snapshot_at: string
}

const CSV_HEADERS = [
  'market_id',
  'market_title',
  'solana_market_account',
  'market_usdc_vault',
  'market_created_at',
  'total_volume',
  'category',
  'last_trade_at',
  'days_inactive',
  'status',
  'reason',
  'snapshot_at',
  'vault_balance',
]

export default function AdminInactiveMarkets() {
  const { publicKey, solana } = usePhantomWallet()
  const connection = getConnection()
  const program = usecatallaxyzProgram()

  const [items, setItems] = useState<InactiveMarketCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [terminating, setTerminating] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [balances, setBalances] = useState<Record<string, string>>({})
  const [inactivityDays, setInactivityDays] = useState<3 | 5 | 7>(7)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sortMode, setSortMode] = useState<'days' | 'vault' | 'volume' | 'created'>('days')

  const adminWallet = publicKey?.toBase58() || ''

  const sortedItems = useMemo(() => {
    const copy = items.filter((item) => item.days_inactive >= inactivityDays)
    if (sortMode === 'vault') {
      return copy.sort(
        (a, b) => {
          const aBalance = parseFloat(balances[a.id] || '0')
          const bBalance = parseFloat(balances[b.id] || '0')
          return (isNaN(bBalance) ? 0 : bBalance) - (isNaN(aBalance) ? 0 : aBalance)
        }
      )
    }
    if (sortMode === 'volume') {
      return copy.sort(
        (a, b) => (b.total_volume || 0) - (a.total_volume || 0)
      )
    }
    if (sortMode === 'created') {
      return copy.sort(
        (a, b) =>
          new Date(b.market_created_at || 0).getTime() -
          new Date(a.market_created_at || 0).getTime()
      )
    }
    return copy.sort((a, b) => b.days_inactive - a.days_inactive)
  }, [items, inactivityDays, sortMode, balances])

  const selectedInView = useMemo(
    () => sortedItems.filter((item) => selectedIds.has(item.id)),
    [sortedItems, selectedIds]
  )

  const loadList = async (minDays: number = inactivityDays) => {
    if (!adminWallet) return
    setLoading(true)
    try {
      const response = await apiFetch(`/api/admin/inactive-markets?minDays=${minDays}`, {
        headers: { 'x-admin-wallet': adminWallet },
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load inactive markets')
      }
      setItems(data?.data || [])
    } catch (error: any) {
      toast.error('Failed to load inactive markets', { description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const refreshList = async (days: number = inactivityDays) => {
    if (!adminWallet) return
    setRefreshing(true)
    try {
      const response = await apiFetch('/api/admin/inactive-markets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-wallet': adminWallet,
        },
        body: JSON.stringify({ inactivityDays: days }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to refresh list')
      }
      toast.success('Inactive market list refreshed')
      await loadList(days)
    } catch (error: any) {
      toast.error('Failed to refresh list', { description: error.message })
    } finally {
      setRefreshing(false)
    }
  }

  const ensureUsdcAta = async (
    owner: PublicKey,
    usdcMint: PublicKey,
    payer: PublicKey
  ) => {
    const ata = await getAssociatedTokenAddress(usdcMint, owner)
    const info = await connection.getAccountInfo(ata)
    if (info) return ata

    if (!solana) {
      throw new Error('Wallet not connected')
    }

    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer,
        ata,
        owner,
        usdcMint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    )
    const { blockhash } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer = payer
    const result = await solana.signAndSendTransaction(tx)
    const signature = result.signature
    await connection.confirmTransaction(signature, 'confirmed')
    return ata
  }

  const terminateMarket = async (market: InactiveMarketCandidate) => {
    if (!publicKey || !program) {
      toast.error('Please log in')
      return false
    }
    if (!market.solana_market_account) {
      toast.error('Missing market account')
      return false
    }
    try {
      // AUDIT FIX F-H1: Require proper USDC mint configuration
      const usdcMintAddress = process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS
      if (!usdcMintAddress) {
        toast.error('USDC mint address not configured')
        return false
      }
      const usdcMint = new PublicKey(usdcMintAddress)
      const marketPubkey = new PublicKey(market.solana_market_account)
      const marketAccount = await program.account.market.fetch(marketPubkey)
      const creatorUsdcAccount = await ensureUsdcAta(
        marketAccount.creator as PublicKey,
        usdcMint,
        publicKey
      )

      // Anchor auto-derives PDAs: global, marketUsdcVault, creatorTreasury
      const tx = await program.methods
        .terminateIfInactive()
        .accounts({
          caller: publicKey,
          market: marketPubkey,
          creatorUsdcAccount,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc()

      toast.success('Market terminated', { description: tx })
      return true
    } catch (error: any) {
      toast.error('Termination failed', { description: error.message || 'Unknown error' })
      return false
    }
  }

  const handleTerminate = async (market: InactiveMarketCandidate) => {
    setTerminating(market.id)
    const success = await terminateMarket(market)
    setTerminating(null)
    if (success) {
      await loadList()
    }
  }

  const handleTerminateSelected = async () => {
    if (selectedInView.length === 0) return
    if (!adminWallet) {
      toast.error('Admin wallet required')
      return
    }
    setTerminating('batch')
    try {
      const response = await apiFetch('/api/admin/inactive-markets/terminate-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-wallet': adminWallet,
        },
        body: JSON.stringify({
          marketIds: selectedInView.map((market) => market.market_id),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Batch termination failed')
      }
      const terminated = data?.data?.terminated ?? 0
      const skipped = data?.data?.skipped ?? 0
      toast.success('Batch termination complete', {
        description: `Terminated: ${terminated}, Skipped: ${skipped}`,
      })
      setSelectedIds(new Set())
      await loadList()
    } catch (error: any) {
      toast.error('Batch termination failed', { description: error.message })
    } finally {
      setTerminating(null)
    }
  }

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const toggleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(sortedItems.map((item) => item.id)))
  }

  const exportCsv = (rows: InactiveMarketCandidate[], filenameSuffix: string) => {
    if (rows.length === 0) return
    const dataRows = rows.map((item) => ({
      market_id: item.market_id,
      market_title: item.market_title,
      solana_market_account: item.solana_market_account || '',
      market_usdc_vault: item.market_usdc_vault || '',
      market_created_at: item.market_created_at || '',
      total_volume: item.total_volume ?? 0,
      category: item.category || '',
      last_trade_at: item.last_trade_at || '',
      days_inactive: item.days_inactive.toString(),
      status: item.status || '',
      reason: item.reason || '',
      snapshot_at: item.snapshot_at,
      vault_balance: item.market_usdc_vault ? balances[item.id] || '' : '',
    }))

    const csv = [
      CSV_HEADERS.join(','),
      ...dataRows.map((row) =>
        CSV_HEADERS.map((key) => `"${String((row as any)[key] ?? '').replace(/"/g, '""')}"`).join(
          ','
        )
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `inactive-markets-${filenameSuffix}-${Date.now()}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    loadList(inactivityDays)
  }, [adminWallet, inactivityDays])

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Markets inactive for {inactivityDays}+ days are listed here for manual termination.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(inactivityDays)}
            onValueChange={(value) => setInactivityDays(Number(value) as 3 | 5 | 7)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Days inactive" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">≥ 3 days</SelectItem>
              <SelectItem value="5">≥ 5 days</SelectItem>
              <SelectItem value="7">≥ 7 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortMode} onValueChange={(value) => setSortMode(value as any)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="days">By inactivity</SelectItem>
              <SelectItem value="vault">By vault balance</SelectItem>
              <SelectItem value="volume">By trade volume</SelectItem>
              <SelectItem value="created">By created date</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => refreshList()}
            disabled={refreshing || !adminWallet}
          >
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh List
          </Button>
          <Button
            variant="outline"
            onClick={() => exportCsv(items, 'all')}
            disabled={items.length === 0}
          >
            Export All
          </Button>
          <Button
            variant="outline"
            onClick={() => exportCsv(selectedInView, 'selected')}
            disabled={selectedInView.length === 0}
          >
            Export Selected
          </Button>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={selectedInView.length === 0 || terminating === 'batch'}
          >
            {terminating === 'batch' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Terminating...
              </>
            ) : (
              `Terminate Selected (${selectedInView.length})`
            )}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : sortedItems.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          No inactive markets found.
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selectedInView.length === sortedItems.length && sortedItems.length > 0}
              onCheckedChange={(checked) => toggleSelectAll(checked as boolean)}
            />
            <span>Select all</span>
          </div>
          {sortedItems.map((market) => (
            <Card key={market.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedIds.has(market.id)}
                    onCheckedChange={(checked) => toggleSelect(market.id, checked as boolean)}
                  />
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">{market.market_title}</div>
                    <div className="text-xs text-muted-foreground">
                      Last trade: {market.last_trade_at || 'N/A'}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{market.days_inactive} days inactive</Badge>
                      {market.status && <Badge variant="secondary">{market.status}</Badge>}
                      <Badge variant="outline">
                        Vault:{' '}
                        {market.market_usdc_vault
                          ? balances[market.id] ?? '...'
                          : 'N/A'}{' '}
                        USDC
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Created: {market.market_created_at || 'N/A'} | Volume:{' '}
                      {market.total_volume ?? 0}
                    </div>
                    {market.solana_market_account && (
                      <div className="text-xs text-muted-foreground">
                        {market.solana_market_account}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleTerminate(market)}
                  disabled={terminating === market.id}
                >
                  {terminating === market.id ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Terminating...
                    </>
                  ) : (
                    'Terminate'
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm batch termination</DialogTitle>
            <DialogDescription>
              You are about to terminate {selectedInView.length} market(s). This action is
              irreversible on-chain.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto rounded-md border p-3 text-sm">
            {selectedInView.length === 0 ? (
              <p className="text-muted-foreground">No markets selected.</p>
            ) : (
              <ul className="space-y-1">
                {selectedInView.map((market) => (
                  <li key={market.id}>
                    {market.market_title}
                    {market.solana_market_account ? (
                      <span className="text-muted-foreground"> ({market.solana_market_account})</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setConfirmOpen(false)
                await handleTerminateSelected()
              }}
              disabled={selectedInView.length === 0 || terminating === 'batch'}
            >
              Confirm Termination
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
