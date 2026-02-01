'use client'

import { useState } from 'react'
import { PublicKey, Transaction } from '@solana/web3.js'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { getConnection } from '@/lib/solana-connection'
import { createTransferInstruction } from '@solana/spl-token'
import toast from 'react-hot-toast'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthDialog } from '@/components/AuthDialog'
import { getOrCreateTokenAccount, toRawAmount } from '@/lib/token-utils'
import { TIP_TOKEN_DECIMALS, TIP_TOKEN_MINT, TIP_TOKEN_SYMBOL } from '@/lib/tips'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-client'

interface TipButtonProps {
  targetId: string
  targetType: 'market' | 'comment'
  recipientWallet?: string | null
  onSuccess?: () => void
  label?: string
  className?: string
  compact?: boolean
}

export default function TipButton({
  targetId,
  targetType,
  recipientWallet,
  onSuccess,
  label = 'Tip',
  className,
  compact = false,
}: TipButtonProps) {
  const connection = getConnection()
  const { publicKey, isConnected, solana } = usePhantomWallet()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showAuthDialog, setShowAuthDialog] = useState(false)

  const handleOpen = () => {
    if (!isConnected) {
      setShowAuthDialog(true)
      return
    }
    setOpen(true)
  }

  const handleSubmit = async () => {
    if (!isConnected) {
      setShowAuthDialog(true)
      return
    }
    if (!publicKey || !solana) {
      toast.error('Please connect your wallet first.')
      return
    }

    if (!TIP_TOKEN_MINT) {
      toast.error('Tip token is not configured.')
      return
    }

    if (!recipientWallet) {
      toast.error('Unable to get recipient address.')
      return
    }

    const uiAmount = Number.parseFloat(amount)
    if (!Number.isFinite(uiAmount) || uiAmount <= 0) {
      toast.error('Please enter a valid amount.')
      return
    }

    if (recipientWallet === publicKey.toString()) {
      toast.error('You cannot tip yourself.')
      return
    }

    try {
      setSubmitting(true)
      const mint = new PublicKey(TIP_TOKEN_MINT)
      const sender = publicKey
      const recipient = new PublicKey(recipientWallet)

      const { address: senderAta, instruction: createSenderAtaIx } =
        await getOrCreateTokenAccount(connection, { publicKey: sender }, mint, sender)
      const { address: recipientAta, instruction: createRecipientAtaIx } =
        await getOrCreateTokenAccount(connection, { publicKey: sender }, mint, recipient)

      const rawAmount = toRawAmount(uiAmount, TIP_TOKEN_DECIMALS)
      const transferIx = createTransferInstruction(senderAta, recipientAta, sender, rawAmount)

      const tx = new Transaction()
      if (createSenderAtaIx) tx.add(createSenderAtaIx)
      if (createRecipientAtaIx) tx.add(createRecipientAtaIx)
      tx.add(transferIx)

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      tx.recentBlockhash = blockhash
      tx.feePayer = sender

      const { signature } = await solana.signAndSendTransaction(tx)
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')

      const response = await apiFetch('/api/tips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          amount_raw: rawAmount.toString(),
          token_mint: TIP_TOKEN_MINT,
          tx_signature: signature,
          sender_wallet: sender.toString(),
          recipient_wallet: recipientWallet,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to record tip.')
      }

      toast.success(`Tip sent: ${uiAmount} ${TIP_TOKEN_SYMBOL}`)
      setAmount('')
      setOpen(false)
      onSuccess?.()
    } catch (error: any) {
      toast.error(error?.message || 'Tip failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={compact ? 'ghost' : 'secondary'}
        size={compact ? 'sm' : 'default'}
        onClick={handleOpen}
        className={cn(compact ? 'h-8 px-2 text-xs' : '', className)}
      >
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tip {TIP_TOKEN_SYMBOL}</DialogTitle>
            <DialogDescription>
              Enter the tip amount. The system will transfer {TIP_TOKEN_SYMBOL} tokens.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              type="number"
              min="0"
              step="any"
              placeholder={`Amount (${TIP_TOKEN_SYMBOL})`}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              More tips move the market higher in recommendations.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Confirm tip'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AuthDialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
    </>
  )
}
