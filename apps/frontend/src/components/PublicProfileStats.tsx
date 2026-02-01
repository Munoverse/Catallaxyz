'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Target, BarChart3, Activity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import LoadingSpinner from './LoadingSpinner'
import { apiFetch } from '@/lib/api-client'

interface PublicStats {
  marketsCreated: number
  totalPredictions: number
  marketsParticipated: number
  totalVolume: string
  winRate?: number
  totalTrades: number
  terminationsCount?: number
}

interface PublicProfileStatsProps {
  walletAddress?: string
  username?: string
  className?: string
}

// Convert USDC lamports to human readable
const formatUSDC = (lamports: string): string => {
  const amount = BigInt(lamports)
  const usdc = Number(amount) / 1_000_000
  return usdc.toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })
}

/**
 * Public Profile Stats Component
 * 
 * Displays public statistics that anyone can see
 * Does NOT show sensitive information like:
 * - Wallet balance
 * - P&L details
 * - Unrealized gains
 */
export default function PublicProfileStats({ 
  walletAddress, 
  username,
  className 
}: PublicProfileStatsProps) {
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      if (!walletAddress && !username) {
        setError('No user identifier provided')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        // Use username if available, otherwise wallet address
        let targetWalletAddress = walletAddress

        if (!targetWalletAddress && username) {
          const userResponse = await apiFetch(`/api/users/by-username/${username}`)
          const userResult = await userResponse.json()
          if (userResult.success && userResult.data?.walletAddress) {
            targetWalletAddress = userResult.data.walletAddress
          }
        }

        if (!targetWalletAddress) {
          setError('Failed to resolve user')
          return
        }

        const response = await apiFetch(`/api/users/${targetWalletAddress}/stats?refresh=1`)
        const result = await response.json()

        if (result.success && result.data) {
          setStats(result.data)
        } else {
          setError('Failed to load statistics')
        }
      } catch (err) {
        console.error('Error fetching public stats:', err)
        setError('Failed to load statistics')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [walletAddress, username])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner size="md" />
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        {error || 'No statistics available'}
      </div>
    )
  }

  return (
    <div className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-5', className)}>
      {/* Markets Created */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Markets Created</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.marketsCreated}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Original markets
          </p>
        </CardContent>
      </Card>

      {/* Total Predictions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Predictions</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.totalPredictions}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.marketsParticipated} markets
          </p>
        </CardContent>
      </Card>

      {/* Trading Volume */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Trading Volume</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            ${formatUSDC(stats.totalVolume)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.totalTrades} trades
          </p>
        </CardContent>
      </Card>

      {/* Win Rate (if available) */}
      {stats.winRate !== undefined ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-yes" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yes">
              {stats.winRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Success rate
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Markets</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.marketsParticipated}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Markets participated
            </p>
          </CardContent>
        </Card>
      )}

      {/* Terminations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Terminations</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.terminationsCount ?? 0}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Random terminations
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
