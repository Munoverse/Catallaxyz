'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, TrendingUp, TrendingDown, DollarSign, Award, Medal } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { apiFetch } from '@/lib/api-client';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar?: string;
  profit: number;
  profitPercentage: number;
  volume: number;
  trades: number;
  winRate: number;
  marketsCreated?: number;
  terminationsCount?: number;
}

type TimePeriod = 'day' | 'week' | 'month' | 'all';
type LeaderboardMetric = 'profit' | 'volume' | 'created' | 'terminated';

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<TimePeriod>('week');
  const [metric, setMetric] = useState<LeaderboardMetric>('profit');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  
  // Load leaderboard data
  useEffect(() => {
    const loadLeaderboard = async () => {
      setLoading(true);
      try {
        const response = await apiFetch(`/api/leaderboard?period=${period}&metric=${metric}`);
        if (response.ok) {
          const data = await response.json();
          setLeaderboard(data.leaderboard || []);
        }
      } catch (error) {
        console.error('Failed to load leaderboard:', error);
        // Mock data for demonstration
        setLeaderboard(generateMockData());
      } finally {
        setLoading(false);
      }
    };
    
    loadLeaderboard();
  }, [period, metric]);
  
  // Filter leaderboard by search query
  const filteredLeaderboard = leaderboard.filter(entry =>
    entry.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.userId.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Medal className="size-6 text-yellow-500" />;
    if (rank === 2) return <Medal className="size-6 text-gray-400" />;
    if (rank === 3) return <Medal className="size-6 text-amber-600" />;
    return <span className="text-lg font-bold text-muted-foreground">#{rank}</span>;
  };
  
  const getPeriodLabel = (period: TimePeriod) => {
    switch (period) {
      case 'day': return 'Last 24 Hours';
      case 'week': return 'Last 7 Days';
      case 'month': return 'Last 30 Days';
      case 'all': return 'All Time';
    }
  };
  
  const isTradeMetric = metric === 'profit' || metric === 'volume';
  const metricTitle = {
    profit: 'Profit/Loss',
    volume: 'Volume',
    created: 'Markets Created',
    terminated: 'Markets Terminated',
  }[metric];

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
          <Award className="size-10 text-primary" />
          Leaderboard
        </h1>
        <p className="text-muted-foreground">
          Leaderboard ranked by {metricTitle?.toLowerCase()}
        </p>
      </div>
      
      {/* Metric Selector */}
      <Tabs value={metric} onValueChange={(v) => setMetric(v as LeaderboardMetric)} className="mb-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profit">Profit/Loss</TabsTrigger>
          <TabsTrigger value="volume">Volume</TabsTrigger>
          <TabsTrigger value="created">Created</TabsTrigger>
          <TabsTrigger value="terminated">Terminations</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Time Period Selector */}
      <Tabs value={period} onValueChange={(v) => setPeriod(v as TimePeriod)} className="mb-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="day">Day</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="all">All Time</TabsTrigger>
        </TabsList>
      </Tabs>
      
      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by username or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>
      
      {/* Leaderboard Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {metricTitle} - {getPeriodLabel(period)}
          </CardTitle>
          <CardDescription>
            {filteredLeaderboard.length} {filteredLeaderboard.length === 1 ? 'trader' : 'traders'} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading leaderboard...</p>
            </div>
          ) : filteredLeaderboard.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {searchQuery ? 'No traders found matching your search' : 'No data available yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header */}
              <div className={`hidden md:grid gap-4 px-4 py-2 text-sm font-semibold text-muted-foreground border-b ${
                isTradeMetric ? 'md:grid-cols-7' : 'md:grid-cols-4'
              }`}>
                <div className="col-span-1">Rank</div>
                <div className="col-span-2">Trader</div>
                <div className="col-span-1 text-right">{metricTitle}</div>
                {isTradeMetric && (
                  <>
                    <div className="col-span-1 text-right">Volume</div>
                    <div className="col-span-1 text-right">Trades</div>
                    <div className="col-span-1 text-right">Win Rate</div>
                  </>
                )}
              </div>
              
              {/* Entries */}
              {filteredLeaderboard.map((entry) => (
                <div
                  key={entry.userId}
                  className={`grid grid-cols-1 gap-4 p-4 rounded-lg border transition-colors hover:bg-muted/50 ${
                    entry.rank <= 3 ? 'bg-primary/5 border-primary/20' : ''
                  } ${isTradeMetric ? 'md:grid-cols-7' : 'md:grid-cols-4'}`}
                >
                  {/* Rank */}
                  <div className="flex items-center justify-center md:justify-start col-span-1">
                    {getRankIcon(entry.rank)}
                  </div>
                  
                  {/* Trader Info */}
                  <div className="flex items-center gap-3 col-span-1 md:col-span-2">
                    <Avatar>
                      <AvatarImage src={entry.avatar} />
                      <AvatarFallback>
                        {entry.username.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{entry.username}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {entry.userId.substring(0, 8)}...{entry.userId.substring(entry.userId.length - 6)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Primary Metric */}
                  <div className="flex items-center justify-between md:justify-end col-span-1">
                    <span className="md:hidden text-sm text-muted-foreground">{metricTitle}:</span>
                    <div className="text-right">
                      {metric === 'profit' && (
                        <>
                          <div className={`font-semibold ${entry.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {entry.profit >= 0 ? '+' : ''}${entry.profit.toFixed(2)}
                          </div>
                          <div className={`text-xs ${entry.profitPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {entry.profitPercentage >= 0 ? '+' : ''}{entry.profitPercentage.toFixed(2)}%
                          </div>
                        </>
                      )}
                      {metric === 'volume' && (
                        <div className="font-semibold">
                          ${entry.volume.toLocaleString()}
                        </div>
                      )}
                      {metric === 'created' && (
                        <div className="font-semibold">
                          {entry.marketsCreated || 0}
                        </div>
                      )}
                      {metric === 'terminated' && (
                        <div className="font-semibold">
                          {entry.terminationsCount || 0}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {isTradeMetric && (
                    <>
                      {/* Volume */}
                      <div className="flex items-center justify-between md:justify-end col-span-1">
                        <span className="md:hidden text-sm text-muted-foreground">Volume:</span>
                        <div className="font-medium text-right">
                          ${entry.volume.toLocaleString()}
                        </div>
                      </div>
                      
                      {/* Trades */}
                      <div className="flex items-center justify-between md:justify-end col-span-1">
                        <span className="md:hidden text-sm text-muted-foreground">Trades:</span>
                        <div className="font-medium text-right">
                          {entry.trades}
                        </div>
                      </div>
                      
                      {/* Win Rate */}
                      <div className="flex items-center justify-between md:justify-end col-span-1">
                        <span className="md:hidden text-sm text-muted-foreground">Win Rate:</span>
                        <div className="text-right">
                          <div className="font-medium">{entry.winRate.toFixed(1)}%</div>
                          <div className="text-xs text-muted-foreground">
                            {entry.winRate >= 60 ? '🔥' : entry.winRate >= 50 ? '✓' : ''}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="size-4 text-green-600" />
              Top {metricTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {leaderboard.length > 0
                ? metric === 'profit'
                  ? `+$${Math.max(...leaderboard.map(e => e.profit)).toFixed(2)}`
                  : metric === 'volume'
                  ? `$${Math.max(...leaderboard.map(e => e.volume)).toLocaleString()}`
                  : metric === 'created'
                  ? `${Math.max(...leaderboard.map(e => e.marketsCreated || 0))}`
                  : `${Math.max(...leaderboard.map(e => e.terminationsCount || 0))}`
                : '--'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {getPeriodLabel(period)}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="size-4 text-blue-600" />
              Total {metricTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {leaderboard.length > 0
                ? metric === 'profit'
                  ? `$${leaderboard.reduce((sum, e) => sum + e.profit, 0).toFixed(2)}`
                  : metric === 'volume'
                  ? `$${leaderboard.reduce((sum, e) => sum + e.volume, 0).toLocaleString()}`
                  : metric === 'created'
                  ? `${leaderboard.reduce((sum, e) => sum + (e.marketsCreated || 0), 0)}`
                  : `${leaderboard.reduce((sum, e) => sum + (e.terminationsCount || 0), 0)}`
                : '--'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {getPeriodLabel(period)}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Award className="size-4 text-purple-600" />
              Active Traders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {leaderboard.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {getPeriodLabel(period)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Mock data generator for demonstration
function generateMockData(): LeaderboardEntry[] {
  const usernames = [
    'CryptoKing', 'TradeWizard', 'TokenMaster', 'BlockchainBoss', 'DeFiExpert',
    'MarketGuru', 'PredictPro', 'FutureSeeker', 'TrendSetter', 'ProfitHunter',
    'SmartTrader', 'LuckyWhale', 'DiamondHands', 'MoonShot', 'RiskTaker'
  ];
  
  return usernames.map((username, index) => ({
    rank: index + 1,
    userId: `0x${Math.random().toString(16).substring(2, 42)}`,
    username,
    profit: Math.random() * 10000 - 2000,
    profitPercentage: Math.random() * 200 - 50,
    volume: Math.random() * 100000,
    trades: Math.floor(Math.random() * 500) + 10,
    winRate: Math.random() * 40 + 40,
  })).sort((a, b) => b.profit - a.profit).map((entry, index) => ({
    ...entry,
    rank: index + 1
  }));
}

