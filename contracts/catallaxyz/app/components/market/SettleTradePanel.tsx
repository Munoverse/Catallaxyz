'use client';

import { memo, useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';
import { OutcomeType, TradeSide } from '../../lib/utils';

// AUDIT FIX v1.2.6: Add Solana address validation
const isValidSolanaAddress = (address: string): boolean => {
  if (!address || address.length < 32 || address.length > 44) {
    return false;
  }
  // Base58 alphabet: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  if (!base58Regex.test(address)) {
    return false;
  }
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};

type SettleTradePanelProps = {
  // Form values
  tradeMaker: string;
  tradeTaker: string;
  tradeOutcome: OutcomeType;
  tradeSide: TradeSide;
  tradeSize: string;
  tradePrice: string;
  tradeError: string | null;
  
  // Callbacks
  onTradeMakerChange: (value: string) => void;
  onTradeTakerChange: (value: string) => void;
  onTradeOutcomeChange: (value: OutcomeType) => void;
  onTradeSideChange: (value: TradeSide) => void;
  onTradeSizeChange: (value: string) => void;
  onTradePriceChange: (value: string) => void;
  onSettleTrade: () => void;
  
  // State
  isSubmitting: boolean;
  authenticated: boolean;
  isActive: boolean;
};

// AUDIT FIX v1.1.3: Extract Settle Trade Panel as separate component
function SettleTradePanelComponent({
  tradeMaker,
  tradeTaker,
  tradeOutcome,
  tradeSide,
  tradeSize,
  tradePrice,
  tradeError,
  onTradeMakerChange,
  onTradeTakerChange,
  onTradeOutcomeChange,
  onTradeSideChange,
  onTradeSizeChange,
  onTradePriceChange,
  onSettleTrade,
  isSubmitting,
  authenticated,
  isActive,
}: SettleTradePanelProps) {
  // AUDIT FIX v1.2.6: Validate Solana addresses
  const makerAddressError = useMemo(() => {
    if (!tradeMaker) return null;
    return isValidSolanaAddress(tradeMaker) ? null : 'Invalid Solana address format';
  }, [tradeMaker]);

  const takerAddressError = useMemo(() => {
    if (!tradeTaker) return null;
    return isValidSolanaAddress(tradeTaker) ? null : 'Invalid Solana address format';
  }, [tradeTaker]);

  const hasAddressError = Boolean(makerAddressError || takerAddressError);

  return (
    <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 space-y-4">
      <h2 className="text-xl font-semibold">Settle Trade (CLOB)</h2>
      <p className="text-sm text-gray-600">
        Submit a signed trade settlement. Requires balances in market USDC and position accounts.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Maker address</label>
          <input
            value={tradeMaker}
            onChange={(e) => onTradeMakerChange(e.target.value)}
            placeholder="Maker public key"
            className={`w-full px-3 py-2 border rounded-lg text-sm font-mono ${
              makerAddressError ? 'border-red-500' : 'border-gray-300'
            }`}
            aria-label="Maker address"
            aria-invalid={Boolean(makerAddressError)}
          />
          {makerAddressError && (
            <p className="text-xs text-red-600">{makerAddressError}</p>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Taker address</label>
          <input
            value={tradeTaker}
            onChange={(e) => onTradeTakerChange(e.target.value)}
            placeholder="Taker public key"
            className={`w-full px-3 py-2 border rounded-lg text-sm font-mono ${
              takerAddressError ? 'border-red-500' : 'border-gray-300'
            }`}
            aria-label="Taker address"
            aria-invalid={Boolean(takerAddressError)}
          />
          {takerAddressError && (
            <p className="text-xs text-red-600">{takerAddressError}</p>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Outcome</label>
          <select
            value={tradeOutcome}
            onChange={(e) => onTradeOutcomeChange(e.target.value as OutcomeType)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            aria-label="Trade outcome"
          >
            <option value="yes">YES</option>
            <option value="no">NO</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Side</label>
          <select
            value={tradeSide}
            onChange={(e) => onTradeSideChange(e.target.value as TradeSide)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            aria-label="Trade side"
          >
            <option value="buy">BUY (taker)</option>
            <option value="sell">SELL (taker)</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Size (USDC)</label>
          <input
            value={tradeSize}
            onChange={(e) => onTradeSizeChange(e.target.value)}
            placeholder="10"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            aria-label="Trade size"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Price (0-1)</label>
          <input
            value={tradePrice}
            onChange={(e) => onTradePriceChange(e.target.value)}
            placeholder="0.5"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            aria-label="Trade price"
          />
        </div>
      </div>
      {tradeError && <div className="text-xs text-red-600">{tradeError}</div>}
      <button
        onClick={onSettleTrade}
        disabled={!authenticated || Boolean(tradeError) || hasAddressError || isSubmitting || !isActive}
        className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Submitting...' : 'Settle Trade'}
      </button>
    </div>
  );
}

// AUDIT FIX v1.1.3: Export memoized component
const SettleTradePanel = memo(SettleTradePanelComponent);
export default SettleTradePanel;
