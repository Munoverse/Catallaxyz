'use client';

import { memo } from 'react';
import { 
  formatUsdc, 
  formatStatus, 
  toNumber, 
  formatDateTime, 
  formatPrice, 
  formatProbability,
  MarketAccount 
} from '../../lib/utils';

type MarketInfoProps = {
  market: MarketAccount | null;
  question?: string | null;
};

// AUDIT FIX v1.1.2: Add React.memo for performance optimization
function MarketInfoComponent({ market, question }: MarketInfoProps) {
  if (!market) return null;

  const statusValue = Number(market.status);
  const statusLabel = formatStatus(statusValue);
  const terminationEnabled = Boolean(market.randomTerminationEnabled);
  const canRedeem = Boolean(market.canRedeem);
  const terminationProbability = toNumber(market.terminationProbability);
  const terminationPercent = formatProbability(terminationProbability);

  return (
    <>
      {question && (
        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {question}
        </div>
      )}
      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Status</div>
            <div className="font-semibold">
              {statusLabel}
              {market.isPaused && <span className="ml-2 text-xs text-red-600">Paused</span>}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Creator</div>
            <div className="font-mono text-xs">{market.creator?.toString?.()}</div>
          </div>
          <div>
            <div className="text-gray-500">Created</div>
            <div>{formatDateTime(toNumber(market.createdAt))}</div>
          </div>
          <div>
            <div className="text-gray-500">Trades</div>
            <div>{toNumber(market.totalTrades) ?? 0}</div>
          </div>
          <div>
            <div className="text-gray-500">Collateral</div>
            <div>{formatUsdc(toNumber(market.totalPositionCollateral))}</div>
          </div>
          <div>
            <div className="text-gray-500">Redeemable</div>
            <div>{formatUsdc(toNumber(market.totalRedeemableUsdc))}</div>
          </div>
          <div>
            <div className="text-gray-500">Last activity</div>
            <div>{formatDateTime(toNumber(market.lastActivityTs))}</div>
          </div>
          <div>
            <div className="text-gray-500">Random termination</div>
            <div>{terminationEnabled ? 'Enabled' : 'Disabled'}</div>
          </div>
          <div>
            <div className="text-gray-500">Termination probability</div>
            <div>{terminationEnabled ? terminationPercent : '—'}</div>
          </div>
          <div>
            <div className="text-gray-500">Last YES/NO price</div>
            <div>
              {formatPrice(toNumber(market.lastTradeYesPrice))} /{' '}
              {formatPrice(toNumber(market.lastTradeNoPrice))}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Final YES/NO price</div>
            <div>
              {canRedeem
                ? `${formatPrice(toNumber(market.finalYesPrice))} / ${formatPrice(toNumber(market.finalNoPrice))}`
                : '—'}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// AUDIT FIX v1.1.2: Export memoized component
const MarketInfo = memo(MarketInfoComponent);
export default MarketInfo;
