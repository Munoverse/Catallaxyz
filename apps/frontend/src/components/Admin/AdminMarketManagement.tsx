'use client'

import { useState } from 'react'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { getConnection } from '@/lib/solana-connection'
import { PublicKey } from '@solana/web3.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Pause, Play, AlertTriangle } from 'lucide-react'
import { usecatallaxyzProgram } from '@/hooks/useCatallaxyzProgram'

export default function AdminMarketManagement() {
  const connection = getConnection()
  const { publicKey } = usePhantomWallet()
  const program = usecatallaxyzProgram()
  
  const [marketAddress, setMarketAddress] = useState('')
  const [marketStatus, setMarketStatus] = useState<'active' | 'paused' | null>(null)
  const [isPausing, setIsPausing] = useState(false)
  const [isResuming, setIsResuming] = useState(false)
  const [isChecking, setIsChecking] = useState(false)

  const checkMarketStatus = async () => {
    if (!program || !marketAddress) {
      toast.error('Please enter a market address')
      return
    }

    setIsChecking(true)
    try {
      const marketPubkey = new PublicKey(marketAddress)
      const marketAccount = await program.account.market.fetch(marketPubkey)
      
      setMarketStatus(marketAccount.isPaused ? 'paused' : 'active')
      
      toast.success('Market status loaded', {
        description: `Market is ${marketAccount.isPaused ? 'paused' : 'active'}`,
      })
    } catch (error: any) {
      console.error('Error checking market status:', error)
      toast.error('Failed to check market status', {
        description: error.message || 'Unknown error',
      })
      setMarketStatus(null)
    } finally {
      setIsChecking(false)
    }
  }

  const handlePauseMarket = async () => {
    if (!publicKey || !program) {
      toast.error('Please log in')
      return
    }

    if (!marketAddress) {
      toast.error('Please enter a market address')
      return
    }

    setIsPausing(true)
    try {
      const marketPubkey = new PublicKey(marketAddress)

      // Call pause_market instruction
      // Note: Using 'as any' because market PDA has self-referential seeds
      // that Anchor incorrectly marks as auto-derivable
      const tx = await (program.methods
        .pauseMarket()
        .accounts({
          authority: publicKey,
          market: marketPubkey,
        } as any))
        .rpc()

      toast.success('Market paused successfully!', {
        description: 'Trading and order placement are now disabled',
      })

      console.log('Pause market tx:', tx)
      setMarketStatus('paused')
    } catch (error: any) {
      console.error('Error pausing market:', error)
      toast.error('Failed to pause market', {
        description: error.message || 'Unknown error',
      })
    } finally {
      setIsPausing(false)
    }
  }

  const handleResumeMarket = async () => {
    if (!publicKey || !program) {
      toast.error('Please log in')
      return
    }

    if (!marketAddress) {
      toast.error('Please enter a market address')
      return
    }

    setIsResuming(true)
    try {
      const marketPubkey = new PublicKey(marketAddress)

      // Call resume_market instruction
      // Note: Using 'as any' because market PDA has self-referential seeds
      // that Anchor incorrectly marks as auto-derivable
      const tx = await (program.methods
        .resumeMarket()
        .accounts({
          authority: publicKey,
          market: marketPubkey,
        } as any))
        .rpc()

      toast.success('Market resumed successfully!', {
        description: 'Trading and order placement are now enabled',
      })

      console.log('Resume market tx:', tx)
      setMarketStatus('active')
    } catch (error: any) {
      console.error('Error resuming market:', error)
      toast.error('Failed to resume market', {
        description: error.message || 'Unknown error',
      })
    } finally {
      setIsResuming(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Market Address Input */}
      <div className="space-y-2">
        <Label htmlFor="market-address">Market Address</Label>
        <div className="flex gap-2">
          <Input
            id="market-address"
            placeholder="Enter market public key..."
            value={marketAddress}
            onChange={(e) => {
              setMarketAddress(e.target.value)
              setMarketStatus(null)
            }}
          />
          <Button
            variant="outline"
            onClick={checkMarketStatus}
            disabled={isChecking || !marketAddress}
          >
            {isChecking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Check Status'
            )}
          </Button>
        </div>
      </div>

      {/* Market Status Display */}
      {marketStatus && (
        <Card className="bg-muted/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Current Status</p>
              <div className="flex items-center gap-2">
                <Badge
                  variant={marketStatus === 'active' ? 'default' : 'destructive'}
                  className="text-sm"
                >
                  {marketStatus === 'active' ? (
                    <>
                      <Play className="mr-1 h-3 w-3" />
                      Active
                    </>
                  ) : (
                    <>
                      <Pause className="mr-1 h-3 w-3" />
                      Paused
                    </>
                  )}
                </Badge>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4">
        <Button
          onClick={handlePauseMarket}
          disabled={isPausing || !marketAddress || marketStatus === 'paused'}
          variant="destructive"
          size="lg"
        >
          {isPausing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Pausing...
            </>
          ) : (
            <>
              <Pause className="mr-2 h-4 w-4" />
              Pause Market
            </>
          )}
        </Button>

        <Button
          onClick={handleResumeMarket}
          disabled={isResuming || !marketAddress || marketStatus === 'active'}
          variant="default"
          size="lg"
        >
          {isResuming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Resuming...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Resume Market
            </>
          )}
        </Button>
      </div>

      {/* Warning Card */}
      <Card className="bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
          <div className="space-y-2 text-sm">
            <p className="font-medium text-yellow-900 dark:text-yellow-100">
              Emergency Market Controls
            </p>
            <ul className="space-y-1 text-yellow-800 dark:text-yellow-200 list-disc list-inside">
              <li>
                <strong>Pause Market:</strong> Disables all trading, order placement, and swaps. Use for emergency situations or security concerns.
              </li>
              <li>
                <strong>Resume Market:</strong> Re-enables all market activities. Ensure issues are resolved before resuming.
              </li>
              <li>
                Existing orders remain on the orderbook when paused but cannot be executed.
              </li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}
