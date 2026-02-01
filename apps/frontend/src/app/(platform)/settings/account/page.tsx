'use client'

import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { useTranslation } from 'react-i18next'
import { WalletIcon, ExternalLinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default function AccountSettingsPage() {
  const { isConnected: connected, publicKey, walletAddress } = usePhantomWallet()
  const { t } = useTranslation()

  if (!connected || !publicKey) {
    return (
      <section className="grid gap-8">
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('settings.account.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('settings.profile.loginRequired')}
          </p>
        </div>
      </section>
    )
  }

  const walletName = 'Phantom'

  return (
    <section className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('settings.account.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('settings.account.description')}
        </p>
      </div>

      <div className="mx-auto w-full max-w-2xl lg:mx-0">
        {/* Wallet Management */}
        <div className="grid gap-6">
          <div className="rounded-lg border border-border p-6">
            <div className="mb-4 flex items-center gap-2">
              <WalletIcon className="size-5 text-primary" />
              <h3 className="text-lg font-semibold">
                {t('settings.account.solanaWallet')}
              </h3>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>{t('settings.account.walletAddress')}</Label>
                <div className="rounded-md bg-muted p-3 font-mono text-sm">
                  {walletAddress}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Wallet Type</Label>
                <div className="rounded-md bg-muted p-3 text-sm">
                  {walletName}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  asChild
                >
                  <a
                    href={`https://explorer.solana.com/address/${walletAddress}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    {t('settings.account.viewOnExplorer')}
                    <ExternalLinkIcon className="size-4" />
                  </a>
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Your wallet is managed by {walletName}. Keys are stored securely in your wallet extension.
              </p>
            </div>
          </div>

          {/* Account Actions */}
          <div className="rounded-lg border border-destructive/50 p-6">
            <h3 className="mb-2 text-lg font-semibold text-destructive">
              {t('settings.account.dangerZone')}
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {t('settings.account.dangerZoneNote')}
            </p>
            <div className="rounded-md bg-muted/50 p-4 text-sm text-muted-foreground">
              {t('settings.account.contactSupport')}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

