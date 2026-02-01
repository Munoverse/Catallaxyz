/**
 * Dynamic Fee Calculator Component
 * 
 * Dynamic fee calculation (Improvement #11)
 * - Charge taker only
 * - Fee rate varies by distance from 50% (1%–3.15%)
 * - Maker pays no fee and receives a rebate
 */

'use client';

import { Info } from 'lucide-react';

interface DynamicFeeCalculatorProps {
  probability: number; // 0.0 to 1.0
  orderType: 'limit' | 'market';
  amount: number; // in USDC
  minFeeRate?: number; // default 0.01 (1%)
  baseFeeRate?: number; // default 0.0315 (3.15%)
}

export default function DynamicFeeCalculator({
  probability,
  orderType,
  amount,
  minFeeRate = 0.01,
  baseFeeRate = 0.0315,
}: DynamicFeeCalculatorProps) {
  // Calculate dynamic fee rate
  const calculateFeeRate = (prob: number): number => {
    // Distance from 50%
    const distanceFrom50 = Math.abs(prob - 0.5);
    
    // fee = min + (base - min) * (distance / 0.5)
    const rateRange = baseFeeRate - minFeeRate;
    const feeRate = minFeeRate + (rateRange * (distanceFrom50 / 0.5));
    
    return Math.min(feeRate, baseFeeRate);
  };

  const feeRate = orderType === 'market' ? calculateFeeRate(probability) : 0;
  const feeAmount = amount * feeRate;
  const totalCost = amount + feeAmount;
  const netAmount = amount - feeAmount;

  // Identify maker orders
  const isMaker = orderType === 'limit';

  return (
    <div className="space-y-3">
      {/* Fee Breakdown */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-600">Order Amount:</span>
          <span className="font-semibold text-gray-900">${amount.toFixed(2)}</span>
        </div>
        
        <div className="flex justify-between items-center text-sm">
          <div className="flex items-center gap-1">
            <span className="text-gray-600">Trading Fee:</span>
            {isMaker && (
              <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                FREE
              </span>
            )}
          </div>
          <span className={`font-semibold ${isMaker ? 'text-green-600' : 'text-orange-600'}`}>
            {isMaker ? '$0.00' : `$${feeAmount.toFixed(2)} (${(feeRate * 100).toFixed(2)}%)`}
          </span>
        </div>
        
        <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
          <span className="font-semibold text-gray-900">Total:</span>
          <span className="text-lg font-bold text-gray-900">
            ${totalCost.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Fee Explanation */}
      <div className="bg-blue-50 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-800 space-y-1">
            {isMaker ? (
              <>
                <p className="font-semibold">Maker Order - No Fee! 🎉</p>
                <p>
                  As a liquidity provider, you trade fee-free. Plus, you'll receive 50% of taker fees as rewards, distributed daily.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">Taker Fee: {(feeRate * 100).toFixed(2)}%</p>
                <p>
                  Fee rate adjusts based on market probability:
                </p>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li>Near 50%: Lower fee (~1%)</li>
                  <li>Far from 50%: Higher fee (up to 3.15%)</li>
                  <li>Current probability: {(probability * 100).toFixed(2)}%</li>
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Fee Simulator */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="text-xs font-semibold text-gray-700 mb-2">
          Fee Rates by Probability
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-600">@ 50% (most liquid):</span>
            <span className="font-semibold text-green-600">{(minFeeRate * 100).toFixed(2)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">@ 70% / 30%:</span>
            <span className="font-semibold text-yellow-600">{(calculateFeeRate(0.7) * 100).toFixed(2)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">@ 90% / 10%:</span>
            <span className="font-semibold text-orange-600">{(calculateFeeRate(0.9) * 100).toFixed(2)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">@ 100% / 0% (extreme):</span>
            <span className="font-semibold text-red-600">{(baseFeeRate * 100).toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {/* Maker Rewards Info */}
      {isMaker && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="text-xs text-green-800">
            <p className="font-semibold mb-1">💰 Maker Rewards Program</p>
            <p>
              As a maker, you'll earn 50% of all taker fees collected from trades that match your order. 
              Rewards are distributed daily to your wallet.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Utility function for external use
export function calculateDynamicFee(
  probability: number,
  amount: number,
  minFeeRate: number = 0.01,
  baseFeeRate: number = 0.0315
): { feeRate: number; feeAmount: number; totalCost: number } {
  const distanceFrom50 = Math.abs(probability - 0.5);
  const rateRange = baseFeeRate - minFeeRate;
  const feeRate = Math.min(minFeeRate + (rateRange * (distanceFrom50 / 0.5)), baseFeeRate);
  const feeAmount = amount * feeRate;
  const totalCost = amount + feeAmount;
  
  return { feeRate, feeAmount, totalCost };
}
