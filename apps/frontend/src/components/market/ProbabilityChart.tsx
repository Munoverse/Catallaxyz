'use client';

import { useEffect, useState } from 'react';
import { useClobOrderbook } from '@/hooks/useClobOrderbook';
import { formatProbability, formatPriceCents } from '@catallaxyz/shared';
// AUDIT FIX F-C3: Use shared orderbook filter hook to eliminate code duplication
import { useOrderbookFilters, type OrderbookRow } from '@/hooks/useOrderbookFilters';

interface ProbabilityChartProps {
  marketId: string;
  currentYesPrice?: number;
  currentNoPrice?: number;
  yesSymbol?: string;
  noSymbol?: string;
}

export default function ProbabilityChart({ 
  marketId, 
  currentYesPrice = 0.5,
  currentNoPrice = 0.5,
  yesSymbol = 'YES',
  noSymbol = 'NO'
}: ProbabilityChartProps) {
  const { orderbook } = useClobOrderbook(marketId, 'yes');
  const [probability, setProbability] = useState(currentYesPrice);
  
  // AUDIT FIX F-C3: Use shared hook for orderbook filtering (eliminates code duplication and any types)
  const { bids, asks, midPrice } = useOrderbookFilters(orderbook as OrderbookRow[] | null);

  useEffect(() => {
    if (midPrice !== null) {
      setProbability(midPrice);
    } else if (currentYesPrice) {
      setProbability(currentYesPrice);
    }
  }, [midPrice, currentYesPrice]);

  const yesProb = probability;
  const noProb = 1 - probability;

  return (
    <div className="space-y-6">
      {/* Binary Market Probability Display */}
      <div className="space-y-4">
        {/* YES Outcome */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-green-600">{yesSymbol}</span>
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold text-green-600">
                {formatProbability(yesProb)}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatPriceCents(yesProb)}
              </span>
            </div>
          </div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-600 transition-all duration-500 ease-out flex items-center justify-end pr-2"
              style={{ width: `${yesProb * 100}%` }}
            >
              {yesProb > 0.15 && (
                <span className="text-[10px] text-white font-semibold">
                  {formatProbability(yesProb)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* NO Outcome */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-red-600">{noSymbol}</span>
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold text-red-600">
                {formatProbability(noProb)}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatPriceCents(noProb)}
              </span>
            </div>
          </div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-600 transition-all duration-500 ease-out flex items-center justify-end pr-2"
              style={{ width: `${noProb * 100}%` }}
            >
              {noProb > 0.15 && (
                <span className="text-[10px] text-white font-semibold">
                  {formatProbability(noProb)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Orderbook Info - AUDIT FIX F-C3: Use computed values from shared hook */}
      {orderbook && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          {(() => {
            const bestBid = bids[0]?.price ?? null;
            const bestAsk = asks[0]?.price ?? null;
            const spread = bestBid && bestAsk ? bestAsk - bestBid : null;
            return (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground mb-1">Best Bid</div>
              <div className="font-mono font-semibold">
                {bestBid 
                  ? `$${bestBid.toFixed(3)}`
                  : 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Best Ask</div>
              <div className="font-mono font-semibold">
                {bestAsk 
                  ? `$${bestAsk.toFixed(3)}`
                  : 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Spread</div>
              <div className="font-mono font-semibold">
                {spread !== null
                  ? `${(spread * 100).toFixed(2)}%`
                  : 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Mid Price</div>
              <div className="font-mono font-semibold">
                {midPrice 
                  ? `$${midPrice.toFixed(3)}`
                  : 'N/A'}
              </div>
            </div>
          </div>
            )
          })()}
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-muted-foreground p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md">
        <p className="font-semibold mb-1">📊 How to read:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Probability represents market consensus on outcome likelihood</li>
          <li>Based on mid-price from orderbook (or last trade)</li>
          <li>{yesSymbol} + {noSymbol} probabilities always equal 100%</li>
          <li>Higher probability = market believes outcome is more likely</li>
        </ul>
      </div>
    </div>
  );
}
