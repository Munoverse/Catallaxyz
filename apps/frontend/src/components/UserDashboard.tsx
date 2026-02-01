'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity, 
  Target, 
  Award,
  Calendar,
  BarChart3
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import LoadingSpinner from './LoadingSpinner';
import { apiFetch } from '@/lib/api-client';

interface UserStats {
  // Basic stats
  marketsCreated: number;
  totalTrades: number;
  totalVolume: string;
  
  // P&L
  realizedPnl: string;
  unrealizedPnl: string;
  totalPnl: string;
  biggestWin: string;
  
  // Positions
  totalPositionValue: string;
  marketsParticipated: number;
  activePositions: number;
  
  // Predictions
  totalPredictions: number;

  // Terminations
  terminationsCount: number;
  
  // Balances
  usdcBalance: string;
  lastBalanceUpdate?: string;
}

interface MarketPerformance {
  marketId: string;
  marketTitle: string;
  marketStatus: string;
  numPositions: number;
  totalPositionValue: string;
  realizedPnl: string;
  unrealizedPnl: string;
  totalPnl: string;
  numTrades: number;
  totalVolume: string;
  firstPositionDate: string;
  lastActivityDate: string;
}

interface UserOperation {
  id: string;
  operationType: string;
  marketTitle: string;
  amount: string;
  fee: string;
  description?: string;
  createdAt: string;
}

interface FavoriteMarket {
  marketId: string;
  createdAt: string;
  market?: {
    id: string;
    title: string;
    status?: string;
    category?: string;
    tip_amount?: string | number | null;
    total_volume?: number | string | null;
  } | null;
}

interface CreatedMarket {
  id: string;
  title: string;
  status: string;
  created_at?: string;
  total_volume?: number;
  tip_amount?: number;
}

interface UserDashboardProps {
  walletAddress: string;
  className?: string;
}

// Convert USDC lamports to human readable (1 USDC = 1,000,000 lamports)
const formatUSDC = (lamports: string): string => {
  const amount = BigInt(lamports);
  const usdc = Number(amount) / 1_000_000;
  return usdc.toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

const formatPnL = (lamports: string): { value: string; isPositive: boolean; isZero: boolean } => {
  const amount = BigInt(lamports);
  const usdc = Number(amount) / 1_000_000;
  const isPositive = amount > BigInt(0);
  const isZero = amount === BigInt(0);
  const sign = isPositive ? '+' : '';
  return {
    value: `${sign}${usdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    isPositive,
    isZero,
  };
};

export default function UserDashboard({ walletAddress, className }: UserDashboardProps) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [markets, setMarkets] = useState<MarketPerformance[]>([]);
  const [operations, setOperations] = useState<UserOperation[]>([]);
  const [favorites, setFavorites] = useState<FavoriteMarket[]>([]);
  const [createdMarkets, setCreatedMarkets] = useState<CreatedMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async ({
    refreshStats = false,
    showLoader = true,
  }: {
    refreshStats?: boolean;
    showLoader?: boolean;
  } = {}) => {
    try {
      if (showLoader) {
        setLoading(true);
      }
      setError(null);

      // Fetch stats
      const statsUrl = `/api/users/${walletAddress}/stats${refreshStats ? '?refresh=1' : ''}`;
      const statsRes = await apiFetch(statsUrl);
      const statsData = await statsRes.json();

      if (statsData.success) {
        setStats(statsData.data);
      }

      // Fetch markets
      const marketsRes = await apiFetch(`/api/users/${walletAddress}/markets`);
      const marketsData = await marketsRes.json();

      if (marketsData.success) {
        setMarkets(marketsData.data.markets);
      }

      // Fetch operations
      const opsRes = await apiFetch(`/api/users/${walletAddress}/operations?limit=10`);
      const opsData = await opsRes.json();

      if (opsData.success) {
        setOperations(opsData.data.operations);
      }

      // Fetch favorites
      const favoritesRes = await apiFetch(`/api/favorites?walletAddress=${walletAddress}`);
      const favoritesData = await favoritesRes.json();
      if (favoritesData.success) {
        setFavorites(favoritesData.data.favorites || []);
      }

      // Fetch created markets
      const createdRes = await apiFetch(`/api/markets?creator=${walletAddress}&limit=50`);
      const createdData = await createdRes.json();
      if (createdData.success) {
        setCreatedMarkets(createdData.data?.markets || []);
      }
    } catch (err: any) {
      console.error('Error fetching user data:', err);
      setError(err.message || 'Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (walletAddress) {
      fetchData({ refreshStats: true, showLoader: true });
    }
  }, [walletAddress]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        {error || 'Failed to load user data'}
      </div>
    );
  }

  const pnl = formatPnL(stats.totalPnl);
  const realizedPnl = formatPnL(stats.realizedPnl);
  const unrealizedPnl = formatPnL(stats.unrealizedPnl);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total P&L */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
            {pnl.isPositive ? (
              <TrendingUp className="h-4 w-4 text-yes" />
            ) : (
              <TrendingDown className="h-4 w-4 text-no" />
            )}
          </CardHeader>
          <CardContent>
            <div className={cn(
              'text-2xl font-bold',
              pnl.isPositive && 'text-yes',
              !pnl.isPositive && !pnl.isZero && 'text-no'
            )}>
              ${pnl.value}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Realized: ${realizedPnl.value} | Unrealized: ${unrealizedPnl.value}
            </p>
          </CardContent>
        </Card>

        {/* Position Value */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Position Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${formatUSDC(stats.totalPositionValue)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.activePositions} active positions
            </p>
          </CardContent>
        </Card>

        {/* Biggest Win */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Biggest Win</CardTitle>
            <Award className="h-4 w-4 text-yes" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yes">
              ${formatUSDC(stats.biggestWin)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Single trade profit
            </p>
          </CardContent>
        </Card>

        {/* Total Predictions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Predictions</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.totalPredictions}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.marketsParticipated} markets
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trading Volume</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              ${formatUSDC(stats.totalVolume)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalTrades} trades
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Markets Created</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {stats.marketsCreated}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Your markets
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">USDC Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              ${formatUSDC(stats.usdcBalance)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Available balance
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Terminations</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {stats.terminationsCount ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Random terminations
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Markets and Operations */}
      <Tabs defaultValue="markets" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="markets">Markets</TabsTrigger>
          <TabsTrigger value="favorites">Favorites</TabsTrigger>
          <TabsTrigger value="created">Created</TabsTrigger>
          <TabsTrigger value="operations">Operations History</TabsTrigger>
        </TabsList>

        <TabsContent value="markets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Market Performance</CardTitle>
              <CardDescription>Your performance across different markets</CardDescription>
            </CardHeader>
            <CardContent>
              {markets.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No market positions yet
                </p>
              ) : (
                <div className="space-y-4">
                  {markets.map((market) => {
                    const marketPnl = formatPnL(market.totalPnl);
                    return (
                      <div
                        key={market.marketId}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1">
                          <h4 className="font-medium">{market.marketTitle}</h4>
                          <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                            <span>{market.numPositions} positions</span>
                            <span>{market.numTrades} trades</span>
                            <span className="capitalize">{market.marketStatus}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={cn(
                            'text-lg font-bold',
                            marketPnl.isPositive && 'text-yes',
                            !marketPnl.isPositive && !marketPnl.isZero && 'text-no'
                          )}>
                            ${marketPnl.value}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            ${formatUSDC(market.totalPositionValue)} position
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Operations</CardTitle>
              <CardDescription>Your recent trading activity</CardDescription>
            </CardHeader>
            <CardContent>
              {operations.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No operations yet
                </p>
              ) : (
                <div className="space-y-2">
                  {operations.map((op) => (
                    <div
                      key={op.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize">{op.operationType}</span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-sm text-muted-foreground">{op.marketTitle}</span>
                        </div>
                        {op.description && (
                          <p className="text-sm text-muted-foreground mt-1">{op.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(op.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          ${formatUSDC(op.amount)}
                        </div>
                        {op.fee !== '0' && (
                          <div className="text-xs text-muted-foreground">
                            Fee: ${formatUSDC(op.fee)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="favorites" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Favorite Markets</CardTitle>
              <CardDescription>Markets you have bookmarked</CardDescription>
            </CardHeader>
            <CardContent>
              {favorites.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No favorite markets yet
                </p>
              ) : (
                <div className="space-y-3">
                  {favorites.map((fav) => (
                    <div
                      key={fav.marketId}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <h4 className="font-medium">{fav.market?.title || 'Unknown Market'}</h4>
                        <div className="text-xs text-muted-foreground mt-1">
                          {fav.market?.status || 'unknown'} • {fav.market?.category || 'uncategorized'}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(fav.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="created" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Created Markets</CardTitle>
              <CardDescription>Markets you have launched</CardDescription>
            </CardHeader>
            <CardContent>
              {createdMarkets.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No markets created yet
                </p>
              ) : (
                <div className="space-y-3">
                  {createdMarkets.map((market) => (
                    <div
                      key={market.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <h4 className="font-medium">{market.title}</h4>
                        <div className="text-xs text-muted-foreground mt-1 capitalize">
                          {market.status}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {market.created_at ? new Date(market.created_at).toLocaleDateString() : '--'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

