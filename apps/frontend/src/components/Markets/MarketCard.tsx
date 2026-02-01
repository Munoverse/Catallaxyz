'use client';

import Link from 'next/link';
import { Clock, TrendingUp, Users, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface MarketCardProps {
  market: {
    id: string;
    title: string;
    question: string;
    status: string;
    settlement_count?: number;
    created_at?: string;
    end_date?: string;
    category?: string;
    volume?: string;
    participants?: number;
  };
}

export default function MarketCard({ market }: MarketCardProps) {
  const isActive = market.status === 'active';
  const isSettled = market.status === 'settled';
  const endDate = market.end_date ? new Date(market.end_date) : null;
  const daysUntilEnd = endDate
    ? Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Link href={`/markets/${market.id}`}>
      <Card className={cn(
        'h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg',
        'border-border/60 bg-card/70'
      )}>
        <CardContent className="p-4 h-full flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1 min-w-0 mr-3">
              <h3 className="text-sm font-semibold line-clamp-2 leading-tight mb-1">
                {market.title}
              </h3>
              {market.category && (
                <Badge variant="outline" className="text-xs">
                  {market.category}
                </Badge>
              )}
            </div>
            <Badge
              variant={isActive ? 'default' : isSettled ? 'secondary' : 'outline'}
              className={cn(
                'text-xs shrink-0',
                isActive && 'bg-green-600 hover:bg-green-700',
                isSettled && 'bg-blue-600 hover:bg-blue-700'
              )}
            >
              {market.status}
            </Badge>
          </div>

          {/* Question */}
          <p className="text-xs text-muted-foreground line-clamp-2 flex-1 mb-3">
            {market.question}
          </p>

          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-2 mb-3 pt-3 border-t border-border/50">
            {market.volume && (
              <div className="flex items-center gap-1.5 text-xs">
                <DollarSign className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Volume:</span>
                <span className="font-medium">${(parseFloat(market.volume) / 1_000_000).toFixed(0)}</span>
              </div>
            )}
            {market.participants !== undefined && (
              <div className="flex items-center gap-1.5 text-xs">
                <Users className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Traders:</span>
                <span className="font-medium">{market.participants}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center text-xs text-muted-foreground mt-auto pt-2 border-t border-border/50">
            {daysUntilEnd !== null && isActive && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {daysUntilEnd > 0 ? `${daysUntilEnd}d left` : 'Ending soon'}
              </span>
            )}
            {market.settlement_count !== undefined && (
              <span className="flex items-center gap-1">
                <TrendingUp className="size-3" />
                {market.settlement_count} settlements
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
