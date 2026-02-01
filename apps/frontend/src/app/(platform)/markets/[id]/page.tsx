'use client';

import { useParams } from 'next/navigation';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { Market } from '@/types';
import { useMarket } from '@/hooks/useMarket';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import MarketInfoSidebar from '@/components/market/MarketInfoSidebar';
import TradingPanel from '@/components/market/TradingPanel';
import ProbabilityChart from '@/components/market/ProbabilityChart';
import MarketPositionsDialog from '@/components/market/MarketPositionsDialog';
import OrderbookView from '@/components/market/OrderbookView';
import UserOrdersPanel from '@/components/market/UserOrdersPanel';
import TradeHistory from '@/components/market/TradeHistory';
import { useMarketTrades } from '@/hooks/useMarketTrades';
import CommentsSection from '@/components/CommentsSection';
import TipButton from '@/components/TipButton';
import { formatTipAmount, TIP_TOKEN_SYMBOL } from '@/lib/tips';

export default function MarketDetailPage() {
  const params = useParams();
  const marketId = params.id as string;
  const { market, loading, error, refetch } = useMarket(marketId);
  const { isConnected: connected } = usePhantomWallet();
  const { trades, loading: tradesLoading, error: tradesError } = useMarketTrades(marketId);
  const getSymbol = (value: string | undefined, fallback: string) =>
    value && value.trim().length > 0 ? value.trim() : fallback;
  const outcomeSymbols = {
    yes: getSymbol(market?.metadata?.outcomes?.[0]?.symbol, 'YES'),
    no: getSymbol(market?.metadata?.outcomes?.[1]?.symbol, 'NO'),
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingSpinner text="Loading market..." />
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Market not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Sidebar - Market Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Market Header */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-2xl lg:text-3xl mb-2">
                      {market.title}
                    </CardTitle>
                    <CardDescription className="text-base">
                      {market.question || market.title}
                    </CardDescription>
                  </div>
                  
                  {/* Position Management Button */}
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-xs text-muted-foreground text-right">
                      <div>Tip {formatTipAmount(market.tip_amount)} {TIP_TOKEN_SYMBOL}</div>
                    </div>
                    {market.creator?.wallet_address && (
                      <TipButton
                        targetId={market.id}
                        targetType="market"
                        recipientWallet={market.creator.wallet_address}
                        label="Tip market"
                        compact
                        onSuccess={() => {
                          refetch()
                        }}
                      />
                    )}
                    {connected && market.solana_market_account && (
                      <MarketPositionsDialog
                        marketPda={market.solana_market_account}
                        yesSymbol={outcomeSymbols.yes}
                        noSymbol={outcomeSymbols.no}
                        onSuccess={() => refetch()}
                      />
                    )}
                  </div>
                </div>
              </CardHeader>
              
              {market.description && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">{market.description}</p>
                </CardContent>
              )}
            </Card>

            {/* Market Status Banner */}
            {market.status === 'settled' && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg">
                <p className="font-semibold">✓ Market Settled</p>
                <p className="text-sm">This market has been settled. You can redeem positions at final prices.</p>
              </div>
            )}
            
            {market.status === 'terminated' && (
              <div className="bg-orange-100 border border-orange-400 text-orange-700 px-4 py-3 rounded-lg">
                <p className="font-semibold">⚠ Market Terminated</p>
                <p className="text-sm">This market was terminated due to 7 days of inactivity.</p>
              </div>
            )}

            {/* Probability Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Probability</CardTitle>
                <CardDescription className="text-xs mt-1">
                  Calculated as the midpoint of bid-ask spread (or last trade if spread {'>'} 10¢)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProbabilityChart 
                  marketId={marketId}
                  currentYesPrice={market.current_yes_price}
                  currentNoPrice={market.current_no_price}
                  yesSymbol={outcomeSymbols.yes}
                  noSymbol={outcomeSymbols.no}
                />
              </CardContent>
            </Card>

            {/* Market Statistics */}
            <MarketInfoSidebar market={market} outcomeSymbols={outcomeSymbols} />
            
            {/* Activity Tabs */}
            <Card>
              <Tabs defaultValue="orderbook" className="w-full">
                <CardHeader>
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="orderbook">Order Book</TabsTrigger>
                    <TabsTrigger value="orders">My Orders</TabsTrigger>
                    <TabsTrigger value="trades">Trades</TabsTrigger>
                    <TabsTrigger value="comments">Comments</TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent>
                  <TabsContent value="orderbook">
                    {market.solana_market_account ? (
                      <OrderbookView
                        marketId={market.id}
                        outcomeIndex={0}
                      />
                    ) : (
                      <div className="text-sm text-muted-foreground text-center py-8">
                        Market not initialized
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="orders">
                    {market.solana_market_account && connected ? (
                      <UserOrdersPanel marketId={market.id} />
                    ) : (
                      <div className="text-sm text-muted-foreground text-center py-8">
                        {!connected ? 'Connect wallet to view your orders' : 'Market not initialized'}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="trades">
                    <TradeHistory
                      trades={trades}
                      loading={tradesLoading}
                      error={tradesError}
                      outcomeSymbols={outcomeSymbols}
                    />
                  </TabsContent>
                  <TabsContent value="comments">
                    <CommentsSection marketId={marketId} />
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>
          </div>

          {/* Right Sidebar - Trading Panel */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-6 space-y-6">
              {market.solana_market_account ? (
                <TradingPanel
                  marketId={market.id}
                  marketAddress={market.solana_market_account}
                  currentYesPrice={market.current_yes_price}
                  currentNoPrice={market.current_no_price}
                  randomnessAccount={market.randomness_account}
                  latestTrade={trades?.[0] ?? null}
                  outcomeSymbols={outcomeSymbols}
                  onSuccess={() => refetch()}
                />
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-4 text-center">
                      <p className="text-sm text-orange-700 dark:text-orange-300">
                        ⚠️ Market not initialized on-chain
                      </p>
                      <p className="mt-2 text-xs text-orange-600 dark:text-orange-400">
                        Please wait for market initialization
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
