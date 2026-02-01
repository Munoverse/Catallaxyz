/**
 * Redemption Panel Component
 * 
 * Dashboard redemption panel (Improvement #5)
 * Users can redeem outcome tokens after termination/settlement
 */

'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { usecatallaxyzProgram } from '@/hooks/useCatallaxyzProgram';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api-client';
import { buildWalletAuthHeaders } from '@/lib/wallet-auth';
import { redeemSingleOutcome } from '@/lib/contract-calls';

interface RedeemablePosition {
  marketId: string;
  marketAddress: string | null;
  marketTitle: string;
  yesTokens: number;
  noTokens: number;
  finalYesPrice: number;
  finalNoPrice: number;
  terminatedAt: string | null;
  isRandomlyTerminated: boolean;
  canRedeem: boolean;
  status: string;
  winningOutcome: 'yes' | 'no' | null;
  marketUsdcVault: string | null;
}

interface RedemptionPanelProps {
  walletAddress: string;
}

export default function RedemptionPanel({ walletAddress }: RedemptionPanelProps) {
  const [positions, setPositions] = useState<RedeemablePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const { publicKey, solana } = usePhantomWallet();
  const program = usecatallaxyzProgram();
  const { toast } = useToast();
  const usdcMint = process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS
    ? new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS)
    : null;

  useEffect(() => {
    if (walletAddress) {
      fetchRedeemablePositions();
    }
  }, [walletAddress]);

  const fetchRedeemablePositions = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/markets/redeemable?wallet=${walletAddress}`);
      const data = await response.json();
      setPositions(data?.data || []);
    } catch (error) {
      console.error('Error fetching redeemable positions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = async (position: RedeemablePosition, redeemType: 'yes' | 'no' | 'both') => {
    try {
      setRedeeming(`${position.marketId}-${redeemType}`);

      if (!program || !publicKey || !solana) {
        throw new Error('Not logged in');
      }
      if (!position.marketAddress) {
        throw new Error('Market address missing');
      }
      if (!usdcMint) {
        throw new Error('USDC mint not configured');
      }

      // Create adapter functions for Phantom SDK
      const signTransaction = async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
        const signedTx = await solana.signTransaction(tx);
        return signedTx as T;
      };
      const sendTransaction = async (tx: Transaction) => {
        const { signature } = await solana.signAndSendTransaction(tx);
        return signature;
      };
      const signMessage = async (message: Uint8Array) => {
        const { signature } = await solana.signMessage(message);
        return signature;
      };

      const marketPda = new PublicKey(position.marketAddress);
      const [userPositionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('user_position'), marketPda.toBuffer(), publicKey.toBuffer()],
        program.programId
      );

      const recordRedemption = async (payload: {
        redemptionType: 'single_outcome' | 'merge';
        yesTokensBurned: string;
        noTokensBurned: string;
        usdcRedeemed: string;
        transactionSignature: string | null;
      }) => {
        const walletHeaders = await buildWalletAuthHeaders({
          walletAddress,
          signMessage,
        });
        await apiFetch('/api/redemptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...walletHeaders },
          body: JSON.stringify({
            walletAddress,
            marketId: position.marketId,
            redemptionType: payload.redemptionType,
            yesTokensBurned: payload.yesTokensBurned,
            noTokensBurned: payload.noTokensBurned,
            usdcRedeemed: payload.usdcRedeemed,
            yesPrice: position.finalYesPrice,
            noPrice: position.finalNoPrice,
            transactionSignature: payload.transactionSignature,
          }),
        });
      };

      const handleOutcomeRedeem = async (outcomeType: 'yes' | 'no', tokenUiAmount: number) => {
        if (tokenUiAmount <= 0) return;
        const userUsdcAccount = await getAssociatedTokenAddress(usdcMint, publicKey);
        const [marketVault] = PublicKey.findProgramAddressSync(
          [Buffer.from('market_vault'), marketPda.toBuffer()],
          program.programId
        );
        const tokenAmount = new BN(Math.floor(tokenUiAmount * 1e6));
        if (tokenAmount.lte(new BN(0))) {
          return;
        }

        const signature = await redeemSingleOutcome(
          program,
          { publicKey, signTransaction, sendTransaction },
          program.provider.connection,
          {
            marketPda,
            userPositionPda,
            marketVault,
            userUsdcAccount,
            usdcMint,
            outcomeType: outcomeType === 'yes' ? 0 : 1,
            tokenAmount,
          }
        );

        const usdcRedeemed = Math.floor(
          tokenUiAmount * (outcomeType === 'yes' ? position.finalYesPrice : position.finalNoPrice) * 1e6
        );

        await recordRedemption({
          redemptionType: 'single_outcome',
          yesTokensBurned: outcomeType === 'yes' ? tokenAmount.toString() : '0',
          noTokensBurned: outcomeType === 'no' ? tokenAmount.toString() : '0',
          usdcRedeemed: usdcRedeemed.toString(),
          transactionSignature: signature,
        });
      };

      if (redeemType === 'yes' || redeemType === 'both') {
        if (position.yesTokens > 0) {
          await handleOutcomeRedeem('yes', position.yesTokens);
        }
      }
      if (redeemType === 'no' || redeemType === 'both') {
        if (position.noTokens > 0) {
          await handleOutcomeRedeem('no', position.noTokens);
        }
      }

      toast({
        title: 'Redemption complete',
        description: 'Your positions have been redeemed.',
      });

      await fetchRedeemablePositions();
    } catch (error) {
      console.error('Error redeeming:', error);
      toast({
        title: 'Redemption failed',
        description: (error as Error).message || 'Failed to redeem positions',
        variant: 'destructive',
      });
    } finally {
      setRedeeming(null);
    }
  };

  const formatUSDC = (amount: number) => {
    return amount.toFixed(4);
  };

  const calculateRedemptionValue = (position: RedeemablePosition, type: 'yes' | 'no' | 'both') => {
    if (type === 'yes') {
      return position.yesTokens * position.finalYesPrice;
    }
    if (type === 'no') {
      return position.noTokens * position.finalNoPrice;
    }
    return position.yesTokens * position.finalYesPrice + position.noTokens * position.finalNoPrice;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <span className="ml-3 text-gray-600">Loading redeemable positions...</span>
        </div>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="text-center py-8">
          <CheckCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pending Redemptions</h3>
          <p className="text-gray-600">
            You don't have any positions in terminated markets that can be redeemed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 text-white">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <TrendingUp className="w-6 h-6" />
          Redemption Center
        </h2>
        <p className="text-green-100">
          {positions.length} market{positions.length > 1 ? 's' : ''} available for redemption
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border-b border-blue-200 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">How redemption works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>All settled or terminated markets redeem YES/NO at final prices</li>
              <li>Redemptions are on-chain and require wallet approval</li>
              <li>No platform fees - you only pay gas</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Positions List */}
      <div className="p-6 space-y-4">
        {positions.map((position) => {
          const totalValue = calculateRedemptionValue(position, 'both');
          const isRedeeming = redeeming?.startsWith(position.marketId);
          
          return (
            <div key={`${position.marketId}`} className="border rounded-lg p-5 hover:border-blue-300 transition-colors">
              {/* Market Info */}
              <div className="mb-4">
                <Link
                  href={`/markets/${position.marketId}`}
                  className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                >
                  {position.marketTitle}
                </Link>
                {position.terminatedAt && (
                  <p className="text-xs text-gray-500 mt-1">
                    Terminated {new Date(position.terminatedAt).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Holdings */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="text-xs text-gray-600 mb-1">YES Position</div>
                  <div className="text-xl font-bold text-green-700">
                    {position.yesTokens.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    @ ${position.finalYesPrice.toFixed(4)}
                  </div>
                </div>
                
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="text-xs text-gray-600 mb-1">NO Position</div>
                  <div className="text-xl font-bold text-red-700">
                    {position.noTokens.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    @ ${position.finalNoPrice.toFixed(4)}
                  </div>
                </div>
              </div>

              {/* Estimated Value */}
              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Estimated Total Value:</span>
                  <span className="text-xl font-bold text-gray-900">
                    ${formatUSDC(totalValue)}
                  </span>
                </div>
              </div>

              {/* Redemption Options */}
              <div className="grid grid-cols-3 gap-2">
                {position.yesTokens > 0 && (
                  <button
                    onClick={() => handleRedeem(position, 'yes')}
                    disabled={isRedeeming}
                    className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {redeeming === `${position.marketId}-yes` ? (
                      <Loader2 className="w-4 h-4 mx-auto animate-spin" />
                    ) : (
                      'Redeem YES'
                    )}
                  </button>
                )}
                
                {position.noTokens > 0 && (
                  <button
                    onClick={() => handleRedeem(position, 'no')}
                    disabled={isRedeeming}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {redeeming === `${position.marketId}-no` ? (
                      <Loader2 className="w-4 h-4 mx-auto animate-spin" />
                    ) : (
                      'Redeem NO'
                    )}
                  </button>
                )}
                
                {position.yesTokens > 0 && position.noTokens > 0 && (
                  <button
                    onClick={() => handleRedeem(position, 'both')}
                    disabled={isRedeeming}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {redeeming === `${position.marketId}-both` ? (
                      <Loader2 className="w-4 h-4 mx-auto animate-spin" />
                    ) : (
                      'Redeem All'
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
