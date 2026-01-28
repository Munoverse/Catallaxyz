'use client';

import { memo } from 'react';
import { AmountInput, ActionButton } from '../ui';

type BalanceManagementProps = {
  depositAmount: string;
  withdrawAmount: string;
  onDepositAmountChange: (value: string) => void;
  onWithdrawAmountChange: (value: string) => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  depositError: string | null;
  withdrawError: string | null;
  isSubmitting: boolean;
  authenticated: boolean;
  isActive: boolean;
};

// AUDIT FIX v1.1.2: Add React.memo for performance optimization
function BalanceManagementComponent({
  depositAmount,
  withdrawAmount,
  onDepositAmountChange,
  onWithdrawAmountChange,
  onDeposit,
  onWithdraw,
  depositError,
  withdrawError,
  isSubmitting,
  authenticated,
  isActive,
}: BalanceManagementProps) {
  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 space-y-4">
      <h2 className="text-xl font-semibold">Balance Management</h2>
      <p className="text-sm text-gray-600">
        Deposit USDC into the market balance for trading or withdraw to your wallet.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <AmountInput
            label="Deposit amount (USDC)"
            value={depositAmount}
            onChange={onDepositAmountChange}
            placeholder="25"
            error={depositError}
          />
          <ActionButton
            onClick={onDeposit}
            disabled={!authenticated || Boolean(depositError) || !isActive}
            loading={isSubmitting}
            variant="success"
          >
            Deposit
          </ActionButton>
        </div>
        <div className="space-y-2">
          <AmountInput
            label="Withdraw amount (USDC)"
            value={withdrawAmount}
            onChange={onWithdrawAmountChange}
            placeholder="10"
            error={withdrawError}
          />
          <ActionButton
            onClick={onWithdraw}
            disabled={!authenticated || Boolean(withdrawError)}
            loading={isSubmitting}
            variant="secondary"
          >
            Withdraw
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

// AUDIT FIX v1.1.2: Export memoized component
const BalanceManagement = memo(BalanceManagementComponent);
export default BalanceManagement;
