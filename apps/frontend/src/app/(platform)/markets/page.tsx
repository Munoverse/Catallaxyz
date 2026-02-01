'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Market } from '@/types';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Search, X, Filter, TrendingUp, Clock, Droplets, Gift, Sparkles, Heart } from 'lucide-react';
import toast from 'react-hot-toast';
import { useFavorites } from '@/hooks/useFavorites';
import { useDebounce } from '@/hooks/useDebounce';

interface Category {
  id: string;
  slug: string;
  name: string;
  name_zh: string | null;
  icon: string | null;
  is_active: boolean;
  is_featured: boolean;
  markets_count?: number;
}

type SortOption = 'volume_24h' | 'total_volume' | 'liquidity' | 'newest' | 'bounty';
type FrequencyOption = 'all' | 'daily' | 'weekly' | 'monthly';
type StatusOption = 'all' | 'active' | 'mediation' | 'settled' | 'terminated';

const SORT_OPTIONS: { value: SortOption; labelKey: string; icon: React.ReactNode }[] = [
  { value: 'volume_24h', labelKey: 'volume24h', icon: <TrendingUp className="h-4 w-4" /> },
  { value: 'total_volume', labelKey: 'totalVolume', icon: <TrendingUp className="h-4 w-4" /> },
  { value: 'liquidity', labelKey: 'liquidity', icon: <Droplets className="h-4 w-4" /> },
  { value: 'newest', labelKey: 'newest', icon: <Clock className="h-4 w-4" /> },
  { value: 'bounty', labelKey: 'bounty', icon: <Gift className="h-4 w-4" /> },
];

const FREQUENCY_OPTIONS: { value: FrequencyOption; labelKey: string }[] = [
  { value: 'all', labelKey: 'all' },
  { value: 'daily', labelKey: 'daily' },
  { value: 'weekly', labelKey: 'weekly' },
  { value: 'monthly', labelKey: 'monthly' },
];

const STATUS_OPTIONS: { value: StatusOption; labelKey: string }[] = [
  { value: 'all', labelKey: 'all' },
  { value: 'active', labelKey: 'active' },
  { value: 'mediation', labelKey: 'mediation' },
  { value: 'settled', labelKey: 'settled' },
  { value: 'terminated', labelKey: 'terminated' },
];

export default function MarketsPage() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language?.startsWith('zh');
  const { favoriteIds, toggleFavorite } = useFavorites();
  
  // Data states
  const [markets, setMarkets] = useState<Market[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300); // Debounce search input
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [frequency, setFrequency] = useState<FrequencyOption>('all');
  const [status, setStatus] = useState<StatusOption>('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchCategories();
    fetchMarkets();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await apiFetch('/api/categories?withStats=true');
      const data = await response.json();
      if (data.success) {
        setCategories(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const fetchMarkets = async () => {
    try {
      const response = await apiFetch('/api/markets');
      const data = await response.json();
      if (data.success) {
        setMarkets(data.data?.markets || []);
      } else {
        setMarkets(data.markets || []);
      }
    } catch (error) {
      console.error('Error fetching markets:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort markets
  const filteredMarkets = useMemo(() => {
    let filtered = [...markets];

    // Search filter (use debounced value for performance)
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.title?.toLowerCase().includes(query) ||
          m.question?.toLowerCase().includes(query) ||
          m.description?.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter((m) => m.category === selectedCategory);
    }

    // Status filter
    if (status !== 'all') {
      if (status === 'mediation') {
        // Mediation status maps to paused or specific condition
        filtered = filtered.filter((m) => m.status === 'paused' || (m as any).is_paused);
      } else {
        filtered = filtered.filter((m) => m.status === status);
      }
    }

    // Frequency filter (if markets have frequency field)
    if (frequency !== 'all') {
      filtered = filtered.filter((m) => (m as any).frequency === frequency);
    }

    // Sort
    switch (sortBy) {
      case 'volume_24h':
        filtered.sort((a, b) => 
          ((b as any).volume_24h || 0) - ((a as any).volume_24h || 0)
        );
        break;
      case 'total_volume':
        filtered.sort((a, b) => 
          (b.total_volume || 0) - (a.total_volume || 0)
        );
        break;
      case 'liquidity':
        filtered.sort((a, b) => 
          ((b as any).liquidity || 0) - ((a as any).liquidity || 0)
        );
        break;
      case 'newest':
        filtered.sort((a, b) => 
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        break;
      case 'bounty':
        filtered.sort((a, b) => 
          (Number(b.tip_amount) || 0) - (Number(a.tip_amount) || 0)
        );
        break;
    }

    return filtered;
  }, [markets, debouncedSearchQuery, selectedCategory, sortBy, frequency, status]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSortBy('newest');
    setFrequency('all');
    setStatus('all');
  };

  const hasActiveFilters = 
    searchQuery || 
    selectedCategory !== 'all' || 
    sortBy !== 'newest' || 
    frequency !== 'all' || 
    status !== 'all';

  const formatVolume = (volume: number | undefined) => {
    if (!volume) return '$0';
    const usdcAmount = volume / 1_000_000;
    if (usdcAmount >= 1_000_000) return `$${(usdcAmount / 1_000_000).toFixed(1)}M`;
    if (usdcAmount >= 1_000) return `$${(usdcAmount / 1_000).toFixed(1)}K`;
    return `$${usdcAmount.toFixed(0)}`;
  };

  if (loading) {
    return (
      <div className="container grid gap-6 py-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-10 w-24 shrink-0" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-[200px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container grid gap-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('markets.title', { defaultValue: 'Markets' })}</h1>
          <p className="text-muted-foreground text-sm">
            {t('markets.subtitle', { defaultValue: 'Browse and trade prediction markets' })}
          </p>
        </div>
        <Button asChild>
          <Link href="/markets/create">
            {t('header.navigation.create', { defaultValue: 'Create Market' })}
          </Link>
        </Button>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
        <Button
          variant={selectedCategory === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedCategory('all')}
          className="shrink-0"
        >
          <Sparkles className="h-4 w-4 mr-1" />
          {t('markets.categories.all', { defaultValue: 'All' })}
        </Button>
        {categories.map((category) => (
          <Button
            key={category.id}
            variant={selectedCategory === category.slug ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(category.slug)}
            className="shrink-0"
          >
            {category.icon && <span className="mr-1">{category.icon}</span>}
            {isZh && category.name_zh ? category.name_zh : category.name}
            {category.markets_count !== undefined && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                {category.markets_count}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="space-y-3">
        <div className="flex gap-2">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('markets.searchPlaceholder', { defaultValue: 'Search markets...' })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Toggle Filters */}
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="grid gap-3 sm:grid-cols-3 p-4 border border-border rounded-lg bg-muted/30">
            {/* Sort By */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                {t('markets.sortBy', { defaultValue: 'Sort By' })}
              </label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        {option.icon}
                        {t(`markets.sort.${option.labelKey}`, { defaultValue: option.labelKey })}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Frequency */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                {t('markets.frequency', { defaultValue: 'Frequency' })}
              </label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as FrequencyOption)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(`markets.frequency.${option.labelKey}`, { defaultValue: option.labelKey })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                {t('markets.statusLabel', { defaultValue: 'Status' })}
              </label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusOption)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(`markets.status.${option.labelKey}`, { defaultValue: option.labelKey })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {t('markets.activeFilters', { defaultValue: 'Active filters:' })}
            </span>
            {searchQuery && (
              <Badge variant="secondary" className="gap-1">
                {t('markets.search', { defaultValue: 'Search' })}: "{searchQuery}"
                <button onClick={() => setSearchQuery('')}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {selectedCategory !== 'all' && (
              <Badge variant="secondary" className="gap-1">
                {t('markets.categoryLabel', { defaultValue: 'Category' })}: {selectedCategory}
                <button onClick={() => setSelectedCategory('all')}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {sortBy !== 'newest' && (
              <Badge variant="secondary" className="gap-1">
                {t('markets.sortBy', { defaultValue: 'Sort' })}: {t(`markets.sort.${sortBy}`, { defaultValue: sortBy })}
                <button onClick={() => setSortBy('newest')}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {frequency !== 'all' && (
              <Badge variant="secondary" className="gap-1">
                {t('markets.frequency', { defaultValue: 'Frequency' })}: {frequency}
                <button onClick={() => setFrequency('all')}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {status !== 'all' && (
              <Badge variant="secondary" className="gap-1">
                {t('markets.statusLabel', { defaultValue: 'Status' })}: {t(`markets.status.${status}`, { defaultValue: status })}
                <button onClick={() => setStatus('all')}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 text-xs">
              {t('markets.clearAll', { defaultValue: 'Clear all' })}
            </Button>
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className="text-sm text-muted-foreground">
        {t('markets.resultsCount', { 
          defaultValue: '{{count}} markets found',
          count: filteredMarkets.length 
        })}
      </div>

      {/* Markets Grid */}
      {filteredMarkets.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredMarkets.map((market) => {
            const isFavorite = favoriteIds.has(market.id);
            return (
              <Card
                key={market.id}
                className="relative h-[200px] cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg group"
              >
                <button
                  type="button"
                  onClick={async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    try {
                      await toggleFavorite(market.id);
                    } catch (error: any) {
                      toast.error(error.message || 'Failed to update favorite');
                    }
                  }}
                  className="absolute right-2 top-2 z-10 rounded-full bg-background/80 p-1.5 text-muted-foreground hover:text-red-500"
                  aria-label={isFavorite ? 'Unfavorite market' : 'Favorite market'}
                >
                  <Heart className={cn('h-4 w-4', isFavorite && 'fill-red-500 text-red-500')} />
                </button>
                <Link href={`/markets/${market.id}`}>
                  <CardContent className="p-4 h-full flex flex-col">
                  {/* Category Badge */}
                  {market.category && (
                    <div className="mb-2">
                      <Badge variant="outline" className="text-xs">
                        {(() => {
                          const cat = categories.find(c => c.slug === market.category);
                          return cat ? (
                            <>
                              {cat.icon && <span className="mr-1">{cat.icon}</span>}
                              {isZh && cat.name_zh ? cat.name_zh : cat.name}
                            </>
                          ) : market.category;
                        })()}
                      </Badge>
                    </div>
                  )}
                  
                  {/* Title */}
                  <h3 className="text-sm font-semibold mb-2 line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                    {market.title}
                  </h3>
                  
                  {/* Question/Description */}
                  <p className="text-xs text-muted-foreground line-clamp-2 flex-1">
                    {market.question || market.description}
                  </p>
                  
                  {/* Stats */}
                  <div className="mt-auto pt-3 border-t border-border/50">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {t('markets.volume', { defaultValue: 'Volume' })}:
                        <span className="font-medium text-foreground ml-1">
                          {formatVolume(market.total_volume)}
                        </span>
                      </span>
                      <span className={cn(
                        'font-medium',
                        market.status === 'active' ? 'text-green-500' : 
                        market.status === 'settled' ? 'text-blue-500' : 
                        market.status === 'terminated' ? 'text-red-500' : 'text-muted-foreground'
                      )}>
                        {t(`markets.status.${market.status}`, { defaultValue: market.status })}
                      </span>
                    </div>
                    {(market.tip_amount && Number(market.tip_amount) > 0) && (
                      <div className="flex items-center gap-1 text-xs text-amber-500 mt-1">
                        <Gift className="h-3 w-3" />
                        <span>{formatVolume(Number(market.tip_amount))} {t('markets.bounty', { defaultValue: 'Bounty' })}</span>
                      </div>
                    )}
                  </div>
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">
              {hasActiveFilters
                ? t('markets.noMatchingMarkets', { defaultValue: 'No markets match your filters' })
                : t('markets.empty', { defaultValue: 'No markets found' })}
            </p>
            {hasActiveFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                {t('markets.clearFilters', { defaultValue: 'Clear Filters' })}
              </Button>
            ) : (
              <Button asChild>
                <Link href="/markets/create">
                  {t('markets.createFirst', { defaultValue: 'Create the first market' })}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
