'use client';

import { useCallback, memo } from 'react';
import { useClobOrderbook } from '@/hooks/useClobOrderbook';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import LoadingSpinner from '@/components/LoadingSpinner';
// AUDIT FIX F-C3: Use shared orderbook filter hook to eliminate code duplication
import { useOrderbookFilters, type OrderbookRow } from '@/hooks/useOrderbookFilters';

interface OrderbookViewProps {
  marketId: string;
  outcomeIndex: number;
  onPriceClick?: (price: number) => void;
}

// AUDIT FIX F-54: Use React.memo to prevent unnecessary re-renders
const OrderbookRow = memo(function OrderbookRow({ 
  level, 
  maxTotal, 
  side,
  onClick 
}: { 
  level: { price: number; size: number; total: number }; 
  maxTotal: number; 
  side: 'bid' | 'ask';
  onClick?: () => void;
}) {
  const percentage = (level.total / maxTotal) * 100;
  const isBid = side === 'bid';
  
  return (
    <div 
      className={`relative flex justify-between items-center py-1 px-2 cursor-pointer hover:bg-muted/50 transition-colors ${
        isBid ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
      }`}
      onClick={onClick}
    >
      {/* Background bar */}
      <div 
        className={`absolute inset-0 ${
          isBid 
            ? 'bg-green-100 dark:bg-green-950/30' 
            : 'bg-red-100 dark:bg-red-950/30'
        } ${isBid ? 'left-0' : 'right-0'}`}
        style={{ width: `${percentage}%` }}
      />
      
      {/* Content */}
      <span className="relative z-10 font-mono text-sm font-medium">
        ${(level.price * 100).toFixed(1)}¢
      </span>
      <span className="relative z-10 font-mono text-sm">
        {level.size.toLocaleString()}
      </span>
      <span className="relative z-10 font-mono text-xs text-muted-foreground">
        {level.total.toLocaleString()}
      </span>
    </div>
  );
});

export default function OrderbookView({ marketId, outcomeIndex, onPriceClick }: OrderbookViewProps) {
  const outcomeType = outcomeIndex === 0 ? 'yes' : 'no';
  const { orderbook, loading } = useClobOrderbook(marketId, outcomeType);
  
  // AUDIT FIX F-C3: Use shared hook for orderbook filtering (eliminates code duplication and any types)
  const { bids, asks, maxTotal } = useOrderbookFilters(orderbook as OrderbookRow[] | null);
  
  // AUDIT FIX F-47: Use useCallback for click handlers
  const handlePriceClick = useCallback((price: number) => {
    onPriceClick?.(price);
  }, [onPriceClick]);

  if (loading && !orderbook) {
    return (
      <Card>
        <CardContent className="py-8">
          <LoadingSpinner text="Loading orderbook..." />
        </CardContent>
      </Card>
    );
  }

  if (!orderbook) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">No orderbook data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">Order Book</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Column Headers */}
        <div className="flex justify-between px-2 pb-2 text-xs text-muted-foreground font-medium border-b">
          <span>Price</span>
          <span>Size</span>
          <span>Total</span>
        </div>

        {/* Asks (Sell orders) - shown in reverse */}
        <div className="space-y-0.5 mb-2">
          {[...asks].reverse().map((ask, index) => (
            <OrderbookRow
              key={`ask-${index}`}
              level={{
                price: ask.price,
                size: Number(ask.total_amount || ask.total || 0),
                total: Number(ask.total_amount || ask.total || 0),
              }}
              maxTotal={maxTotal}
              side="ask"
              onClick={() => handlePriceClick(ask.price)}
            />
          ))}
        </div>

        {/* Spread / Mid Price */}
        <div className="py-2 px-2 bg-muted/30 rounded-lg my-2 text-center">
          <div className="text-lg font-bold">
            ${(((bids[0]?.price || 0) + (asks[0]?.price || 0)) / 2 * 100).toFixed(1)}¢
          </div>
          <div className="text-xs text-muted-foreground">
            Mid Price
          </div>
        </div>

        {/* Bids (Buy orders) */}
        <div className="space-y-0.5 mt-2">
          {bids.map((bid, index) => (
            <OrderbookRow
              key={`bid-${index}`}
              level={{
                price: bid.price,
                size: Number(bid.total_amount || bid.total || 0),
                total: Number(bid.total_amount || bid.total || 0),
              }}
              maxTotal={maxTotal}
              side="bid"
              onClick={() => handlePriceClick(bid.price)}
            />
          ))}
        </div>

        {/* Market Depth Summary */}
        <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Total Bids</p>
            <p className="font-semibold text-green-600">
              {bids.reduce((sum, b) => sum + Number(b.total_amount || b.total || 0), 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Total Asks</p>
            <p className="font-semibold text-red-600">
              {asks.reduce((sum, a) => sum + Number(a.total_amount || a.total || 0), 0).toLocaleString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
