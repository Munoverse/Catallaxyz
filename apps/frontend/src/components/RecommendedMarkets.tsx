'use client'

import Link from 'next/link'
import { useMarkets } from '@/hooks/useMarkets'
import { formatTipAmount, TIP_TOKEN_SYMBOL } from '@/lib/tips'

export default function RecommendedMarkets() {
  const { markets, loading } = useMarkets({ status: 'active', sort: 'tip_amount', limit: 5 })

  if (loading) {
    return (
      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="h-3 w-20 bg-muted/60 rounded" />
        <div className="h-3 w-full bg-muted/60 rounded" />
        <div className="h-3 w-full bg-muted/60 rounded" />
      </div>
    )
  }

  if (!markets.length) {
    return (
      <p className="text-xs text-muted-foreground">No recommended markets yet</p>
    )
  }

  return (
    <div className="space-y-2">
      {markets.map((market) => (
        <Link
          key={market.id}
          href={`/markets/${market.id}`}
          className="block rounded-md border border-transparent px-2 py-1.5 text-xs hover:border-border hover:bg-muted/50 transition"
        >
          <div className="line-clamp-2 font-medium text-foreground">
            {market.title}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Tip {formatTipAmount(market.tip_amount)} {TIP_TOKEN_SYMBOL}
          </div>
        </Link>
      ))}
    </div>
  )
}
