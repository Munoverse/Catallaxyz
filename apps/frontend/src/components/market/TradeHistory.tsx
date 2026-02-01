'use client';

import type { Trade } from '@/types';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/LoadingSpinner';

interface TradeHistoryProps {
  trades: Trade[];
  loading: boolean;
  error?: string | null;
  outcomeSymbols?: {
    yes: string;
    no: string;
  };
}

export default function TradeHistory({ trades, loading, error, outcomeSymbols }: TradeHistoryProps) {
  const yesSymbol = outcomeSymbols?.yes || 'YES';
  const noSymbol = outcomeSymbols?.no || 'NO';

  if (loading) {
    return (
      <div className="py-8">
        <LoadingSpinner text="Loading trades..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 text-center py-8">
        {error}
      </div>
    );
  }

  if (!trades.length) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No trades yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {trades.map((trade) => (
        <div
          key={trade.id}
          className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm"
        >
          <div className="flex items-center gap-3">
            <Badge
              variant={trade.side === 'buy' ? 'default' : 'destructive'}
              className={trade.side === 'buy' ? 'bg-green-600' : 'bg-red-600'}
            >
              {trade.side.toUpperCase()}
            </Badge>
            <Badge variant="outline">
              {trade.outcome_type === 'yes' ? yesSymbol : noSymbol}
            </Badge>
            <span className="font-mono">
              ${(trade.price * 100).toFixed(1)}¢
            </span>
            <span className="font-mono">
              {((trade.amount || 0) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {trade.created_at ? new Date(trade.created_at).toLocaleString() : '-'}
          </div>
        </div>
      ))}
    </div>
  );
}
