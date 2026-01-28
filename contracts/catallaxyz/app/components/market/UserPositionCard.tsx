'use client';

import { memo } from 'react';
import { formatUsdc, UserPosition } from '../../lib/utils';

type UserPositionCardProps = {
  position: UserPosition | null;
  walletUsdcBalance: number | null;
  marketUsdcBalance: number | null;
};

/**
 * User position display card
 * AUDIT FIX: Wrapped with React.memo for performance optimization
 */
function UserPositionCardComponent({
  position,
  walletUsdcBalance,
  marketUsdcBalance,
}: UserPositionCardProps) {
  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 space-y-2">
      <h2 className="text-lg font-semibold">My Position</h2>
      <div className="text-sm text-gray-700">
        YES: {formatUsdc(position?.yes)} · NO: {formatUsdc(position?.no)}
      </div>
      <div className="text-sm text-gray-700">
        Wallet USDC balance: {formatUsdc(walletUsdcBalance)}
      </div>
      <div className="text-sm text-gray-700">
        Market USDC balance: {formatUsdc(marketUsdcBalance)}
      </div>
    </div>
  );
}

const UserPositionCard = memo(UserPositionCardComponent);
export default UserPositionCard;
