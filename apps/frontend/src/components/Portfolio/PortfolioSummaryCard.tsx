'use client';

/**
 * Portfolio Summary Card
 * 
 * AUDIT FIX: Removed deposit/withdraw buttons
 * Users manage funds directly via Phantom wallet - no CLOB deposit/withdraw needed
 */

import { useState, useEffect } from 'react';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTokenBalance } from '@/hooks/useTokenBalance';
import { useClientMounted } from '@/hooks/useClientMounted';
import { cn } from '@/lib/utils';
import { PublicKey } from '@solana/web3.js';

// USDC Devnet address
const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

interface PortfolioSummaryCardProps {
  positionsValue?: number;
  isLoadingPositions?: boolean;
}

export default function PortfolioSummaryCard({ 
  positionsValue = 0, 
  isLoadingPositions = false 
}: PortfolioSummaryCardProps) {
  const { isConnected, publicKey } = usePhantomWallet();
  const isMounted = useClientMounted();
  const [dailyChange, setDailyChange] = useState(0);
  const [dailyChangePercent, setDailyChangePercent] = useState(0);
  const { balance: usdcBalance, loading: balanceLoading } = useTokenBalance(publicKey, USDC_MINT);

  const isPositive = dailyChange >= 0;

  // Calculate total portfolio value
  const portfolioTotalValue = positionsValue + usdcBalance;
  const formattedValue = Number.isFinite(portfolioTotalValue)
    ? portfolioTotalValue.toLocaleString(undefined, { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })
    : '0.00';

  const formattedBalance = usdcBalance.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  useEffect(() => {
    if (!isMounted || !isConnected) return;
    const snapshotKey = 'catallaxyz_portfolio_snapshot';
    const currentTotal = Number.isFinite(portfolioTotalValue) ? portfolioTotalValue : 0;

    try {
      const raw = localStorage.getItem(snapshotKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { value: number; timestamp: number };
        const elapsedMs = Date.now() - parsed.timestamp;
        if (elapsedMs <= 24 * 60 * 60 * 1000 && parsed.value > 0) {
          const change = currentTotal - parsed.value;
          setDailyChange(change);
          setDailyChangePercent((change / parsed.value) * 100);
          return;
        }
      }
      localStorage.setItem(
        snapshotKey,
        JSON.stringify({ value: currentTotal, timestamp: Date.now() })
      );
      setDailyChange(0);
      setDailyChangePercent(0);
    } catch (error) {
      console.warn('Failed to compute daily change:', error);
    }
  }, [isMounted, isConnected, portfolioTotalValue]);

  const isLoadingState = !isMounted || !isConnected || balanceLoading || isLoadingPositions;

  if (isLoadingState) {
    return <Skeleton className="h-56 w-full" />;
  }

  return (
    <>
      <Card className="border border-border/60 bg-transparent">
        <CardContent className="flex flex-col p-6">
        {/* Header with icon and balance chip */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded border border-border/60 p-1">
              <svg
                className="size-4 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <span className="text-sm font-medium text-muted-foreground uppercase">Portfolio</span>
          </div>
          <div className="flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-xs font-medium">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="12" viewBox="0 0 20 14" fill="none">
              <path d="M0 8V5.49951H20V7.74951L5.5 14.0005L0 8Z" fill="#21832D"></path>
              <path d="M12.5 -0.000488281L0 5.49951L5.5 11.6245L20 5.49951L12.5 -0.000488281Z" fill="#3AB549"></path>
              <path d="M3.5 5.49951C4.3 6.29951 3.5 6.66667 3 7L5 9C6.2 8.2 6.66667 8.83333 7 9.5L15.5 6C13.9 4.8 15 4.33284 15.5 3.99951L13.5 2.49951C12.3 2.89951 11.3333 2.33285 11 1.99951L3.5 5.49951Z" fill="#92FF04"></path>
              <ellipse cx="9.5" cy="5.49951" rx="2.5" ry="1.5" fill="#3AB549"></ellipse>
            </svg>
            <span>${formattedBalance}</span>
          </div>
        </div>

        {/* Total Portfolio Value */}
        <div className="mb-2">
          <div className="text-3xl font-bold text-foreground">
            ${formattedValue}
          </div>
        </div>

        {/* Daily change */}
        <div className="mb-6">
          <div className={cn(
            'flex items-center gap-1 text-sm',
            isPositive ? 'text-green-600' : 'text-red-600'
          )}>
            {isPositive ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            <span>${dailyChange.toFixed(2)}</span>
            <span>({dailyChangePercent.toFixed(2)}%)</span>
            <span className="text-muted-foreground">Today</span>
          </div>
        </div>

        {/* Wallet info - users manage funds directly in Phantom */}
        <div className="mt-auto flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          <Wallet className="h-3 w-3" />
          <span>Manage funds in Phantom wallet</span>
        </div>
        </CardContent>
      </Card>
    </>
  );
}
