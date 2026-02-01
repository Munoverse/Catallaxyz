'use client'

import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { useTranslation } from 'react-i18next'
import { BellIcon } from 'lucide-react'

export default function NotificationsSettingsPage() {
  const { isConnected: connected } = usePhantomWallet()
  const { t } = useTranslation()

  if (!connected) {
    return (
      <section className="grid gap-8">
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('settings.notifications.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('settings.profile.loginRequired')}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('settings.notifications.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('settings.notifications.description')}
        </p>
      </div>

      <div className="mx-auto w-full max-w-2xl lg:mx-0">
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
          <BellIcon className="mb-4 size-12 text-muted-foreground/50" />
          <h3 className="mb-2 text-lg font-semibold">
            {t('settings.notifications.comingSoon')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('settings.notifications.comingSoonNote')}
          </p>
        </div>
      </div>
    </section>
  )
}

