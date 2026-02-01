'use client'

import { useState, useEffect } from 'react'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { getConnection } from '@/lib/solana-connection'
import { PublicKey } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, DollarSign, Wallet, TrendingUp } from 'lucide-react'
import { usecatallaxyzProgram } from '@/hooks/useCatallaxyzProgram'
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token'

const USDC_DECIMALS = 6

export default function AdminWithdrawFunds() {
  const connection = getConnection()
  const { publicKey } = usePhantomWallet()
  const program = usecatallaxyzProgram()
  
  const [treasuryBalance, setTreasuryBalance] = useState<number>(0)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [isLoadingBalance, setIsLoadingBalance] = useState(false)

  useEffect(() => {
    if (publicKey) {
      setRecipientAddress(publicKey.toBase58())
    }
  }, [publicKey])

  const fetchTreasuryBalance = async () => {
    if (!program || !connection) return

    setIsLoadingBalance(true)
    try {
      // Get platform treasury PDA
      const [platformTreasuryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('platform_treasury')],
        program.programId
      )

      // Get treasury token account balance
      const balance = await connection.getTokenAccountBalance(platformTreasuryPda)
      setTreasuryBalance(Number(balance.value.amount) / 10 ** USDC_DECIMALS)
    } catch (error) {
      console.error('Error fetching treasury balance:', error)
      toast.error('Failed to fetch treasury balance')
    } finally {
      setIsLoadingBalance(false)
    }
  }

  useEffect(() => {
    fetchTreasuryBalance()
  }, [program, connection])

  const handleWithdraw = async () => {
    if (!publicKey || !program) {
      toast.error('Please log in')
      return
    }

    const amount = parseFloat(withdrawAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    if (amount > treasuryBalance) {
      toast.error('Amount exceeds treasury balance')
      return
    }

    if (!recipientAddress) {
      toast.error('Please enter a recipient address')
      return
    }

    setIsWithdrawing(true)

    try {
      const recipientPubkey = new PublicKey(recipientAddress)
      
      // Get USDC mint from environment or use default
      const usdcMint = new PublicKey(
        process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS ||
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      )

      // Get recipient's USDC token account
      const recipientUsdcAccount = await getAssociatedTokenAddress(
        usdcMint,
        recipientPubkey
      )

      // Convert amount to lamports
      const amountLamports = Math.floor(amount * 10 ** USDC_DECIMALS)

      // Call withdraw_platform_fees instruction
      // Anchor auto-derives: global (PDA), platformTreasury (PDA)
      const tx = await program.methods
        .withdrawPlatformFees({
          amount: new BN(amountLamports),
        })
        .accounts({
          authority: publicKey,
          recipientUsdcAccount: recipientUsdcAccount,
          usdcMint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc()

      toast.success('Funds withdrawn successfully!', {
        description: `${amount} USDC sent to ${recipientAddress.slice(0, 8)}...`,
      })

      console.log('Withdraw tx:', tx)
      
      // Refresh balance
      await fetchTreasuryBalance()
      setWithdrawAmount('')
    } catch (error: any) {
      console.error('Error withdrawing funds:', error)
      toast.error('Failed to withdraw funds', {
        description: error.message || 'Unknown error',
      })
    } finally {
      setIsWithdrawing(false)
    }
  }

  const handleMaxAmount = () => {
    setWithdrawAmount(treasuryBalance.toString())
  }

  return (
    <div className="space-y-6">
      {/* Treasury Balance */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Platform Treasury Balance</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">
                {isLoadingBalance ? '...' : treasuryBalance.toFixed(2)}
              </span>
              <span className="text-lg text-muted-foreground">USDC</span>
            </div>
          </div>
          <Wallet className="h-12 w-12 text-primary/50" />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchTreasuryBalance}
          disabled={isLoadingBalance}
          className="mt-4"
        >
          {isLoadingBalance ? (
            <>
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              Refreshing...
            </>
          ) : (
            'Refresh Balance'
          )}
        </Button>
      </Card>

      {/* Withdraw Amount */}
      <div className="space-y-2">
        <Label htmlFor="withdraw-amount">Withdraw Amount (USDC)</Label>
        <div className="flex gap-2">
          <Input
            id="withdraw-amount"
            type="number"
            placeholder="0.00"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            step="0.01"
            min="0"
            max={treasuryBalance}
          />
          <Button
            variant="outline"
            onClick={handleMaxAmount}
            disabled={treasuryBalance === 0}
          >
            MAX
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Available: {treasuryBalance.toFixed(2)} USDC
        </p>
      </div>

      {/* Recipient Address */}
      <div className="space-y-2">
        <Label htmlFor="recipient-address">Recipient Wallet Address</Label>
        <Input
          id="recipient-address"
          placeholder="Enter recipient address..."
          value={recipientAddress}
          onChange={(e) => setRecipientAddress(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Defaults to your connected wallet address
        </p>
      </div>

      {/* Withdraw Button */}
      <Button
        onClick={handleWithdraw}
        disabled={isWithdrawing || !withdrawAmount || treasuryBalance === 0}
        className="w-full"
        size="lg"
      >
        {isWithdrawing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing Withdrawal...
          </>
        ) : (
          <>
            <DollarSign className="mr-2 h-4 w-4" />
            Withdraw Funds
          </>
        )}
      </Button>

      {/* Info Card */}
      <Card className="bg-muted/50 p-4">
        <div className="flex items-start gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium">Platform Treasury includes:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li>Trading fees collected from market swaps</li>
              <li>Market creation fees (paid by market creators)</li>
              <li>All fees are in USDC</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}
