'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BellIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWalletUser } from '@/hooks/useWalletUser'
import { fetchNotifications, markNotificationsRead, NotificationItem } from '@/lib/notifications'
import { withL2Auth, type ClobCredentials } from '@/lib/clob-client'
import { getStoredCredentials } from '@/lib/credentials'
import { logger } from '@/lib/frontend-logger'

export default function HeaderNotifications() {
  const { t } = useTranslation()
  const { user } = useWalletUser()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const walletAddress = user?.walletAddress
  const [credentials, setCredentials] = useState<ClobCredentials | null>(null)

  const loadNotifications = useCallback(async () => {
    if (!walletAddress) {
      setNotifications([])
      setUnreadCount(0)
      return
    }

    setIsLoading(true)
    try {
      const data = await fetchNotifications({ walletAddress })
      setNotifications(data.notifications)
      setUnreadCount(data.unreadCount)
    } catch (error) {
      logger.error('HeaderNotifications', 'Failed to load notifications', error)
    } finally {
      setIsLoading(false)
    }
  }, [walletAddress])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  // AUDIT FIX P2-1: Use centralized credential storage
  useEffect(() => {
    if (typeof window === 'undefined') return
    setCredentials(getStoredCredentials())
  }, [walletAddress])

  useEffect(() => {
    if (!walletAddress) return
    const interval = setInterval(loadNotifications, 30_000)
    return () => clearInterval(interval)
  }, [walletAddress, loadNotifications])

  const handleMarkAllRead = useCallback(async () => {
    if (!walletAddress || notifications.length === 0) return
    try {
      await markNotificationsRead({ walletAddress })
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
      setUnreadCount(0)
    } catch (error) {
      logger.error('HeaderNotifications', 'Failed to mark notifications read', error)
    }
  }, [walletAddress, notifications.length])

  const hasNotifications = notifications.length > 0
  const listTitle = useMemo(() => t('header.notifications'), [t])

  useEffect(() => {
    if (!walletAddress || !credentials?.apiKey || !credentials?.passphrase || !credentials?.secret) {
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const baseUrl =
      process.env.NEXT_PUBLIC_WS_URL || `${protocol}://${window.location.host}/ws`

    const socket = new WebSocket(baseUrl)
    wsRef.current = socket

    socket.onopen = async () => {
      try {
        const headers = await withL2Auth({
          apiKey: credentials.apiKey,
          passphrase: credentials.passphrase,
          secret: credentials.secret,
          address: walletAddress,
          method: 'SUBSCRIBE',
          path: `/ws/user/${walletAddress}`,
          body: '',
        })

        socket.send(
          JSON.stringify({
            action: 'subscribe',
            channel: `user:${walletAddress}`,
            auth: {
              apiKey: headers.poly_api_key,
              passphrase: headers.poly_passphrase,
              signature: headers.poly_signature,
              timestamp: headers.poly_timestamp,
              address: headers.poly_address,
            },
          })
        )
      } catch (error) {
        logger.error('HeaderNotifications', 'Failed to subscribe to notification channel', error)
      }
    }

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload?.event !== 'notification') return
        const notification: NotificationItem | undefined = payload?.data
        if (!notification?.id) return

        setNotifications((prev) => {
          const exists = prev.some((n) => n.id === notification.id)
          if (exists) return prev
          return [notification, ...prev].slice(0, 50)
        })
        if (!notification.isRead) {
          setUnreadCount((prev) => prev + 1)
        }
      } catch (error) {
        logger.error('HeaderNotifications', 'Failed to parse notification WS message', error)
      }
    }

    socket.onerror = (error) => {
      logger.error('HeaderNotifications', 'WebSocket error', error)
    }

    return () => {
      socket.close()
      wsRef.current = null
    }
  }, [walletAddress, credentials])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="relative"
          data-testid="notifications-button"
        >
          <BellIcon className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-xs font-medium text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[340px] max-h-[400px] overflow-hidden lg:w-[380px]"
        align="end"
        collisionPadding={32}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h3 className="text-sm font-semibold text-foreground">{listTitle}</h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={handleMarkAllRead}
            disabled={!hasNotifications || unreadCount === 0}
          >
            {t('header.markAllRead')}
          </Button>
        </div>

        <div className="max-h-[350px] overflow-y-auto">
          {!walletAddress && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t('settings.profile.loginRequired')}
            </div>
          )}

          {walletAddress && !hasNotifications && !isLoading && (
            <div className="p-4 text-center">
              <BellIcon className="mx-auto mb-2 size-8 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">{t('header.noNotifications')}</p>
            </div>
          )}

          {walletAddress && isLoading && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t('common.loading')}
            </div>
          )}

          {walletAddress && hasNotifications && (
            <div className="divide-y divide-border">
              {notifications.map((notification) => (
                <div key={notification.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          notification.isRead ? 'text-foreground' : 'text-primary'
                        }`}
                      >
                        {notification.title}
                      </p>
                      {notification.message && (
                        <p className="text-xs text-muted-foreground">{notification.message}</p>
                      )}
                      {notification.marketTitle && (
                        <p className="text-xs text-muted-foreground">
                          {notification.marketTitle}
                        </p>
                      )}
                    </div>
                    {!notification.isRead && (
                      <span className="mt-1 size-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
