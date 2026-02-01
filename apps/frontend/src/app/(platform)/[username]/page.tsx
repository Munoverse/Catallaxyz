'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

/**
 * Username Alias Route
 * 
 * This is an ALIAS (friendly URL) that redirects to the real profile route.
 * Route: /@[username]
 * 
 * Design Philosophy:
 * - /@username is just a friendly alias for sharing
 * - The REAL route is /profile/[walletAddress] (permanent)
 * - This route queries the username and redirects to wallet address
 * 
 * Flow:
 * 1. User visits /@alice
 * 2. Query database to get wallet address for "alice"
 * 3. Redirect to /profile/[walletAddress]
 * 
 * Benefits:
 * - Friendly, shareable URLs
 * - Wallet address route remains the source of truth
 * - If username changes, old links still work via wallet address
 */
export default function UsernameAliasRedirect() {
  const params = useParams()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  
  const username = params.username as string

  useEffect(() => {
    const redirectToProfile = async () => {
      if (!username) {
        setError('Invalid username')
        return
      }

      try {
        // Remove @ prefix if present
        const cleanUsername = username.startsWith('@') ? username.slice(1) : username
        
        // Query user by username
        let response = await apiFetch(`/api/users/by-username/${cleanUsername}`)
        
        // If username query fails, try as wallet address (for backward compatibility)
        if (!response.ok) {
          response = await apiFetch(`/api/users/${cleanUsername}`)
        }
        
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data) {
            const walletAddress = result.data.walletAddress
            
            if (walletAddress) {
              // Redirect to the REAL profile route
              router.replace(`/profile/${walletAddress}`)
            } else {
              setError('User data incomplete')
              setTimeout(() => router.replace('/'), 2000)
            }
          } else {
            setError('User not found')
            setTimeout(() => router.replace('/'), 2000)
          }
        } else {
          setError('User not found')
          setTimeout(() => router.replace('/'), 2000)
        }
      } catch (err) {
        console.error('Error fetching user profile:', err)
        setError('Failed to load profile')
        setTimeout(() => router.replace('/'), 2000)
      }
    }

    redirectToProfile()
  }, [username, router])

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center">
      {error ? (
        <div className="text-center">
          <p className="text-lg text-muted-foreground mb-2">{error}</p>
          <p className="text-sm text-muted-foreground">Redirecting to home...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Redirecting to profile...</p>
          <p className="text-xs text-muted-foreground">@{username}</p>
        </div>
      )}
    </div>
  )
}
