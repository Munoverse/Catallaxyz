'use client'

import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { useTranslation } from 'react-i18next'
import { ShieldIcon } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function PrivacySettingsPage() {
  const { isConnected: connected } = usePhantomWallet()
  const { t } = useTranslation()

  if (!connected) {
    return (
      <section className="grid gap-8">
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('settings.privacy.title')}
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
          {t('settings.privacy.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('settings.privacy.description')}
        </p>
      </div>

      <div className="mx-auto w-full max-w-2xl lg:mx-0">
        <div className="grid gap-6">
          {/* Privacy Information */}
          <div className="rounded-lg border border-border p-6">
            <div className="mb-4 flex items-center gap-2">
              <ShieldIcon className="size-5 text-primary" />
              <h3 className="text-lg font-semibold">
                {t('settings.privacy.dataProtection')}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('settings.privacy.dataProtectionNote')}
            </p>
          </div>

          {/* Links to Legal Documents */}
          <div className="rounded-lg border border-border p-6">
            <h3 className="mb-4 text-lg font-semibold">
              {t('settings.privacy.legalDocuments')}
            </h3>
            <div className="grid gap-3">
              <Button variant="outline" asChild className="justify-start">
                <Link href="/terms-of-use">
                  {t('header.navigation.termsOfUse')}
                </Link>
              </Button>
              <Button variant="outline" asChild className="justify-start">
                <Link href="/privacy-policy">
                  Privacy Policy
                </Link>
              </Button>
            </div>
          </div>

          {/* Data Rights */}
          <div className="rounded-lg bg-muted/50 p-6">
            <h3 className="mb-2 text-sm font-semibold">
              {t('settings.privacy.yourRights')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('settings.privacy.yourRightsNote')}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

