'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  TrendingUp, 
  TrendingDown, 
  Share, 
  ChevronDown, 
  ChevronUp,
  AlertCircle 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import LoadingSpinner from '@/components/LoadingSpinner';

interface Position {
  id: string;
  outcome: 'yes' | 'no';
  shares: number;
  averagePrice: number;
  currentPrice: number;
  totalValue: number;
  costBasis: number;
  profitLoss: number;
  profitLossPercent: number;
}

interface UserPositionsPanelProps {
  marketId: string;
  positions?: Position[];
  loading?: boolean;
  onSell?: (position: Position) => void;
  onMerge?: () => void;
}

function PositionRow({ 
  position, 
  onSell 
}: { 
  position: Position; 
  onSell?: (position: Position) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isYes = position.outcome === 'yes';
  const isProfit = position.profitLoss >= 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Main Row */}
      <div
        className={cn(
          'grid items-center gap-3 px-3 py-3 text-sm',
          'grid-cols-[auto_1fr_auto_auto_auto]',
          'hover:bg-muted/50 transition-colors'
        )}
      >
        {/* Outcome Badge */}
        <Badge
          variant={isYes ? 'default' : 'destructive'}
          className={cn(
            'font-semibold tracking-wide',
            isYes ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
          )}
        >
          {position.outcome.toUpperCase()}
        </Badge>

        {/* Shares & Value */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold">{position.shares.toLocaleString()} shares</span>
            <span className="text-xs text-muted-foreground">
              @ ${(position.currentPrice * 100).toFixed(1)}¢
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Value: ${position.totalValue.toFixed(2)}
          </div>
        </div>

        {/* P&L */}
        <div className="flex flex-col items-end">
          <span
            className={cn(
              'font-semibold',
              isProfit ? 'text-green-600' : 'text-red-600'
            )}
          >
            {isProfit ? '+' : ''}${Math.abs(position.profitLoss).toFixed(2)}
          </span>
          <span
            className={cn(
              'text-xs',
              isProfit ? 'text-green-600' : 'text-red-600'
            )}
          >
            {isProfit ? '+' : ''}{position.profitLossPercent.toFixed(1)}%
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {onSell && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSell(position)}
              className="h-8"
            >
              Sell
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded(!expanded)}
            className="h-8 w-8"
          >
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-3 py-3 bg-muted/30 border-t border-border space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-muted-foreground">Avg Cost:</span>
              <span className="ml-2 font-mono">${(position.averagePrice * 100).toFixed(1)}¢</span>
            </div>
            <div>
              <span className="text-muted-foreground">Current Price:</span>
              <span className="ml-2 font-mono">${(position.currentPrice * 100).toFixed(1)}¢</span>
            </div>
            <div>
              <span className="text-muted-foreground">Cost Basis:</span>
              <span className="ml-2 font-mono">${position.costBasis.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Current Value:</span>
              <span className="ml-2 font-mono">${position.totalValue.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UserPositionsPanel({ 
  marketId, 
  positions = [], 
  loading = false,
  onSell,
  onMerge
}: UserPositionsPanelProps) {
  const summary = useMemo(() => {
    if (!positions.length) {
      return {
        totalShares: 0,
        totalValue: 0,
        totalCost: 0,
        totalPnL: 0,
        yesShares: 0,
        noShares: 0,
      };
    }

    return positions.reduce(
      (acc, pos) => ({
        totalShares: acc.totalShares + pos.shares,
        totalValue: acc.totalValue + pos.totalValue,
        totalCost: acc.totalCost + pos.costBasis,
        totalPnL: acc.totalPnL + pos.profitLoss,
        yesShares: acc.yesShares + (pos.outcome === 'yes' ? pos.shares : 0),
        noShares: acc.noShares + (pos.outcome === 'no' ? pos.shares : 0),
      }),
      {
        totalShares: 0,
        totalValue: 0,
        totalCost: 0,
        totalPnL: 0,
        yesShares: 0,
        noShares: 0,
      }
    );
  }, [positions]);

  const canMerge = summary.yesShares > 0 && summary.noShares > 0;
  const mergeableShares = Math.min(summary.yesShares, summary.noShares);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <LoadingSpinner text="Loading positions..." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Your Positions</CardTitle>
          {canMerge && onMerge && (
            <Button
              variant="outline"
              size="sm"
              onClick={onMerge}
              className="text-xs"
            >
              <Share className="size-3 mr-1" />
              Merge {mergeableShares} pairs
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {positions.length === 0 ? (
          <div className="text-center py-8">
            <div className="flex justify-center mb-3">
              <div className="rounded-full bg-muted p-3">
                <AlertCircle className="size-6 text-muted-foreground" />
              </div>
            </div>
            <p className="text-sm font-medium">No positions yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Place an order to start trading
            </p>
          </div>
        ) : (
          <>
            {/* Summary Card */}
            <div className="p-4 bg-muted/30 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Total Shares</p>
                  <p className="font-semibold">{summary.totalShares.toLocaleString()}</p>
                  <div className="flex gap-2 mt-1 text-xs">
                    <span className="text-green-600">
                      <TrendingUp className="inline size-3" /> {summary.yesShares}
                    </span>
                    <span className="text-red-600">
                      <TrendingDown className="inline size-3" /> {summary.noShares}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total Value</p>
                  <p className="font-semibold">${summary.totalValue.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cost: ${summary.totalCost.toFixed(2)}
                  </p>
                </div>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total P&L</span>
                <span
                  className={cn(
                    'text-lg font-bold',
                    summary.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
                  )}
                >
                  {summary.totalPnL >= 0 ? '+' : ''}${Math.abs(summary.totalPnL).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Position List */}
            <div className="space-y-2">
              {positions.map((position) => (
                <PositionRow
                  key={position.id}
                  position={position}
                  onSell={onSell}
                />
              ))}
            </div>

            {/* Merge Info */}
            {canMerge && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md text-xs text-blue-800 dark:text-blue-200">
                <div className="flex items-start gap-2">
                  <Share className="size-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">You can merge positions!</p>
                    <p className="mt-1">
                      Merge {mergeableShares} pairs of YES/NO shares to get ${mergeableShares.toFixed(2)} USDC back.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
