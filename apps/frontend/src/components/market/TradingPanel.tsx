'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { getConnection } from '@/lib/solana-connection';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useTokenBalance } from '@/hooks/useTokenBalance';
import { useClobOrderbook } from '@/hooks/useClobOrderbook';
import { usecatallaxyzProgram } from '@/hooks/useCatallaxyzProgram';
// AUDIT FIX F-C3: Use shared orderbook filter hook to eliminate code duplication
import { useOrderbookFilters, type OrderbookRow } from '@/hooks/useOrderbookFilters';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import MarketTerminatedDialog from '@/components/MarketTerminatedDialog';
import { AuthDialog } from '@/components/AuthDialog';
import { settleWithRandomness } from '@/lib/contract-calls';
import type { Trade } from '@/types';
import {
  VRF_FEE_SOL, 
  TERMINATION_PROBABILITY,
  calculateTakerFeeRate,
  formatFeeRate,
  formatProbability 
} from '@catallaxyz/shared';

interface TradingPanelProps {
  marketId: string;
  marketAddress: string;
  marketTitle?: string;
  currentYesPrice?: number;
  currentNoPrice?: number;
  randomnessAccount?: string;
  latestTrade?: Trade | null;
  outcomeSymbols?: {
    yes: string;
    no: string;
  };
  onSuccess?: () => void;
}

export default function TradingPanel({ 
  marketId,
  marketAddress,
  marketTitle = 'Market',
  currentYesPrice = 0.5,
  currentNoPrice = 0.5,
  randomnessAccount,
  latestTrade,
  outcomeSymbols,
  onSuccess 
}: TradingPanelProps) {
  const { isConnected, publicKey, solana } = usePhantomWallet();
  const canTrade = isConnected && !!publicKey;
  const needsAuth = !isConnected || !publicKey;
  const { toast } = useToast();
  const program = usecatallaxyzProgram();
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [outcome, setOutcome] = useState<'yes' | 'no'>('yes'); // Binary outcome pair
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [checkTermination, setCheckTermination] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingTermination, setIsCheckingTermination] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [lastTradeInfo, setLastTradeInfo] = useState<{
    yesPrice: number;
    noPrice: number;
    slot: number;
  } | null>(null);
  
  // Market termination dialog state
  const [showTerminatedDialog, setShowTerminatedDialog] = useState(false);
  const [terminationInfo, setTerminationInfo] = useState<{
    finalYesPrice: number;
    finalNoPrice: number;
    winningOutcome: 'yes' | 'no';
    isTerminator: boolean;
  } | null>(null);

  const [terminationProbability, setTerminationProbability] = useState<number | null>(null);
  const outcomeIndex = outcome === 'yes' ? 0 : 1;
  const yesSymbol = outcomeSymbols?.yes || 'YES';
  const noSymbol = outcomeSymbols?.no || 'NO';
  const activeSymbol = outcome === 'yes' ? yesSymbol : noSymbol;
  const { orderbook, submitOrder, refreshOrderbook, loading: orderbookLoading } = useClobOrderbook(
    marketId,
    outcome === 'yes' ? 'yes' : 'no'
  );
  // AUDIT FIX F-C3: Use shared hook for orderbook filtering (eliminates code duplication and any types)
  const { bids, asks } = useOrderbookFilters(orderbook as OrderbookRow[] | null);
  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;
  const currentPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : (outcome === 'yes' ? currentYesPrice : currentNoPrice);
  const [yesPosition, setYesPosition] = useState(0);
  const [noPosition, setNoPosition] = useState(0);
  const usdcMint = useMemo(() => {
    const mint = process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS;
    return mint ? new PublicKey(mint) : null;
  }, []);

  const { balance: usdcBalance } = useTokenBalance(publicKey, usdcMint);
  
  // Auto-fill price from orderbook for limit orders
  useEffect(() => {
    if (orderType === 'limit' && orderbook && !price) {
      const bestPrice = side === 'buy' 
        ? bids[0]?.price 
        : asks[0]?.price;
      if (bestPrice) {
        setPrice(bestPrice.toString());
      }
    }
  }, [orderType, side, orderbook, bids, asks, price]);
  
  // Calculate dynamic fee rate
  // Limit orders have 0 taker fee, market orders use dynamic fee based on current price
  const takerFeeRate =
    orderType === 'limit'
      ? 0
      : calculateTakerFeeRate(currentPrice);
  
  // Calculate total cost/return
  const calculateTotal = () => {
    const amountNum = parseFloat(amount) || 0;
    const priceNum = orderType === 'limit' ? parseFloat(price) || 0 : currentPrice;
    const cost = amountNum * priceNum;
    const fee = cost * takerFeeRate;
    const vrfFee = checkTermination ? VRF_FEE_SOL : 0;
    
    if (side === 'buy') {
      return { cost, fee, total: cost + fee, vrfFee };
    } else {
      return { cost, fee, total: cost - fee, vrfFee };
    }
  };

  const { cost, fee, total, vrfFee } = calculateTotal();

  // Quick amount buttons
  const addAmount = (delta: number) => {
    const current = parseFloat(amount) || 0;
    setAmount((current + delta).toString());
  };

  const setMaxAmount = () => {
    const availableUsdc = usdcBalance || 0;
    const availableOutcome = outcome === 'yes' ? yesPosition : noPosition;
    if (side === 'buy') {
      const priceNum = orderType === 'limit' ? parseFloat(price) || currentPrice : currentPrice;
      const maxAmount = priceNum > 0 ? availableUsdc / (priceNum * (1 + takerFeeRate)) : 0;
      setAmount(maxAmount.toFixed(6));
    } else {
      setAmount(availableOutcome.toFixed(6));
    }
  };

  useEffect(() => {
    if (!program || !marketAddress) return;

    const loadMarketState = async () => {
      try {
        const marketPda = new PublicKey(marketAddress);
        const market = await program.account.market.fetch(marketPda);
        // AUDIT FIX: Use typed access - terminationProbability is now properly typed
        const rawTermination = market.terminationProbability;
        if (typeof rawTermination === 'number') {
          setTerminationProbability(rawTermination / 1_000_000);
        }
      } catch (err) {
        console.warn('Failed to load market state:', err);
      }
    };

    loadMarketState();
  }, [program, marketAddress]);

  useEffect(() => {
    if (!program || !marketAddress || !publicKey) {
      setYesPosition(0);
      setNoPosition(0);
      return;
    }

    const loadPositions = async () => {
      try {
        const marketPda = new PublicKey(marketAddress);
        const [userPositionPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('user_position'), marketPda.toBuffer(), publicKey.toBuffer()],
          program.programId
        );
        const userPosition = await program.account.userPosition.fetch(userPositionPda);
        setYesPosition(Number(userPosition.yesBalance || 0) / 1e6);
        setNoPosition(Number(userPosition.noBalance || 0) / 1e6);
      } catch (err) {
        setYesPosition(0);
        setNoPosition(0);
      }
    };

    loadPositions();
  }, [program, marketAddress, publicKey]);

  const handleSubmit = async () => {
    if (!canTrade) {
      setShowAuthDialog(true);
      return;
    }

    const amountNum = parseFloat(amount);
    const priceNum = orderType === 'limit' ? parseFloat(price) : currentPrice;

    if (!amountNum || amountNum <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Please enter a valid amount',
        variant: 'destructive',
      });
      return;
    }

    if (orderType === 'limit' && (!priceNum || priceNum <= 0 || priceNum > 1)) {
      toast({
        title: 'Invalid price',
        description: 'Price must be between 0 and 1',
        variant: 'destructive',
      });
      return;
    }

    if (checkTermination && !randomnessAccount) {
      toast({
        title: 'Randomness account missing',
        description: 'This market does not have a Switchboard randomness account configured.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await submitOrder({
        marketId,
        outcomeType: outcome === 'yes' ? 'yes' : 'no',
        side,
        orderType,
        price: priceNum,
        amount: Math.floor(amountNum * 1_000_000),
      });

      toast({
        title: orderType === 'market' ? 'Order submitted' : 'Order placed',
        description: `${side === 'buy' ? 'Buy' : 'Sell'} ${amountNum} ${activeSymbol}`,
      });

      setLastTradeInfo(null);
      await refreshOrderbook();

      // Clear form
      setAmount('');
      setPrice('');
      
      // Trigger refresh
      onSuccess?.();
    } catch (error: any) {
      console.error('Trade error:', error);
      toast({
        title: 'Trade failed',
        description: error.message || 'An error occurred while executing the trade',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualTerminationCheck = async () => {
    if (!canTrade) {
      setShowAuthDialog(true);
      return;
    }

    if (!randomnessAccount) {
      toast({
        title: 'Randomness account missing',
        description: 'This market does not have a Switchboard randomness account configured.',
        variant: 'destructive',
      });
      return;
    }

    const tradeSource = lastTradeInfo || latestTrade;
    if (!tradeSource) {
      toast({
        title: 'No trade data available',
        description: 'Place a trade first or wait for the latest trade to sync.',
        variant: 'destructive',
      });
      return;
    }

    const slot =
      'slot' in tradeSource ? tradeSource.slot : tradeSource.slot;
    const slotValue = typeof slot === 'number' ? slot : null;
    if (!slotValue || slotValue <= 0) {
      toast({
        title: 'Missing slot information',
        description: 'Latest trade slot is unavailable. Try again after a new trade.',
        variant: 'destructive',
      });
      return;
    }

    let lastTradeYesPrice = 0;
    let lastTradeNoPrice = 0;

    if ('yesPrice' in tradeSource) {
      lastTradeYesPrice = tradeSource.yesPrice;
      lastTradeNoPrice = tradeSource.noPrice;
    } else {
      const tradePrice = tradeSource.price ?? 0.5;
      if (tradeSource.outcome_type === 'yes') {
        lastTradeYesPrice = tradePrice;
        lastTradeNoPrice = 1 - tradePrice;
      } else {
        lastTradeNoPrice = tradePrice;
        lastTradeYesPrice = 1 - tradePrice;
      }
    }

    if (!program || !publicKey || !solana || !usdcMint) {
      toast({
        title: 'Wallet not ready',
        description: 'Please connect your wallet to perform this action.',
        variant: 'destructive',
      });
      return;
    }

    setIsCheckingTermination(true);
    try {
      const marketPda = new PublicKey(marketAddress);
      const randomnessPubkey = new PublicKey(randomnessAccount);

      // Convert prices to scaled format (10^6)
      const scaledYesPrice = new BN(Math.floor(lastTradeYesPrice * 1_000_000));
      const scaledNoPrice = new BN(Math.floor(lastTradeNoPrice * 1_000_000));
      // Settlement threshold scaled by 10^8 (e.g., 10% = 10_000_000)
      const settlementThreshold = new BN(Math.floor(TERMINATION_PROBABILITY * 100_000_000));

      // Create adapter functions for Phantom SDK
      const signTransaction = async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
        const signedTx = await solana.signTransaction(tx);
        return signedTx as T;
      };
      const sendTransaction = async (tx: Transaction) => {
        const { signature } = await solana.signAndSendTransaction(tx);
        return signature;
      };

      await settleWithRandomness(
        program,
        { publicKey, signTransaction, sendTransaction },
        program.provider.connection,
        {
          marketPda,
          randomnessAccount: randomnessPubkey,
          usdcMint,
          settlementThreshold,
          lastTradeYesPrice: scaledYesPrice,
          lastTradeNoPrice: scaledNoPrice,
          lastTradeSlot: new BN(slotValue),
          userOptedTerminationCheck: true,
        }
      );

      // After settlement, check if market was terminated by fetching market state
      const marketAccount = await program.account.market.fetch(marketPda);
      const wasTerminated = marketAccount.isRandomlyTerminated;

      if (wasTerminated) {
        setTerminationInfo({
          finalYesPrice: lastTradeYesPrice,
          finalNoPrice: lastTradeNoPrice,
          winningOutcome: lastTradeYesPrice > lastTradeNoPrice ? 'yes' : 'no',
          isTerminator: true,
        });
        setShowTerminatedDialog(true);
      } else {
        toast({
          title: 'Termination check complete',
          description: 'Market remains active. Try again after the next trade.',
        });
      }
    } catch (error: any) {
      console.error('Manual termination check failed:', error);
      toast({
        title: 'Termination check failed',
        description: error.message || 'Unable to run termination check',
        variant: 'destructive',
      });
    } finally {
      setIsCheckingTermination(false);
    }
  };

  return (
    <>
      {/* Market termination dialog */}
      {terminationInfo && (
        <MarketTerminatedDialog
          isOpen={showTerminatedDialog}
          onClose={() => {
            setShowTerminatedDialog(false);
            onSuccess?.(); // Refresh after closing the dialog
          }}
          marketTitle={marketTitle}
          finalYesPrice={terminationInfo.finalYesPrice}
          finalNoPrice={terminationInfo.finalNoPrice}
          winningOutcome={terminationInfo.winningOutcome}
          isTerminator={terminationInfo.isTerminator}
          yesSymbol={yesSymbol}
          noSymbol={noSymbol}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Trade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
        {/* Outcome Selection (Binary: token pair) */}
        <div>
          <Label>Outcome</Label>
          <Tabs value={outcome} onValueChange={(v) => setOutcome(v as 'yes' | 'no')} className="mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="yes">
                <span className="text-green-600 font-semibold">{yesSymbol}</span>
              </TabsTrigger>
              <TabsTrigger value="no">
                <span className="text-red-600 font-semibold">{noSymbol}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Order Type */}
        <div>
          <Label>Order Type</Label>
          <Tabs value={orderType} onValueChange={(v) => setOrderType(v as 'limit' | 'market')} className="mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="limit">Limit</TabsTrigger>
              <TabsTrigger value="market">Market</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Buy/Sell */}
        <div>
          <Label>Side</Label>
          <Tabs value={side} onValueChange={(v) => setSide(v as 'buy' | 'sell')} className="mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="buy">Buy</TabsTrigger>
              <TabsTrigger value="sell">Sell</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Amount */}
        <div>
          <Label htmlFor="amount">Amount</Label>
          <div className="flex gap-2 mt-2">
            <Input
              id="amount"
              type="number"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="font-mono"
            />
            <Button variant="outline" onClick={() => addAmount(10)} size="sm">
              +10
            </Button>
            <Button variant="outline" onClick={() => addAmount(100)} size="sm">
              +100
            </Button>
            <Button variant="outline" onClick={setMaxAmount} size="sm">
              Max
            </Button>
          </div>
        </div>

        {/* Price (Limit orders only) */}
        {orderType === 'limit' && (
          <div>
            <Label htmlFor="price">Price (per token)</Label>
            <Input
              id="price"
              type="number"
              step="0.001"
              min="0"
              max="1"
              placeholder="0.500"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="font-mono mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Current: ${currentPrice.toFixed(3)}
            </p>
          </div>
        )}

        {/* Settlement Check */}
        <div className="flex items-center space-x-2 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-md">
          <Checkbox
            id="check-termination"
            checked={checkTermination}
            onCheckedChange={(checked) => setCheckTermination(checked as boolean)}
          />
          <div className="flex-1">
            <label
              htmlFor="check-termination"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              Check for termination ({formatProbability(terminationProbability ?? TERMINATION_PROBABILITY)} chance)
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              Costs {VRF_FEE_SOL.toFixed(4)} SOL for VRF fee
            </p>
          </div>
        </div>

        {/* Manual VRF Termination Check */}
        <div className="rounded-md border border-purple-200 bg-purple-50/60 dark:border-purple-900/40 dark:bg-purple-950/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Manual VRF termination check</p>
              <p className="text-xs text-muted-foreground">
                Uses the latest trade price and slot to request a termination check.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualTerminationCheck}
              disabled={isCheckingTermination}
            >
              {isCheckingTermination ? 'Checking...' : 'Trigger Check'}
            </Button>
          </div>
          {!randomnessAccount && (
            <p className="text-xs text-red-600">
              Missing randomness account for this market.
            </p>
          )}
        </div>

        {/* Cost Summary */}
        {amount && parseFloat(amount) > 0 && (
          <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cost:</span>
              <span className="font-mono">${cost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Fee ({orderType === 'limit' ? '0.00%' : formatFeeRate(takerFeeRate)}):
              </span>
              <span className="font-mono">${fee.toFixed(2)}</span>
            </div>
            {checkTermination && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">VRF Fee:</span>
                <span className="font-mono">{vrfFee.toFixed(4)} SOL</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t font-semibold">
              <span>{side === 'buy' ? 'Total Cost:' : 'Total Receive:'}</span>
              <span className="font-mono">${total.toFixed(2)}</span>
            </div>
          </div>
        )}


        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || orderbookLoading}
          className="w-full"
          size="lg"
        >
          {needsAuth
            ? 'Connect wallet to trade'
            : isSubmitting
            ? 'Processing...'
            : orderType === 'limit'
            ? `Place ${side === 'buy' ? 'Buy' : 'Sell'} Order`
            : `${side === 'buy' ? 'Buy' : 'Sell'} Now`}
        </Button>

        {/* Info */}
        <div className="text-xs text-muted-foreground p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md">
          <p className="font-semibold mb-1">💡 Binary Market ({yesSymbol}/{noSymbol}):</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Buy {yesSymbol} if you think the outcome will happen</li>
            <li>Buy {noSymbol} if you think it won't happen</li>
            <li>Winning positions redeem for $1 each after settlement</li>
            <li>Limit orders are fee-free; market orders use dynamic fees</li>
          </ul>
        </div>
      </CardContent>
    </Card>
    <AuthDialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
    </>
  );
}
