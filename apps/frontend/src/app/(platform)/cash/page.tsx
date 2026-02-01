'use client'

import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export default function CashPage() {
  const { t } = useTranslation()

  return (
    <div className="container grid gap-6 py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('cash.title')}</h1>
        <p className="text-muted-foreground">{t('cash.description')}</p>
      </div>

      <div className="rounded-md border border-border/60 bg-card p-6">
        <h2 className="text-lg font-semibold">{t('cash.phantomTitle')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('cash.phantomDescription')}
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-foreground/90">
          <li>{t('cash.phantomStep1')}</li>
          <li>{t('cash.phantomStep2')}</li>
          <li>{t('cash.phantomStep3')}</li>
        </ol>
        <div className="mt-5">
          <Button asChild>
            <Link
              href="https://phantom.app/download"
              target="_blank"
              rel="noreferrer"
            >
              {t('cash.phantomCta')}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
