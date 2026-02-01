'use client'

/**
 * Admin Panel Page
 * 
 * AUDIT FIX P2-4: Dynamic imports for code splitting
 * Admin components are loaded on demand to reduce initial bundle size
 */

import { useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { isAdminWallet } from '@/lib/admin'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Shield,
  TrendingUp,
  DollarSign,
  Settings as SettingsIcon,
  Coins,
  ListChecks,
  List,
  Tags,
} from 'lucide-react'
import LoadingSpinner from '@/components/LoadingSpinner'

// AUDIT FIX P2-4: Dynamic imports with loading states for code splitting
const AdminFeeSettings = dynamic(
  () => import('@/components/Admin/AdminFeeSettings'),
  { loading: () => <AdminLoadingPlaceholder /> }
)
const AdminMarketParams = dynamic(
  () => import('@/components/Admin/AdminMarketParams'),
  { loading: () => <AdminLoadingPlaceholder /> }
)
const AdminWithdrawFunds = dynamic(
  () => import('@/components/Admin/AdminWithdrawFunds'),
  { loading: () => <AdminLoadingPlaceholder /> }
)
const AdminMarketManagement = dynamic(
  () => import('@/components/Admin/AdminMarketManagement'),
  { loading: () => <AdminLoadingPlaceholder /> }
)
const AdminMintUSDC = dynamic(
  () => import('@/components/Admin/AdminMintUSDC'),
  { loading: () => <AdminLoadingPlaceholder /> }
)
const AdminInactiveMarkets = dynamic(
  () => import('@/components/Admin/AdminInactiveMarkets'),
  { loading: () => <AdminLoadingPlaceholder /> }
)
const AdminAllMarkets = dynamic(
  () => import('@/components/Admin/AdminAllMarkets'),
  { loading: () => <AdminLoadingPlaceholder /> }
)
const AdminCategoryManagement = dynamic(
  () => import('@/components/Admin/AdminCategoryManagement'),
  { loading: () => <AdminLoadingPlaceholder /> }
)

// Loading placeholder for admin components
function AdminLoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center py-8">
      <LoadingSpinner />
    </div>
  )
}

export default function AdminPage() {
  const { publicKey, isConnected: connected, walletAddress } = usePhantomWallet()
  const router = useRouter()

  useEffect(() => {
    if (!connected) {
      router.push('/')
      return
    }

    if (!walletAddress || !isAdminWallet(walletAddress)) {
      router.push('/')
    }
  }, [connected, walletAddress, router])

  if (!connected || !walletAddress || !isAdminWallet(walletAddress)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Admin Panel</h1>
        </div>
        <p className="text-muted-foreground">
          Manage platform settings, fees, and market operations
        </p>
      </div>

      <Tabs defaultValue="fees" className="space-y-6">
        <TabsList className="grid w-full grid-cols-7 max-w-6xl">
          <TabsTrigger value="fees" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Fee Settings
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <Tags className="h-4 w-4" />
            Categories
          </TabsTrigger>
          <TabsTrigger value="withdraw" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Withdraw Funds
          </TabsTrigger>
          <TabsTrigger value="markets" className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" />
            Market Management
          </TabsTrigger>
          <TabsTrigger value="inactive" className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            Inactive Markets
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            All Markets
          </TabsTrigger>
          <TabsTrigger value="mint" className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Mint tUSDC
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fees" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Trading Fee Configuration</CardTitle>
              <CardDescription>
                Configure the dynamic fee curve for market trading. Fees are highest at 50% probability (balanced market) and lowest at extremes (0%/100%).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdminFeeSettings />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Market Parameters</CardTitle>
              <CardDescription>
                Update termination probability and fee split (platform vs liquidity rewards). Shares must sum to 100%.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdminMarketParams />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Category Management</CardTitle>
              <CardDescription>
                Manage market categories. Add, edit, or remove categories that users can select when creating markets.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdminCategoryManagement />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdraw" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Withdraw Platform Fees</CardTitle>
              <CardDescription>
                Withdraw accumulated trading and market creation fees from the platform treasury.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdminWithdrawFunds />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="markets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Market State Management</CardTitle>
              <CardDescription>
                Pause or resume markets for emergency situations or maintenance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdminMarketManagement />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inactive" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Inactive Markets</CardTitle>
              <CardDescription>
                Markets inactive for 5 days are listed here for manual termination.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdminInactiveMarkets />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Markets</CardTitle>
              <CardDescription>All markets with category information.</CardDescription>
            </CardHeader>
            <CardContent>
              <AdminAllMarkets />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mint" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mint Test USDC</CardTitle>
              <CardDescription>
                Mint test USDC tokens for development and testing purposes (Devnet only).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdminMintUSDC />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
