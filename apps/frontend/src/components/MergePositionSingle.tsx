'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { getConnection } from '@/lib/solana-connection';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { usecatallaxyzProgram } from '@/hooks/useCatallaxyzProgram';
import { useUserPosition } from '@/hooks/useUserPosition';
import { mergePositionSingle } from '@/lib/contract-calls';

interface MergePositionSingleProps {
  marketPda: string;
  yesSymbol?: string;
  noSymbol?: string;
  onSuccess?: () => void;
}

export default function MergePositionSingle({
  marketPda,
  yesSymbol = 'YES',
  noSymbol = 'NO',
  onSuccess,
}: MergePositionSingleProps) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const program = usecatallaxyzProgram();
  const { publicKey, solana } = usePhantomWallet();
  const connection = getConnection();
  const { yesBalance: yesPosition, noBalance: noPosition, refresh: refreshPosition } = useUserPosition(marketPda);

  const usdcMint = new PublicKey(
    process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS ||
      'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'
  );

  const maxMergeAmount = Math.min(yesPosition, noPosition);

  const handleMerge = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!program || !publicKey || !solana) {
      toast.error('Please connect your wallet');
      return;
    }

    const amountNum = parseFloat(amount);
    if (amountNum > maxMergeAmount) {
      toast.error(`Insufficient position. Max: ${maxMergeAmount.toFixed(2)}`);
      return;
    }

    setLoading(true);
    try {
      // Create adapter functions for Phantom SDK
      const signTransaction = async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
        const signedTx = await solana.signTransaction(tx);
        return signedTx as T;
      };
      const sendTransaction = async (tx: Transaction) => {
        const { signature } = await solana.signAndSendTransaction(tx);
        return signature;
      };

      const signature = await mergePositionSingle(
        program,
        { publicKey, signTransaction, sendTransaction },
        connection,
        {
        marketPda: new PublicKey(marketPda),
        amount: new BN(amountNum * 1_000_000),
        usdcMint,
        }
      );

      toast.success(`Merge successful! TX: ${signature.slice(0, 8)}...`);
      setAmount('');
      refreshPosition();
      onSuccess?.();
    } catch (error: any) {
      console.error('Error merging position:', error);
      toast.error(error.message || 'Failed to merge position');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-blue-600">Merge Position</span>
          <span className="text-xs text-muted-foreground font-normal">(Binary Market)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-muted/50 rounded-lg">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-green-50 dark:bg-green-950/20 rounded border border-green-200">
              <div className="text-muted-foreground mb-1">{yesSymbol} Position</div>
              <div className="font-mono font-semibold">{yesPosition.toFixed(2)}</div>
            </div>
            <div className="p-2 bg-red-50 dark:bg-red-950/20 rounded border border-red-200">
              <div className="text-muted-foreground mb-1">{noSymbol} Position</div>
              <div className="font-mono font-semibold">{noPosition.toFixed(2)}</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Max mergeable: <span className="font-mono font-semibold">{maxMergeAmount.toFixed(2)}</span>
          </div>
        </div>

        <div>
          <Label htmlFor="merge-amount">Amount (Position Sets)</Label>
          <div className="flex gap-2">
            <Input
              id="merge-amount"
              type="number"
              step="0.01"
              min="0"
              max={maxMergeAmount}
              placeholder="5.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setAmount(maxMergeAmount.toFixed(2))}
              disabled={maxMergeAmount <= 0}
            >
              Max
            </Button>
          </div>
        </div>

        {amount && parseFloat(amount) > 0 && (
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="text-sm font-semibold mb-2 text-blue-800 dark:text-blue-300">
              Merge Preview
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex flex-col gap-1">
                <span className="font-mono">
                  {parseFloat(amount).toFixed(2)} <span className="text-green-600 font-bold">{yesSymbol}</span>
                </span>
                <span className="font-mono">
                  {parseFloat(amount).toFixed(2)} <span className="text-red-600 font-bold">{noSymbol}</span>
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-blue-600" />
              <div>
                <span className="font-mono font-bold text-blue-600">
                  {parseFloat(amount).toFixed(2)} USDC
                </span>
              </div>
            </div>
          </div>
        )}

        <Button
          onClick={handleMerge}
          disabled={loading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > maxMergeAmount}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Merge Position
        </Button>
      </CardContent>
    </Card>
  );
}
