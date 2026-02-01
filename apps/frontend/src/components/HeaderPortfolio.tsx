'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { PublicKey } from '@solana/web3.js'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTokenBalance } from '@/hooks/useTokenBalance'
import { formatTipUiAmount, TIP_TOKEN_MINT, TIP_TOKEN_SYMBOL } from '@/lib/tips'

export default function HeaderPortfolio() {
  const { t } = useTranslation()
  const router = useRouter()
  const { publicKey } = usePhantomWallet()
  
  // Placeholder values - will be connected to actual data later
  const portfolioValue = 0
  const isLoading = false

  const twishMint = useMemo(() => {
    if (!TIP_TOKEN_MINT) return null
    try {
      return new PublicKey(TIP_TOKEN_MINT)
    } catch {
      return null
    }
  }, [])

  const { balance: twishBalance, loading: twishLoading } = useTokenBalance(publicKey, twishMint)

  if (isLoading) {
    return (
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-1">
      {/* Portfolio */}
      <Button
        type="button"
        variant="ghost"
        className="flex flex-col items-start gap-0 px-3 py-1.5 h-auto"
      >
        <div className="text-xs font-medium text-muted-foreground">
          {t('header.portfolio')}
        </div>
        <div className="text-sm font-semibold text-primary">
          ${portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </Button>

      {/* Twish */}
      <Button
        type="button"
        variant="ghost"
        className="flex flex-col items-start gap-0 px-3 py-1.5 h-auto"
        onClick={() => router.push('/twish')}
      >
        <div className="text-xs font-medium text-muted-foreground">
          {t('header.twish', { defaultValue: TIP_TOKEN_SYMBOL })}
        </div>
        <div className="text-sm font-semibold text-primary">
          {twishLoading ? '...' : formatTipUiAmount(twishBalance)} {TIP_TOKEN_SYMBOL}
        </div>
      </Button>
    </div>
  )
}
