'use client'

import { useState } from 'react'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { PublicKey } from '@solana/web3.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import { buildWalletAuthHeaders } from '@/lib/wallet-auth'
import { Loader2, AlertTriangle } from 'lucide-react'
import { usecatallaxyzProgram, catallaxyz_PROGRAM_ID } from '@/hooks/useCatallaxyzProgram'
import { getAdminPDAs } from '@/lib/admin'

export default function AdminMarketParams() {
  const { publicKey, solana } = usePhantomWallet()
  const program = usecatallaxyzProgram()

  const [marketAddress, setMarketAddress] = useState('')
  const [terminationProbability, setTerminationProbability] = useState(0.1) // percent
  const [platformFeeShare, setPlatformFeeShare] = useState(75) // percent
  const [rewardFeeShare, setRewardFeeShare] = useState(20) // percent
  const [creatorFeeShare, setCreatorFeeShare] = useState(5) // percent
  const [isUpdatingTermination, setIsUpdatingTermination] = useState(false)
  const [isUpdatingFees, setIsUpdatingFees] = useState(false)

  const feeSum = platformFeeShare + rewardFeeShare + creatorFeeShare
  const isFeeSumValid = Math.abs(feeSum - 100) < 1e-6
  const isTerminationValid =
    !!marketAddress &&
    terminationProbability >= 0 &&
    terminationProbability <= 100
  const isFeeValid =
    platformFeeShare >= 0 &&
    rewardFeeShare >= 0 &&
    creatorFeeShare >= 0 &&
    isFeeSumValid

  const handleUpdateTermination = async () => {
    if (!publicKey || !program) {
      toast.error('Please log in')
      return
    }

    if (!isTerminationValid) {
      toast.error('Please fix validation errors before updating')
      return
    }

    setIsUpdatingTermination(true)
    try {
      const marketPubkey = new PublicKey(marketAddress)
      const terminationScaled = Math.floor((terminationProbability / 100) * 1_000_000)

      const { globalPda } = getAdminPDAs(catallaxyz_PROGRAM_ID)
      const tx = await (program as any).methods
        .updateMarketParams({
          terminationProbability: terminationScaled,
        })
        .accounts({
          authority: publicKey,
          global: globalPda,
          market: marketPubkey,
        })
        .rpc()

      if (!solana?.signMessage) {
        throw new Error('Wallet does not support message signing')
      }

      const authHeaders = await buildWalletAuthHeaders({
        walletAddress: publicKey.toBase58(),
        signMessage: async (message: Uint8Array) => {
          const { signature } = await solana.signMessage(message)
          return signature
        },
      })

      const dbResponse = await apiFetch('/api/admin/markets/termination-probability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          marketAddress,
          terminationProbability,
        }),
      })
      const dbPayload = await dbResponse.json()
      if (!dbResponse.ok || !dbPayload?.success) {
        throw new Error(dbPayload?.error?.message || 'Failed to sync termination probability')
      }

      toast.success('Termination probability updated', {
        description: `Transaction: ${tx.slice(0, 8)}...`,
      })
    } catch (error: any) {
      console.error('Error updating termination probability:', error)
      toast.error('Failed to update termination probability', {
        description: error.message || 'Unknown error',
      })
    } finally {
      setIsUpdatingTermination(false)
    }
  }

  const handleUpdateGlobalFees = async () => {
    if (!publicKey || !program) {
      toast.error('Please log in')
      return
    }

    if (!isFeeValid) {
      toast.error('Please fix fee split validation errors')
      return
    }

    setIsUpdatingFees(true)
    try {
      const response = await apiFetch('/api/admin/fee-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-wallet': publicKey.toBase58(),
        },
        body: JSON.stringify({
          platformFeeShare: platformFeeShare,
          rewardFeeShare: rewardFeeShare,
          creatorFeeShare: creatorFeeShare,
        }),
      })
      const payload = await response.json()
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message || 'Failed to update fee config')
      }

      toast.success('Global fee split updated', {
        description: 'Synced to chain and database',
      })
    } catch (error: any) {
      console.error('Error updating global fee split:', error)
      toast.error('Failed to update global fee split', {
        description: error.message || 'Unknown error',
      })
    } finally {
      setIsUpdatingFees(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="market-address">Market Address</Label>
        <Input
          id="market-address"
          placeholder="Enter market public key..."
          value={marketAddress}
          onChange={(e) => setMarketAddress(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label htmlFor="termination-prob">Termination Probability (%)</Label>
          <Input
            id="termination-prob"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={terminationProbability}
            onChange={(e) => setTerminationProbability(Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="platform-share">Platform Share (%)</Label>
          <Input
            id="platform-share"
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={platformFeeShare}
            onChange={(e) => setPlatformFeeShare(Number(e.target.value))}
            className={!isFeeSumValid ? 'border-red-400 focus-visible:ring-red-400' : ''}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reward-share">Liquidity Rewards (%)</Label>
          <Input
            id="reward-share"
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={rewardFeeShare}
            onChange={(e) => setRewardFeeShare(Number(e.target.value))}
            className={!isFeeSumValid ? 'border-red-400 focus-visible:ring-red-400' : ''}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="creator-share">Creator Incentive (%)</Label>
          <Input
            id="creator-share"
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={creatorFeeShare}
            onChange={(e) => setCreatorFeeShare(Number(e.target.value))}
            className={!isFeeSumValid ? 'border-red-400 focus-visible:ring-red-400' : ''}
          />
        </div>
      </div>

      {!isFeeSumValid && (
        <Card className="border-red-300 bg-red-50 p-3">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" />
            Platform share + rewards share + creator share must equal 100%.
          </div>
        </Card>
      )}

      <div className="text-xs text-muted-foreground">
        Fee split is global and will be applied to all markets.
      </div>

      <Button
        onClick={handleUpdateTermination}
        disabled={!isTerminationValid || isUpdatingTermination}
        className="w-full"
      >
        {isUpdatingTermination ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Updating...
          </>
        ) : (
          'Update Termination Probability'
        )}
      </Button>

      <Button
        onClick={handleUpdateGlobalFees}
        disabled={!isFeeValid || isUpdatingFees}
        className="w-full"
        variant="secondary"
      >
        {isUpdatingFees ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Updating...
          </>
        ) : (
          'Update Global Fee Split'
        )}
      </Button>
    </div>
  )
}
