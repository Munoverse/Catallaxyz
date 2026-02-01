'use client'

import Link from 'next/link'
import { type ReactNode } from 'react'

interface UserProfileLinkProps {
  username?: string
  walletAddress?: string
  children: ReactNode
  className?: string
  useAlias?: boolean // Use /@username alias instead of /profile/[wallet]
  [key: string]: any
}

/**
 * Reusable component for linking to user profiles
 * 
 * Route Architecture:
 * - PRIMARY ROUTE: /profile/[walletAddress] (permanent, always works)
 * - ALIAS: /@username (friendly URL, redirects to primary route)
 * 
 * Default behavior (useAlias=false):
 * - Links to /profile/[walletAddress] (recommended)
 * - This is the permanent route that never breaks
 * 
 * Alias behavior (useAlias=true):
 * - Links to /@username (friendly, shareable)
 * - Will redirect to /profile/[walletAddress]
 * 
 * @example
 * // Primary route (permanent, recommended)
 * <UserProfileLink walletAddress="5eykt4...">View Profile</UserProfileLink>
 * // Links to: /profile/5eykt4...
 * 
 * @example
 * // Alias route (friendly URL)
 * <UserProfileLink username="alice" useAlias>View Profile</UserProfileLink>
 * // Links to: /@alice → redirects to /profile/[walletAddress]
 */
export function UserProfileLink({ 
  username, 
  walletAddress, 
  children, 
  className,
  useAlias = false,
  ...props 
}: UserProfileLinkProps) {
  // Build the profile URL
  const getProfileUrl = () => {
    // If wallet address is provided (preferred)
    if (walletAddress) {
      return `/profile/${walletAddress}`
    }
    
    // If only username is provided and we want alias
    if (username && useAlias) {
      const cleanUsername = username.startsWith('@') ? username.slice(1) : username
      return `/@${cleanUsername}`
    }
    
    // If only username is provided (still use alias since we don't have wallet)
    if (username) {
      const cleanUsername = username.startsWith('@') ? username.slice(1) : username
      return `/@${cleanUsername}`
    }
    
    // Fallback
    return '/settings'
  }

  const profileUrl = getProfileUrl()

  return (
    <Link href={profileUrl} className={className} {...props}>
      {children}
    </Link>
  )
}

/**
 * Get profile URL for a user (utility function)
 * 
 * @param username - The user's username
 * @param walletAddress - The user's wallet address (preferred)
 * @param useAlias - Use /@username alias (default: false, use primary route)
 * @returns The profile URL
 */
export function getUserProfileUrl(
  username?: string, 
  walletAddress?: string,
  useAlias: boolean = false
): string {
  // Wallet address is preferred (primary route)
  if (walletAddress) {
    return `/profile/${walletAddress}`
  }
  
  // If only username is provided, use alias
  if (username) {
    const cleanUsername = username.startsWith('@') ? username.slice(1) : username
    return `/@${cleanUsername}`
  }
  
  return '/settings'
}

/**
 * Format username with @ prefix for display
 * @param username - The username to format
 * @returns Username with @ prefix
 */
export function formatUsername(username: string): string {
  if (!username) return ''
  return username.startsWith('@') ? username : `@${username}`
}
