'use client';

import { memo } from 'react';
import { AmountInput, ActionButton } from '../ui';

type RedeemPanelProps = {
  redeemAmount: string;
  redeemOutcome: 'yes' | 'no';
  onRedeemAmountChange: (value: string) => void;
  onRedeemOutcomeChange: (value: 'yes' | 'no') => void;
  onRedeem: () => void;
  redeemError: string | null;
  isSubmitting: boolean;
  authenticated: boolean;
  canRedeem: boolean;
};

// AUDIT FIX v1.1.2: Add React.memo for performance optimization
function RedeemPanelComponent({
  redeemAmount,
  redeemOutcome,
  onRedeemAmountChange,
  onRedeemOutcomeChange,
  onRedeem,
  redeemError,
  isSubmitting,
  authenticated,
  canRedeem,
}: RedeemPanelProps) {
  return (
    <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 space-y-4">
      <h2 className="text-xl font-semibold">Redeem</h2>
      <p className="text-sm text-gray-600">
        Redeem YES/NO positions after settlement or termination.
      </p>

      {!canRedeem && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
          Redemption is not available until the market is settled or terminated.
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Outcome</label>
          <select
            value={redeemOutcome}
            onChange={(e) => onRedeemOutcomeChange(e.target.value as 'yes' | 'no')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="yes">YES</option>
            <option value="no">NO</option>
          </select>
        </div>
        <AmountInput
          label="Amount (USDC)"
          value={redeemAmount}
          onChange={onRedeemAmountChange}
          placeholder="5"
          error={redeemError}
        />
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Action</label>
          <ActionButton
            onClick={onRedeem}
            disabled={!authenticated || Boolean(redeemError)}
            loading={isSubmitting}
            variant="indigo"
          >
            Redeem
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

// AUDIT FIX v1.1.2: Export memoized component
const RedeemPanel = memo(RedeemPanelComponent);
export default RedeemPanel;
