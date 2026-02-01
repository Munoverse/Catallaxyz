/**
 * Market Termination Status Component
 * 
 * Shows random termination status and pricing info.
 * Improvement #3-4: random termination visibility.
 */

'use client';

import { AlertCircle, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { Market } from '@/types';
import { TERMINATION_PROBABILITY } from '@catallaxyz/shared';

interface MarketTerminationStatusProps {
  market: Market;
  onRedeem?: () => void;
}

export default function MarketTerminationStatus({ market, onRedeem }: MarketTerminationStatusProps) {
  const isRandomTerminationEnabled = market.random_termination_enabled ?? true;
  const terminationProbability = market.termination_probability || TERMINATION_PROBABILITY; // Default fallback
  const isTerminated = market.is_randomly_terminated || false;
  const canRedeem = market.can_redeem || false;
  const finalYesPrice = market.final_yes_price;
  const finalNoPrice = market.final_no_price;

  // Hide when random termination is disabled
  if (!isRandomTerminationEnabled) {
    return null;
  }

  // Market not terminated: show active state
  if (!isTerminated) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-blue-600 mt-0.5 animate-pulse" />
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 mb-1 flex items-center gap-2">
              Active Market - Random Termination Enabled
            </h3>
            <p className="text-sm text-blue-700 mb-2">
              This market can randomly terminate after each trade with a <strong>{(terminationProbability * 100).toFixed(2)}%</strong> probability.
              When terminated, the last trade price becomes the final settlement price.
            </p>
            <div className="bg-white/60 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Termination Probability:</span>
                <span className="font-semibold text-blue-900">{(terminationProbability * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Status:</span>
                <span className="font-semibold text-green-600">Trading Active</span>
              </div>
            </div>
            <p className="text-xs text-blue-600 mt-2">
              💡 Tip: After termination, you can redeem your outcome tokens at the final price
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Market terminated: show termination and redemption info
  return (
    <div className="space-y-4 mb-6">
      {/* Termination Alert */}
      <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-300 rounded-lg p-5 shadow-md">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-orange-600 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-xl font-bold text-orange-900 mb-2">
              Market Terminated
            </h3>
            <p className="text-sm text-orange-800 mb-3">
              This market has been randomly terminated. Trading is closed. 
              The final settlement prices have been determined based on the last trade.
            </p>
            
            {/* Final Prices */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-green-200">
                <div className="text-sm text-gray-600 mb-1">YES Final Price</div>
                <div className="text-3xl font-bold text-green-700">
                  {finalYesPrice !== undefined && finalYesPrice !== null 
                    ? `$${(finalYesPrice / 1e6).toFixed(4)}`
                    : 'N/A'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {finalYesPrice !== undefined && finalYesPrice !== null 
                    ? `${((finalYesPrice / 1e6) * 100).toFixed(2)}%`
                    : ''}
                </div>
              </div>
              
              <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-red-200">
                <div className="text-sm text-gray-600 mb-1">NO Final Price</div>
                <div className="text-3xl font-bold text-red-700">
                  {finalNoPrice !== undefined && finalNoPrice !== null 
                    ? `$${(finalNoPrice / 1e6).toFixed(4)}`
                    : 'N/A'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {finalNoPrice !== undefined && finalNoPrice !== null 
                    ? `${((finalNoPrice / 1e6) * 100).toFixed(2)}%`
                    : ''}
                </div>
              </div>
            </div>

            {/* Redemption Info */}
            {canRedeem && (
              <div className="bg-green-50 border border-green-300 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div>
                      <div className="font-semibold text-green-900">Redemption Available</div>
                      <div className="text-xs text-green-700">
                        You can now redeem your outcome tokens at the final prices
                      </div>
                    </div>
                  </div>
                  {onRedeem && (
                    <button
                      onClick={onRedeem}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors shadow-sm"
                    >
                      Redeem Now
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Redemption Examples */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Redemption Examples
        </h4>
        <div className="space-y-2 text-sm">
          {finalYesPrice !== undefined && finalYesPrice !== null && (
            <div className="flex justify-between items-center p-2 bg-green-50 rounded">
              <span className="text-gray-700">1 YES token →</span>
              <span className="font-semibold text-green-700">
                ${(finalYesPrice / 1e6).toFixed(4)} USDC
              </span>
            </div>
          )}
          {finalNoPrice !== undefined && finalNoPrice !== null && (
            <div className="flex justify-between items-center p-2 bg-red-50 rounded">
              <span className="text-gray-700">1 NO token →</span>
              <span className="font-semibold text-red-700">
                ${(finalNoPrice / 1e6).toFixed(4)} USDC
              </span>
            </div>
          )}
          {finalYesPrice !== undefined && finalNoPrice !== undefined && (
            <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
              <span className="text-gray-700">1 YES + 1 NO →</span>
              <span className="font-semibold text-blue-700">
                ${((finalYesPrice + finalNoPrice) / 1e6).toFixed(4)} USDC
              </span>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Note: You can redeem either individual outcome tokens or complete sets (YES+NO pairs)
        </p>
      </div>
    </div>
  );
}
