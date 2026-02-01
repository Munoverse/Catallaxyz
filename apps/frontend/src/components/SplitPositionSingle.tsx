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
import { useTokenBalance } from '@/hooks/useTokenBalance';
import { usecatallaxyzProgram } from '@/hooks/useCatallaxyzProgram';
import { useUserPosition } from '@/hooks/useUserPosition';
import { splitPositionSingle } from '@/lib/contract-calls';

interface SplitPositionSingleProps {
  marketPda: string;
  yesSymbol?: string;
  noSymbol?: string;
  onSuccess?: () => void;
}

export default function SplitPositionSingle({
  marketPda,
  yesSymbol = 'YES',
  noSymbol = 'NO',
  onSuccess,
}: SplitPositionSingleProps) {
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
  const { balance: usdcBalance } = useTokenBalance(publicKey, usdcMint);

  const handleSplit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!program || !publicKey || !solana) {
      toast.error('Please connect your wallet');
      return;
    }

    const amountNum = parseFloat(amount);
    if (amountNum > (usdcBalance || 0)) {
      toast.error(`Insufficient balance. Max: ${(usdcBalance || 0).toFixed(2)}`);
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

      const signature = await splitPositionSingle(
        program,
        { publicKey, signTransaction, sendTransaction },
        connection,
        {
        marketPda: new PublicKey(marketPda),
        amount: new BN(amountNum * 1_000_000),
        usdcMint,
        }
      );

      toast.success(`Split successful! TX: ${signature.slice(0, 8)}...`);
      setAmount('');
      refreshPosition();
      onSuccess?.();
    } catch (error: any) {
      console.error('Error splitting position:', error);
      toast.error(error.message || 'Failed to split position');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-green-600">Split Position</span>
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
            Available USDC: <span className="font-mono font-semibold">{(usdcBalance || 0).toFixed(2)}</span>
          </div>
        </div>

        <div>
          <Label htmlFor="split-amount">Amount (USDC)</Label>
          <div className="flex gap-2">
            <Input
              id="split-amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="5.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setAmount((usdcBalance || 0).toFixed(2))}
              disabled={!usdcBalance}
            >
              Max
            </Button>
          </div>
        </div>

        {amount && parseFloat(amount) > 0 && (
          <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="text-sm font-semibold mb-2 text-green-800 dark:text-green-300">
              Split Preview
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono">
                {parseFloat(amount).toFixed(2)} USDC
              </span>
              <ArrowRight className="h-4 w-4 text-green-600" />
              <div className="flex flex-col text-right">
                <span className="font-mono font-bold text-green-600">
                  {parseFloat(amount).toFixed(2)} {yesSymbol}
                </span>
                <span className="font-mono font-bold text-red-600">
                  {parseFloat(amount).toFixed(2)} {noSymbol}
                </span>
              </div>
            </div>
          </div>
        )}

        <Button
          onClick={handleSplit}
          disabled={loading || !amount || parseFloat(amount) <= 0}
          className="w-full bg-green-600 hover:bg-green-700"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Split Position
        </Button>
      </CardContent>
    </Card>
  );
}
