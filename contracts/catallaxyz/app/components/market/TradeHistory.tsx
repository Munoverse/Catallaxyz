'use client';

import { memo, useState } from 'react';
import { Trade } from '../../lib/utils';
// AUDIT FIX: Use centralized formatting functions
import { formatPrice, formatAmount, formatIsoTime } from '../../lib/format';

type TradeHistoryProps = {
  trades: Trade[];
  loading?: boolean;
};

// AUDIT FIX: Add sort direction type
type SortDirection = 'ascending' | 'descending' | 'none';
type SortColumn = 'time' | 'side' | 'type' | 'price' | 'size';

/**
 * Trade history display component
 * AUDIT FIX: Wrapped with React.memo for performance optimization
 * AUDIT FIX: Added aria-sort for table accessibility
 */
function TradeHistoryComponent({ trades, loading = false }: TradeHistoryProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('time');
  const [sortDirection, setSortDirection] = useState<SortDirection>('descending');

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'ascending' ? 'descending' : 'ascending');
    } else {
      setSortColumn(column);
      setSortDirection('descending');
    }
  };

  const getAriaSort = (column: SortColumn): SortDirection => {
    return sortColumn === column ? sortDirection : 'none';
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold mb-4">Recent Trades</h2>

      {loading ? (
        <div className="text-center text-gray-500 py-8">Loading trades...</div>
      ) : trades.length === 0 ? (
        <div className="text-center text-gray-400 py-8">No trades yet</div>
      ) : (
        <div className="overflow-x-auto">
          {/* AUDIT FIX: Added aria-sort to table headers */}
          <table className="w-full text-sm" role="grid" aria-label="Recent trades">
            <thead>
              <tr className="border-b border-gray-200">
                <th 
                  scope="col" 
                  className="text-left py-2 px-2 font-medium text-gray-500 cursor-pointer hover:text-gray-700"
                  aria-sort={getAriaSort('time')}
                  onClick={() => handleSort('time')}
                >
                  Time {sortColumn === 'time' && (sortDirection === 'ascending' ? '↑' : '↓')}
                </th>
                <th 
                  scope="col" 
                  className="text-left py-2 px-2 font-medium text-gray-500 cursor-pointer hover:text-gray-700"
                  aria-sort={getAriaSort('side')}
                  onClick={() => handleSort('side')}
                >
                  Side {sortColumn === 'side' && (sortDirection === 'ascending' ? '↑' : '↓')}
                </th>
                <th 
                  scope="col" 
                  className="text-left py-2 px-2 font-medium text-gray-500 cursor-pointer hover:text-gray-700"
                  aria-sort={getAriaSort('type')}
                  onClick={() => handleSort('type')}
                >
                  Type {sortColumn === 'type' && (sortDirection === 'ascending' ? '↑' : '↓')}
                </th>
                <th 
                  scope="col" 
                  className="text-right py-2 px-2 font-medium text-gray-500 cursor-pointer hover:text-gray-700"
                  aria-sort={getAriaSort('price')}
                  onClick={() => handleSort('price')}
                >
                  Price {sortColumn === 'price' && (sortDirection === 'ascending' ? '↑' : '↓')}
                </th>
                <th 
                  scope="col" 
                  className="text-right py-2 px-2 font-medium text-gray-500 cursor-pointer hover:text-gray-700"
                  aria-sort={getAriaSort('size')}
                  onClick={() => handleSort('size')}
                >
                  Size {sortColumn === 'size' && (sortDirection === 'ascending' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 20).map((trade) => (
                <tr key={trade.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-2 text-gray-600">{formatIsoTime(trade.createdAt)}</td>
                  <td className="py-2 px-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        trade.side === 'buy'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {trade.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        trade.outcomeType === 'yes'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {trade.outcomeType.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono">{formatPrice(trade.price)}</td>
                  <td className="py-2 px-2 text-right font-mono">{formatAmount(trade.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const TradeHistory = memo(TradeHistoryComponent);
export default TradeHistory;
