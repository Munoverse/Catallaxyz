import { apiFetch } from '@/lib/api-client'

export interface NotificationItem {
  id: string
  type: string
  title: string
  message: string | null
  marketId?: string | null
  marketTitle?: string | null
  tradeId?: string | null
  commentId?: string | null
  isRead: boolean
  createdAt: string
}

export async function fetchNotifications({
  walletAddress,
  limit = 20,
  offset = 0,
}: {
  walletAddress: string
  limit?: number
  offset?: number
}) {
  const response = await apiFetch(
    `/api/notifications?walletAddress=${walletAddress}&limit=${limit}&offset=${offset}`,
    { method: 'GET' }
  )

  if (!response.ok) {
    throw new Error('Failed to fetch notifications')
  }

  const data = await response.json()
  return data.data as {
    notifications: NotificationItem[]
    unreadCount: number
    pagination: { limit: number; offset: number; hasMore: boolean }
  }
}

export async function markNotificationsRead({
  walletAddress,
  notificationIds,
}: {
  walletAddress: string
  notificationIds?: string[]
}) {
  const response = await apiFetch('/api/notifications/mark-read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, notificationIds }),
  })

  if (!response.ok) {
    throw new Error('Failed to mark notifications read')
  }

  return response.json()
}
