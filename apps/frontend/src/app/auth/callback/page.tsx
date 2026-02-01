'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const REDIRECT_KEYS = ['redirect', 'next', 'returnTo'] as const

function getRedirectFromParams(params: URLSearchParams): string | null {
  for (const key of REDIRECT_KEYS) {
    const value = params.get(key)
    if (value) return value
  }
  return null
}

function normalizeRedirect(target: string | null): string {
  if (!target) return '/'
  return target.startsWith('/') ? target : '/'
}

function getStoredRedirect(): string | null {
  try {
    return sessionStorage.getItem('auth.redirect')
  } catch {
    return null
  }
}

function clearStoredRedirect() {
  try {
    sessionStorage.removeItem('auth.redirect')
  } catch {
    // no-op
  }
}

export default function AuthCallbackPage() {
  const router = useRouter()
  const [target, setTarget] = useState('/')

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash
    const hashParams = new URLSearchParams(hash)

    const redirect =
      getRedirectFromParams(searchParams) ??
      getRedirectFromParams(hashParams) ??
      getStoredRedirect()

    const safeTarget = normalizeRedirect(redirect)
    clearStoredRedirect()
    setTarget(safeTarget)

    const timer = window.setTimeout(() => {
      router.replace(safeTarget)
    }, 800)

    return () => window.clearTimeout(timer)
  }, [router])

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-12">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold">Completing sign-in…</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          If you are not redirected automatically, continue below.
        </p>
        <a
          href={target}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Continue
        </a>
      </div>
    </div>
  )
}
