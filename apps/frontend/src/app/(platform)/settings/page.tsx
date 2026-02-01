'use client'

import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { useTranslation } from 'react-i18next'
import { useUser } from '@/hooks/useUser'
import SettingsProfileForm from '@/app/(platform)/settings/_components/SettingsProfileForm'

export default function SettingsPage() {
  const { isConnected: connected } = usePhantomWallet()
  const { user } = useUser()
  const { t } = useTranslation()

  if (!connected || !user) {
    return (
      <section className="grid gap-8">
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('settings.profile.title')}
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
          {t('settings.profile.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('settings.profile.description')}
        </p>
      </div>

      <div className="mx-auto w-full max-w-2xl lg:mx-0">
        <SettingsProfileForm />
      </div>
    </section>
  )
}
