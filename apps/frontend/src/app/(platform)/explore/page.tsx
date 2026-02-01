'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Market } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';

export default function ExplorePage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    fetchMarkets();
  }, []);

  const fetchMarkets = async () => {
    try {
      const response = await apiFetch('/api/markets');
      const data = await response.json();
      setMarkets(data.markets || []);
    } catch (error) {
      console.error('Error fetching markets:', error);
    } finally {
      setLoading(false);
    }
  };


  if (loading) {
    return (
      <div className="container grid gap-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-[180px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container grid gap-4 py-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{t('header.navigation.explore')}</h1>
        <Button asChild>
          <Link href="/markets/create">
            {t('header.navigation.create')}
          </Link>
        </Button>
      </div>

      {markets.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {markets.map((market) => (
            <Card
              key={market.id}
              className="h-[180px] cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <Link href={`/markets/${market.id}`}>
                <CardContent className="p-4 h-full flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-sm font-semibold line-clamp-2 leading-tight flex-1">
                      {market.title}
                    </h3>
                    <span className="text-2xs bg-muted px-2 py-0.5 rounded ml-2 shrink-0">
                      Binary
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 flex-1 mb-3">
                    {market.question}
                  </p>
                  <div className="flex justify-between text-xs text-muted-foreground mt-auto">
                    <span>Settlements: {market.settlement_count || 0}</span>
                    <span className="capitalize">{market.status}</span>
                  </div>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No markets found</p>
            <Button asChild>
              <Link href="/markets/create">
                Create the first market
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

