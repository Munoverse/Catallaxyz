'use client';

import { memo } from 'react';

type TradingPanelProps = {
  splitAmount: string;
  mergeAmount: string;
  onSplitAmountChange: (value: string) => void;
  onMergeAmountChange: (value: string) => void;
  onSplit: () => void;
  onMerge: () => void;
  splitError: string | null;
  mergeError: string | null;
  txStatus: string | null;
  isSubmitting: boolean;
  authenticated: boolean;
  isActive: boolean;
  terminationEnabled: boolean;
  checkTermination: boolean;
  onCheckTerminationChange: (value: boolean) => void;
  onLogin: () => void;
  loginError: string | null;
};

// AUDIT FIX v1.1.3: Extract Trading Panel as separate component
function TradingPanelComponent({
  splitAmount,
  mergeAmount,
  onSplitAmountChange,
  onMergeAmountChange,
  onSplit,
  onMerge,
  splitError,
  mergeError,
  txStatus,
  isSubmitting,
  authenticated,
  isActive,
  terminationEnabled,
  checkTermination,
  onCheckTerminationChange,
  onLogin,
  loginError,
}: TradingPanelProps) {
  return (
    <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 space-y-4">
      <h2 className="text-xl font-semibold">Trade (Split / Merge)</h2>
      <p className="text-sm text-gray-600">
        Split USDC into YES/NO positions or merge back to USDC. Amounts are in USDC.
      </p>
      {!isActive && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
          Trading actions are disabled because this market is not active.
        </div>
      )}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={checkTermination}
            disabled={!terminationEnabled}
            onChange={(e) => onCheckTerminationChange(e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span>
            Enable random termination check after purchases (default on). This is applied when a
            trade is settled; you can opt out to avoid the VRF check.
          </span>
        </label>
        {!terminationEnabled && (
          <div className="mt-2 text-xs text-gray-500">
            Random termination is disabled for this market.
          </div>
        )}
      </div>
      {!authenticated && (
        <button
          onClick={onLogin}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg font-semibold hover:bg-black transition"
        >
          Continue with Google
        </button>
      )}
      {loginError && <div className="text-sm text-red-600">{loginError}</div>}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Split amount (USDC)</label>
          <input
            value={splitAmount}
            onChange={(e) => onSplitAmountChange(e.target.value)}
            placeholder="10.5"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          {splitError && <div className="text-xs text-red-600">{splitError}</div>}
          <button
            onClick={onSplit}
            disabled={!authenticated || Boolean(splitError) || isSubmitting || !isActive}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting...' : 'Split'}
          </button>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Merge amount (USDC)</label>
          <input
            value={mergeAmount}
            onChange={(e) => onMergeAmountChange(e.target.value)}
            placeholder="5"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          {mergeError && <div className="text-xs text-red-600">{mergeError}</div>}
          <button
            onClick={onMerge}
            disabled={!authenticated || Boolean(mergeError) || isSubmitting || !isActive}
            className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting...' : 'Merge'}
          </button>
        </div>
      </div>
      {/* AUDIT FIX v1.2.2: Add aria-live for dynamic status updates */}
      <div aria-live="polite" aria-atomic="true" className="text-sm text-gray-700">
        {txStatus}
      </div>
    </div>
  );
}

// AUDIT FIX v1.1.3: Export memoized component
const TradingPanel = memo(TradingPanelComponent);
export default TradingPanel;
