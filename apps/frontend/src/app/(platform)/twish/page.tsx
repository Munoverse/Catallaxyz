'use client'

import { useMemo, useState } from 'react'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { getConnection } from '@/lib/solana-connection'
import { PublicKey, Transaction } from '@solana/web3.js'
import { createAssociatedTokenAccountInstruction, createTransferInstruction, getAssociatedTokenAddress } from '@solana/spl-token'
import { ArrowDownRight, ArrowUpRight, CopyIcon, WalletIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthDialog } from '@/components/AuthDialog'
import { useToast } from '@/hooks/use-toast'
import { formatTipUiAmount, TIP_TOKEN_DECIMALS, TIP_TOKEN_MINT, TIP_TOKEN_SYMBOL } from '@/lib/tips'
import { useTokenBalance } from '@/hooks/useTokenBalance'
import { useTranslation } from 'react-i18next'

export default function TwishPage() {
  const { isConnected: connected, publicKey, solana } = usePhantomWallet()
  const connection = getConnection()
  const { toast } = useToast()
  const { t } = useTranslation()
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [sending, setSending] = useState(false)

  const twishMint = useMemo(() => {
    if (!TIP_TOKEN_MINT) return null
    try {
      return new PublicKey(TIP_TOKEN_MINT)
    } catch {
      return null
    }
  }, [])

  const { balance } = useTokenBalance(publicKey, twishMint)

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast({ title: 'Copied', description: `${label} copied` })
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed' })
    }
  }

  const handleSend = async () => {
    if (!publicKey || !solana) {
      toast({
        variant: 'destructive',
        title: t('twish.notLoggedIn'),
        description: t('twish.loginRequired'),
      })
      return
    }

    if (!twishMint) {
      toast({
        variant: 'destructive',
        title: t('twish.notConfigured'),
        description: t('twish.mintMissing'),
      })
      return
    }

    if (!recipient || !amount) {
      toast({
        variant: 'destructive',
        title: t('twish.missingInfo'),
        description: t('twish.enterRecipientAmount'),
      })
      return
    }

    let destination: PublicKey
    try {
      destination = new PublicKey(recipient)
    } catch {
      toast({
        variant: 'destructive',
        title: t('twish.invalidAddress'),
        description: t('twish.invalidAddressDescription'),
      })
      return
    }

    const uiAmount = Number.parseFloat(amount)
    if (!Number.isFinite(uiAmount) || uiAmount <= 0) {
      toast({
        variant: 'destructive',
        title: t('twish.invalidAmount'),
        description: t('twish.invalidAmountDescription'),
      })
      return
    }

    setSending(true)
    try {
      const senderAta = await getAssociatedTokenAddress(twishMint, publicKey)
      const recipientAta = await getAssociatedTokenAddress(twishMint, destination)
      const recipientInfo = await connection.getAccountInfo(recipientAta)

      const instructions = []
      if (!recipientInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(publicKey, recipientAta, destination, twishMint)
        )
      }

      const rawAmount = BigInt(Math.floor(uiAmount * 10 ** TIP_TOKEN_DECIMALS))
      instructions.push(createTransferInstruction(senderAta, recipientAta, publicKey, rawAmount))

      const transaction = new Transaction().add(...instructions)
      transaction.feePayer = publicKey
      const { blockhash } = await connection.getLatestBlockhash('confirmed')
      transaction.recentBlockhash = blockhash
      const { signature } = await solana.signAndSendTransaction(transaction)
      await connection.confirmTransaction(signature, 'confirmed')

      toast({ title: t('twish.transferSent'), description: `${signature.slice(0, 8)}...` })
      setRecipient('')
      setAmount('')
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('twish.transferFailed'),
        description: error?.message || t('twish.transferFailedDescription'),
      })
    } finally {
      setSending(false)
    }
  }

  if (!connected) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16">
        <Card className="border-2">
          <CardContent className="flex flex-col items-center justify-center space-y-4 p-12 text-center">
            <WalletIcon className="size-16 text-muted-foreground" />
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">{t('twish.loginTitle')}</h2>
              <p className="text-muted-foreground">{t('twish.loginSubtitle')}</p>
            </div>
            <Button onClick={() => setShowAuthDialog(true)} size="lg">
              {t('header.logIn')}
            </Button>
          </CardContent>
        </Card>
        <AuthDialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{TIP_TOKEN_SYMBOL}</h1>
        <p className="mt-2 text-muted-foreground">{t('twish.subtitle', { token: TIP_TOKEN_SYMBOL })}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t('twish.walletAddress')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="break-all font-mono text-sm">{publicKey?.toString()}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCopy(publicKey?.toString() || '', t('twish.walletAddress'))}
          >
            <CopyIcon className="mr-2 size-4" />
            {t('twish.copyAddress')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowDownRight className="size-5" />
            {t('twish.receiveTitle', { token: TIP_TOKEN_SYMBOL })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {t('twish.receiveDescription', { token: TIP_TOKEN_SYMBOL })}
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="text-xs text-muted-foreground">{t('twish.mintLabel')}</div>
            <div className="break-all font-mono">{TIP_TOKEN_MINT || t('twish.notConfigured')}</div>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="text-xs text-muted-foreground">{t('twish.balanceLabel')}</div>
            <div className="font-semibold">
              {formatTipUiAmount(balance)} {TIP_TOKEN_SYMBOL}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpRight className="size-5" />
            {t('twish.sendTitle', { token: TIP_TOKEN_SYMBOL })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('twish.recipientLabel')}</label>
            <Input
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder={t('twish.recipientPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('twish.amountLabel')}</label>
            <Input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={t('twish.amountPlaceholder', { token: TIP_TOKEN_SYMBOL })}
            />
          </div>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? t('twish.sending') : t('twish.sendCta', { token: TIP_TOKEN_SYMBOL })}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
