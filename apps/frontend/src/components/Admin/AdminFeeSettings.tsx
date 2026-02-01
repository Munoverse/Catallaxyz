'use client'

import { useState } from 'react'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { toast } from 'sonner'
import { Loader2, TrendingUp, Info } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

export default function AdminFeeSettings() {
  const { publicKey } = usePhantomWallet()

  const [centerFeeRate, setCenterFeeRate] = useState(3.2) // 3.2%
  const [extremeFeeRate, setExtremeFeeRate] = useState(0.2) // 0.2%
  const [isUpdating, setIsUpdating] = useState(false)

  // Calculate fee at different probabilities for preview
  const calculateFeeAtProbability = (probability: number) => {
    const distanceFromCenter = Math.abs(probability - 0.5)
    const rateRange = centerFeeRate - extremeFeeRate
    const feeReduction = rateRange * (distanceFromCenter / 0.5)
    return centerFeeRate - feeReduction
  }

  const handleUpdateFees = async () => {
    if (!publicKey) {
      toast.error('Please log in')
      return
    }

    if (centerFeeRate < extremeFeeRate) {
      toast.error('Center fee must be higher than extreme fee')
      return
    }

    if (centerFeeRate > 10) {
      toast.error('Center fee cannot exceed 10%')
      return
    }

    setIsUpdating(true)

    try {
      const response = await apiFetch('/api/admin/fee-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-wallet': publicKey.toBase58(),
        },
        body: JSON.stringify({
          centerTakerFeeRate: centerFeeRate,
          extremeTakerFeeRate: extremeFeeRate,
        }),
      })
      const payload = await response.json()
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message || 'Failed to update fee rates')
      }

      toast.success('Fee rates updated successfully!', {
        description: 'Synced to chain and database',
      })

    } catch (error: any) {
      console.error('Error updating fee rates:', error)
      toast.error('Failed to update fee rates', {
        description: error.message || 'Unknown error',
      })
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Center Fee Rate Slider */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Center Fee Rate (at 50% probability)</Label>
          <span className="text-sm font-medium">{centerFeeRate.toFixed(2)}%</span>
        </div>
        <Slider
          value={[centerFeeRate]}
          onValueChange={(value) => setCenterFeeRate(value[0])}
          min={0.2}
          max={10}
          step={0.1}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Highest fee applied when market is balanced (50-50 odds)
        </p>
      </div>

      {/* Extreme Fee Rate Slider */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Extreme Fee Rate (at 0%/100% probability)</Label>
          <span className="text-sm font-medium">{extremeFeeRate.toFixed(2)}%</span>
        </div>
        <Slider
          value={[extremeFeeRate]}
          onValueChange={(value) => setExtremeFeeRate(value[0])}
          min={0.1}
          max={2}
          step={0.1}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Lowest fee applied when market is very one-sided (encourages arbitrage)
        </p>
      </div>

      {/* Fee Curve Preview */}
      <Card className="bg-muted/50 p-4">
        <div className="flex items-start gap-2 mb-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div>
            <h4 className="text-sm font-medium mb-1">Fee Curve Preview</h4>
            <p className="text-xs text-muted-foreground mb-3">
              How fees change across different probabilities
            </p>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2 text-xs">
          {[0, 0.25, 0.5, 0.75, 1].map((prob) => (
            <div key={prob} className="text-center">
              <div className="font-medium text-muted-foreground mb-1">
                {(prob * 100).toFixed(0)}%
              </div>
              <div className="font-bold text-primary">
                {calculateFeeAtProbability(prob).toFixed(2)}%
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Update Button */}
      <Button
        onClick={handleUpdateFees}
        disabled={isUpdating}
        className="w-full"
        size="lg"
      >
        {isUpdating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Updating Fee Rates...
          </>
        ) : (
          <>
            <TrendingUp className="mr-2 h-4 w-4" />
            Update Fee Rates
          </>
        )}
      </Button>

      {/* Help Text */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 text-sm">
        <p className="font-medium mb-2">How dynamic fees work:</p>
        <ul className="space-y-1 text-muted-foreground list-disc list-inside">
          <li>Fees are highest when probability is near 50% (balanced market)</li>
          <li>Fees decrease smoothly as probability approaches 0% or 100%</li>
          <li>Lower extreme fees encourage arbitrage and high-frequency trading</li>
          <li>Smooth curve prevents manipulation from stepped fee structures</li>
        </ul>
      </div>
    </div>
  )
}
