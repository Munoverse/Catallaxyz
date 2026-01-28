'use client';

import { memo } from 'react';
import { OrderbookEntry, Order, Trade, OutcomeType, TradeSide } from '../../lib/utils';
// AUDIT FIX v1.2.6: Use centralized formatting functions
// AUDIT FIX v2.1: Add missing formatUsdc import (CRIT-7)
import { formatPrice, formatAmount, formatUsdc } from '../../lib/format';

type OrderbookPanelProps = {
  // Orderbook data
  buys: OrderbookEntry[];
  sells: OrderbookEntry[];
  openOrders: Order[];
  recentTrades: Trade[];
  
  // Order form
  orderOutcome: OutcomeType;
  orderSide: TradeSide;
  orderPrice: string;
  orderSize: string;
  orderError: string | null;
  orderStatus: string | null;
  
  // Callbacks
  onOrderOutcomeChange: (value: OutcomeType) => void;
  onOrderSideChange: (value: TradeSide) => void;
  onOrderPriceChange: (value: string) => void;
  onOrderSizeChange: (value: string) => void;
  onPlaceOrder: () => void;
  onCancelOrder: (orderId: string) => void;
  
  // State
  isSubmitting: boolean;
  authenticated: boolean;
  isActive: boolean;
};

// AUDIT FIX v1.1.3: Extract Orderbook Panel as separate component
function OrderbookPanelComponent({
  buys,
  sells,
  openOrders,
  recentTrades,
  orderOutcome,
  orderSide,
  orderPrice,
  orderSize,
  orderError,
  orderStatus,
  onOrderOutcomeChange,
  onOrderSideChange,
  onOrderPriceChange,
  onOrderSizeChange,
  onPlaceOrder,
  onCancelOrder,
  isSubmitting,
  authenticated,
  isActive,
}: OrderbookPanelProps) {
  return (
    <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Orderbook (CLOB)</h2>
        <select
          value={orderOutcome}
          onChange={(e) => onOrderOutcomeChange(e.target.value as OutcomeType)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          aria-label="Select outcome type"
        >
          <option value="yes">YES</option>
          <option value="no">NO</option>
        </select>
      </div>
      
      {/* Bids and Asks */}
      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <div className="rounded-lg border border-gray-200">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
            Bids
          </div>
          {buys.length === 0 && (
            <div className="px-3 py-3 text-gray-500 text-sm">No bids.</div>
          )}
          {buys.slice(0, 10).map((order) => (
            <div key={order.id} className="px-3 py-2 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-green-700">{formatPrice(order.price)}</span>
                <span>{formatAmount(order.remaining)}</span>
              </div>
              <div className="text-xs text-gray-400 truncate">{order.maker}</div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-gray-200">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
            Asks
          </div>
          {sells.length === 0 && (
            <div className="px-3 py-3 text-gray-500 text-sm">No asks.</div>
          )}
          {sells.slice(0, 10).map((order) => (
            <div key={order.id} className="px-3 py-2 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-red-700">{formatPrice(order.price)}</span>
                <span>{formatAmount(order.remaining)}</span>
              </div>
              <div className="text-xs text-gray-400 truncate">{order.maker}</div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Order Form */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Side</label>
            <select
              value={orderSide}
              onChange={(e) => onOrderSideChange(e.target.value as TradeSide)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              aria-label="Select order side"
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Price (0-1)</label>
            <input
              value={orderPrice}
              onChange={(e) => onOrderPriceChange(e.target.value)}
              placeholder="0.5"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              aria-label="Order price"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Size (USDC)</label>
            <input
              value={orderSize}
              onChange={(e) => onOrderSizeChange(e.target.value)}
              placeholder="10"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              aria-label="Order size"
            />
          </div>
        </div>
        {orderError && <div className="text-xs text-red-600" role="alert">{orderError}</div>}
        <button
          onClick={onPlaceOrder}
          disabled={!authenticated || Boolean(orderError) || isSubmitting || !isActive}
          className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Submitting...' : 'Place Order'}
        </button>
        {/* AUDIT FIX v1.2.2: Add aria-live for dynamic status updates */}
        <div aria-live="polite" aria-atomic="true" className="text-sm text-gray-700">
          {orderStatus}
        </div>
      </div>
      
      {/* Open Orders */}
      <div className="rounded-lg border border-gray-200">
        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
          Open Orders
        </div>
        {openOrders.length === 0 && (
          <div className="px-3 py-3 text-gray-500 text-sm">No open orders.</div>
        )}
        {openOrders.map((order) => (
          <div key={order.id} className="px-3 py-2 border-b border-gray-100 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{order.side?.toUpperCase?.() ?? '—'}</span>
              <span>{formatPrice(order.price)}</span>
              <span>{formatUsdc(order.remaining)}</span>
              <button
                onClick={() => onCancelOrder(order.id)}
                className="text-xs text-red-600 hover:text-red-800"
                aria-label={`Cancel order ${order.id}`}
              >
                Cancel
              </button>
            </div>
            <div className="text-xs text-gray-400 truncate">{order.id}</div>
          </div>
        ))}
      </div>
      
      {/* Recent Trades */}
      <div className="rounded-lg border border-gray-200">
        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
          Recent Trades
        </div>
        {recentTrades.length === 0 && (
          <div className="px-3 py-3 text-gray-500 text-sm">No trades yet.</div>
        )}
        {recentTrades.map((trade) => (
          <div key={trade.id} className="px-3 py-2 border-b border-gray-100 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{trade.side?.toUpperCase?.() ?? '—'}</span>
              <span>{formatPrice(trade.price)}</span>
              <span>{formatAmount(trade.size)}</span>
            </div>
            <div className="text-xs text-gray-400 truncate">
              {trade.maker} → {trade.taker}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// AUDIT FIX v1.1.3: Export memoized component
const OrderbookPanel = memo(OrderbookPanelComponent);
export default OrderbookPanel;
