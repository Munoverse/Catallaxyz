'use client';

import { memo } from 'react';
import { OrderbookEntry } from '../../lib/utils';
// AUDIT FIX: Use centralized formatting functions
import { formatPrice, formatAmount } from '../../lib/format';

type OrderbookDisplayProps = {
  buys: OrderbookEntry[];
  sells: OrderbookEntry[];
  outcome: 'yes' | 'no';
  onOutcomeChange: (outcome: 'yes' | 'no') => void;
  loading?: boolean;
};

/**
 * Orderbook display component showing buy/sell sides
 * AUDIT FIX: Wrapped with React.memo for performance optimization
 */
function OrderbookDisplayComponent({
  buys,
  sells,
  outcome,
  onOutcomeChange,
  loading = false,
}: OrderbookDisplayProps) {

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Orderbook</h2>
        <div className="flex gap-2" role="tablist" aria-label="Outcome selection">
          <button
            role="tab"
            aria-selected={outcome === 'yes'}
            onClick={() => onOutcomeChange('yes')}
            className={`px-3 py-1 rounded text-sm font-medium transition ${
              outcome === 'yes'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            YES
          </button>
          <button
            role="tab"
            aria-selected={outcome === 'no'}
            onClick={() => onOutcomeChange('no')}
            className={`px-3 py-1 rounded text-sm font-medium transition ${
              outcome === 'no'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            NO
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-8">Loading orderbook...</div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {/* Bids (Buy orders) */}
          <div>
            <h3 className="text-sm font-medium text-green-600 mb-2">Bids</h3>
            <div className="space-y-1">
              {buys.length === 0 ? (
                <div className="text-sm text-gray-400">No bids</div>
              ) : (
                // AUDIT FIX: Use price as key instead of array index
                buys.slice(0, 10).map((entry) => (
                  <div
                    key={`bid-${entry.price}`}
                    className="flex justify-between text-sm bg-green-50 px-2 py-1 rounded"
                  >
                    <span className="text-green-700">{formatPrice(entry.price)}</span>
                    <span className="text-gray-600">{formatAmount(entry.size)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Asks (Sell orders) */}
          <div>
            <h3 className="text-sm font-medium text-red-600 mb-2">Asks</h3>
            <div className="space-y-1">
              {sells.length === 0 ? (
                <div className="text-sm text-gray-400">No asks</div>
              ) : (
                // AUDIT FIX: Use price as key instead of array index
                sells.slice(0, 10).map((entry) => (
                  <div
                    key={`ask-${entry.price}`}
                    className="flex justify-between text-sm bg-red-50 px-2 py-1 rounded"
                  >
                    <span className="text-red-700">{formatPrice(entry.price)}</span>
                    <span className="text-gray-600">{formatAmount(entry.size)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// AUDIT FIX: Export memoized component for performance optimization
const OrderbookDisplay = memo(OrderbookDisplayComponent);
export default OrderbookDisplay;
