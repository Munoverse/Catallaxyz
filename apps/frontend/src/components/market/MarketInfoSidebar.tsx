'use client';

import { Market } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { UserProfileLink } from '@/components/UserProfileLink';

interface MarketInfoSidebarProps {
  market: Market;
  outcomeSymbols?: {
    yes: string;
    no: string;
  };
}

export default function MarketInfoSidebar({ market, outcomeSymbols }: MarketInfoSidebarProps) {
  const createdDate = new Date(market.created_at);
  const yesSymbol = outcomeSymbols?.yes || 'YES';
  const noSymbol = outcomeSymbols?.no || 'NO';
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Market Info</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Market Type */}
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-sm text-muted-foreground">Type</span>
            <span className="text-sm font-medium">Binary ({yesSymbol}/{noSymbol})</span>
          </div>

          {/* Status */}
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-sm text-muted-foreground">Status</span>
            <span className={`text-sm font-medium capitalize px-2 py-1 rounded ${
              market.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
              market.status === 'settled' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
              market.status === 'terminated' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
              market.status === 'paused' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
              'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}>
              {market.status}
            </span>
          </div>

          {/* Created */}
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-sm text-muted-foreground">Created</span>
            <span className="text-sm font-medium" title={createdDate.toLocaleString()}>
              {formatDistanceToNow(createdDate, { addSuffix: true })}
            </span>
          </div>

          {/* Total Volume */}
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-sm text-muted-foreground">Volume</span>
            <span className="text-sm font-medium">
              ${market.total_volume?.toLocaleString() || '0'}
            </span>
          </div>

          {/* Settlements */}
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-sm text-muted-foreground">Settlements</span>
            <span className="text-sm font-medium">
              {market.settlement_count}
              {market.max_settlements && ` / ${market.max_settlements}`}
            </span>
          </div>

          {/* Liquidity */}
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-sm text-muted-foreground">Liquidity</span>
            <span className="text-sm font-medium">
              ${market.total_liquidity?.toLocaleString() || '0'}
            </span>
          </div>

          {/* Trader Count */}
          {market.unique_traders && (
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-muted-foreground">Traders</span>
              <span className="text-sm font-medium">
                {market.unique_traders.toLocaleString()}
              </span>
            </div>
          )}

          {/* Creator */}
          <div className="flex justify-between items-start py-2">
            <span className="text-sm text-muted-foreground">Creator</span>
            <UserProfileLink 
              walletAddress={market.creator_wallet}
              className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded max-w-[150px] truncate hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" 
              title={market.creator_wallet}
            >
              {market.creator_wallet?.slice(0, 4)}...{market.creator_wallet?.slice(-4)}
            </UserProfileLink>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
