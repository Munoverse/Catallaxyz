'use client'

/**
 * Gas Payment Info Component (Simplified)
 * 
 * Shows SOL balance and gas payment info.
 * All users pay gas with SOL directly.
 * 
 * Usage:
 * <GasPaymentSelector />
 */

import { useGasPayment } from '@/hooks/useGasPayment'
import { useTranslation } from 'react-i18next'
import { Fuel, AlertCircle } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface GasPaymentSelectorProps {
  /** Display variant */
  variant?: 'default' | 'compact' | 'minimal'
  /** Additional CSS classes */
  className?: string
  /** Show only if embedded wallet */
  hideForExtension?: boolean
}

/**
 * Format SOL balance for display
 */
function formatSolBalance(balance: number): string {
  if (balance === 0) return '0'
  if (balance < 0.001) return '<0.001'
  if (balance < 1) return balance.toFixed(4)
  return balance.toFixed(2)
}

export function GasPaymentSelector({
  variant = 'default',
  className,
  hideForExtension = true,
}: GasPaymentSelectorProps) {
  const { t } = useTranslation()
  const {
    solBalance,
    hasSufficientSol,
    isLoading,
    isEmbeddedWallet,
    error,
  } = useGasPayment()

  // Don't show for extension wallets if hideForExtension is true
  if (hideForExtension && !isEmbeddedWallet) {
    return null
  }

  // Minimal variant - just show gas icon with tooltip
  if (variant === 'minimal') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('flex items-center gap-1', className)}>
              <Fuel className={cn(
                'h-3 w-3',
                hasSufficientSol ? 'text-muted-foreground' : 'text-destructive'
              )} />
              <span className="text-xs font-mono">
                {formatSolBalance(solBalance)} SOL
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('gasPayment.solRequired', 'SOL required for gas fees')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Compact variant - inline display
  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center gap-2 text-sm', className)}>
        <Fuel className={cn(
          'h-4 w-4',
          hasSufficientSol ? 'text-muted-foreground' : 'text-destructive'
        )} />
        <span className="text-muted-foreground">{t('gasPayment.gasBalance', 'Gas')}:</span>
        <span className={cn(
          'font-mono',
          !hasSufficientSol && 'text-destructive'
        )}>
          {formatSolBalance(solBalance)} SOL
        </span>
        {!hasSufficientSol && (
          <span className="text-xs text-destructive">
            ({t('gasPayment.insufficientSol', 'Need SOL for gas')})
          </span>
        )}
      </div>
    )
  }

  // Default variant - full display
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Fuel className="h-4 w-4" />
        {t('gasPayment.title', 'Gas Payment')}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      )}

      <div className={cn(
        'p-3 rounded-md border',
        hasSufficientSol 
          ? 'bg-muted/50 border-border' 
          : 'bg-destructive/10 border-destructive/30'
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img 
              src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
              alt="SOL"
              className="w-5 h-5 rounded-full"
            />
            <span className="font-medium">SOL</span>
          </div>
          <span className={cn(
            'font-mono',
            !hasSufficientSol && 'text-destructive font-semibold'
          )}>
            {isLoading ? '...' : formatSolBalance(solBalance)}
          </span>
        </div>
        
        {!hasSufficientSol && (
          <p className="text-xs text-destructive mt-2">
            {t('gasPayment.needSol', 'You need SOL to pay for transaction fees. Please add SOL to your wallet.')}
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {t('gasPayment.solDescription', 'Transaction fees are paid with SOL.')}
      </p>
    </div>
  )
}

export default GasPaymentSelector
