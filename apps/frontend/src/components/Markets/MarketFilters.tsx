'use client';

import { useState } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface MarketFiltersProps {
  onSearchChange: (search: string) => void;
  onStatusChange: (status: string) => void;
  onCategoryChange: (category: string) => void;
  onSortChange: (sort: string) => void;
  activeFilters?: {
    search?: string;
    status?: string;
    category?: string;
    sort?: string;
  };
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Markets' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'settled', label: 'Settled' },
  { value: 'terminated', label: 'Terminated' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'volume', label: 'Highest Volume' },
  { value: 'ending_soon', label: 'Ending Soon' },
  { value: 'most_traders', label: 'Most Traders' },
];

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'politics', label: 'Politics' },
  { value: 'sports', label: 'Sports' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'science', label: 'Science' },
  { value: 'other', label: 'Other' },
];

export default function MarketFilters({
  onSearchChange,
  onStatusChange,
  onCategoryChange,
  onSortChange,
  activeFilters = {},
}: MarketFiltersProps) {
  const [searchValue, setSearchValue] = useState(activeFilters.search || '');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    onSearchChange(value);
  };

  const clearFilters = () => {
    setSearchValue('');
    onSearchChange('');
    onStatusChange('all');
    onCategoryChange('all');
    onSortChange('newest');
  };

  const hasActiveFilters = 
    searchValue || 
    (activeFilters.status && activeFilters.status !== 'all') ||
    (activeFilters.category && activeFilters.category !== 'all') ||
    (activeFilters.sort && activeFilters.sort !== 'newest');

  return (
    <div className="space-y-4">
      {/* Search and Advanced Toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search markets..."
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
          {searchValue && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button
          variant={showAdvanced ? 'default' : 'outline'}
          size="icon"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-label="Toggle filters"
        >
          <Filter className="size-4" />
        </Button>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="grid gap-3 sm:grid-cols-3 p-4 border border-border rounded-lg bg-muted/30">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Status
            </label>
            <Select
              value={activeFilters.status || 'all'}
              onValueChange={onStatusChange}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Category
            </label>
            <Select
              value={activeFilters.category || 'all'}
              onValueChange={onCategoryChange}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Sort By
            </label>
            <Select
              value={activeFilters.sort || 'newest'}
              onValueChange={onSortChange}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
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
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {searchValue && (
            <Badge variant="secondary" className="gap-1">
              Search: "{searchValue}"
              <button onClick={() => handleSearchChange('')}>
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {activeFilters.status && activeFilters.status !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Status: {STATUS_OPTIONS.find(o => o.value === activeFilters.status)?.label}
              <button onClick={() => onStatusChange('all')}>
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {activeFilters.category && activeFilters.category !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Category: {CATEGORY_OPTIONS.find(o => o.value === activeFilters.category)?.label}
              <button onClick={() => onCategoryChange('all')}>
                <X className="size-3" />
              </button>
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-6 text-xs"
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
