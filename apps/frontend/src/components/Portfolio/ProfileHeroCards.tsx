'use client';

import { useState, useMemo, useId } from 'react';
import { CheckIcon, CircleHelpIcon, MinusIcon, TriangleIcon, FocusIcon } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ProfileData {
  username: string;
  avatarUrl?: string;
  joinedAt?: string;
  address?: string;
}

interface PortfolioSnapshot {
  positionsValue: number;
  biggestWin: number;
  predictions: number;
  profitLoss: number;
}

interface ProfileHeroCardsProps {
  profile: ProfileData;
  snapshot: PortfolioSnapshot;
  onCopyAddress?: () => void;
  addressCopied?: boolean;
}

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function ProfileOverviewCard({ 
  profile, 
  snapshot, 
  onCopyAddress, 
  addressCopied 
}: Omit<ProfileHeroCardsProps, 'platformName' | 'platformLogoSvg'>) {
  const joinedText = useMemo(() => {
    if (!profile.joinedAt) return null;
    const date = new Date(profile.joinedAt);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [profile.joinedAt]);

  const stats = [
    { label: 'Positions Value', value: `$${formatCurrency(snapshot.positionsValue)}` },
    { label: 'Biggest Win', value: `$${formatCurrency(snapshot.biggestWin)}` },
    { label: 'Predictions', value: snapshot.predictions.toLocaleString('en-US') },
  ];

  return (
    <Card className="relative h-full overflow-hidden border border-border/60 bg-card/70">
      <CardContent className="relative flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/40">
              {profile.avatarUrl ? (
                <Image
                  src={profile.avatarUrl}
                  alt={`${profile.username} avatar`}
                  fill
                  className="object-cover"
                />
              ) : (
                <span className="text-lg font-semibold text-muted-foreground uppercase">
                  {profile.username.slice(0, 2)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-lg leading-tight font-semibold sm:text-xl" title={profile.username}>
                {profile.username}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {joinedText && (
                  <span className="inline-flex items-center gap-1">
                    Joined {joinedText}
                  </span>
                )}
              </div>
            </div>
          </div>

          {profile.address && onCopyAddress && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border border-border/60 bg-background/60 text-muted-foreground shadow-sm transition-colors hover:bg-background"
              onClick={onCopyAddress}
              aria-label="Copy wallet address"
            >
              {addressCopied ? (
                <CheckIcon className="size-4 text-yes" />
              ) : (
                <FocusIcon className="size-4" />
              )}
            </Button>
          )}
        </div>

        <div className="mt-auto grid grid-cols-3 gap-3 pt-1">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={cn(
                'space-y-1 rounded-lg bg-background/40 p-2.5 shadow-sm',
                index > 0 && 'border-l border-border/50'
              )}
            >
              <p className="text-xs font-medium text-muted-foreground">
                {stat.label}
              </p>
              <p className="text-lg font-semibold tracking-tight text-foreground">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function buildSparkline(values: number[], width = 100, height = 36) {
  if (!values.length) {
    return { line: '', area: '' };
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = width / Math.max(values.length - 1, 1);

  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / range) * height;
    return { x, y };
  });

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  const area = `${line} L ${width} ${height} L 0 ${height} Z`;

  return { line, area };
}

const defaultTimeframes: Record<string, number[]> = {
  '1D': [0.12, 0.09, 0.14, 0.11, 0.16, 0.13, 0.15],
  '1W': [0.18, 0.22, 0.17, 0.2, 0.19, 0.23, 0.24],
  '1M': [0.16, 0.15, 0.19, 0.18, 0.21, 0.2, 0.24, 0.23, 0.26, 0.25],
  'ALL': [0.14, 0.12, 0.17, 0.15, 0.22, 0.2, 0.19, 0.24, 0.23, 0.25, 0.26, 0.28],
};

function ProfitLossCard({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const [activeTimeframe, setActiveTimeframe] = useState<keyof typeof defaultTimeframes>('ALL');
  const chartValues = defaultTimeframes[activeTimeframe] || defaultTimeframes.ALL;
  const { line, area } = useMemo(() => buildSparkline(chartValues), [chartValues]);
  const gradientId = useId();
  const lineGradientId = `${gradientId}-line`;
  const profitLoss = snapshot.profitLoss || 0;
  const isPositive = profitLoss > 0;
  const isNegative = profitLoss < 0;

  return (
    <Card className="relative h-full overflow-hidden border border-border/60 bg-card/70">
      <CardContent className="relative flex h-full flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-7 items-center justify-center rounded-full border text-xs',
                isPositive && 'border-yes/50 bg-yes/10 text-yes',
                isNegative && 'border-no/40 bg-no/10 text-no',
                !isPositive && !isNegative && 'border-border/60 bg-muted/40 text-muted-foreground'
              )}
            >
              {isPositive && <TriangleIcon className="size-4 -translate-y-[1px] fill-current" />}
              {isNegative && <TriangleIcon className="size-4 translate-y-[1px] rotate-180 fill-current" />}
              {!isPositive && !isNegative && <MinusIcon className="size-4" />}
            </span>
            <span className="text-base font-semibold text-foreground">Profit/Loss</span>
          </div>

          <div className="flex gap-2">
            {(Object.keys(defaultTimeframes) as Array<keyof typeof defaultTimeframes>).map(timeframe => (
              <Button
                key={timeframe}
                size="sm"
                variant={activeTimeframe === timeframe ? 'default' : 'ghost'}
                className={cn(
                  'h-8 px-3 text-xs font-semibold',
                  activeTimeframe === timeframe
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/60'
                )}
                onClick={() => setActiveTimeframe(timeframe)}
              >
                {timeframe}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-[32px] leading-none font-bold tracking-tight">
                {isPositive ? '+' : ''}${formatCurrency(Math.abs(profitLoss))}
              </p>
              <CircleHelpIcon className="size-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {activeTimeframe === 'ALL' ? 'All-Time' : activeTimeframe}
            </p>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground/70">
            <span className="text-2xl font-semibold">Catallaxyz</span>
          </div>
        </div>

        <div className="relative mt-auto w-full overflow-hidden">
          <svg viewBox="0 0 100 36" className="size-full">
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgb(58,131,250)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="rgb(132,94,247)" stopOpacity="0.06" />
              </linearGradient>
              <linearGradient id={lineGradientId} x1="0" y1="0" x2="100%" y2="0">
                <stop offset="0%" stopColor="#3BA5FF" />
                <stop offset="100%" stopColor="#A855F7" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradientId})`} opacity="0.9" />
            <path d={line} fill="none" stroke={`url(#${lineGradientId})`} strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-transparent/60 to-transparent" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProfileHeroCards({ 
  profile, 
  snapshot, 
  onCopyAddress, 
  addressCopied 
}: ProfileHeroCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ProfileOverviewCard 
        profile={profile} 
        snapshot={snapshot} 
        onCopyAddress={onCopyAddress}
        addressCopied={addressCopied}
      />
      <ProfitLossCard snapshot={snapshot} />
    </div>
  );
}
