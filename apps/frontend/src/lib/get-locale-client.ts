'use client'

import { locales, type Locale } from '@/i18n/config'

// Re-export Locale type for consumers
export type { Locale }

const DEFAULT_LOCALE: Locale = 'en'
const LOCALE_STORAGE_KEY = 'i18nextLng'

/**
 * Read locale preference from cookie or localStorage.
 * Prefer localStorage (client) and fall back to document.cookie.
 */
export function getLocaleFromStorage(): Locale {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE
  }

  // Prefer localStorage
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored && locales.includes(stored as Locale)) {
      return stored as Locale
    }
  } catch (error) {
    // localStorage may be unavailable (private mode, etc.)
    console.warn('Failed to read from localStorage:', error)
  }

  // Fall back to cookies when localStorage is empty
  try {
    const cookies = document.cookie.split(';')
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=')
      if (name === LOCALE_STORAGE_KEY && value && locales.includes(value as Locale)) {
        // Also store in localStorage for next time
        try {
          localStorage.setItem(LOCALE_STORAGE_KEY, value)
        } catch {
          // Ignore localStorage write errors
        }
        return value as Locale
      }
    }
  } catch (error) {
    console.warn('Failed to read from cookies:', error)
  }

  // Finally, try browser language
  if (typeof navigator !== 'undefined' && navigator.language) {
    const browserLang = navigator.language.split('-')[0].toLowerCase()
    if (locales.includes(browserLang as Locale)) {
      return browserLang as Locale
    }
  }

  return DEFAULT_LOCALE
}

/**
 * Persist locale to localStorage and cookies.
 */
export function saveLocaleToStorage(locale: Locale): void {
  if (typeof window === 'undefined') {
    return
  }

  // Save to localStorage
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch (error) {
    console.warn('Failed to save to localStorage:', error)
  }

  // Save to cookie (via document.cookie)
  try {
    const maxAge = 60 * 60 * 24 * 365 // 1 year
    const expires = new Date(Date.now() + maxAge * 1000).toUTCString()
    document.cookie = `${LOCALE_STORAGE_KEY}=${locale}; path=/; max-age=${maxAge}; expires=${expires}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
  } catch (error) {
    console.warn('Failed to save to cookie:', error)
  }
}

/**
 * Read locale from storage (client components).
 */
export function useLocaleFromStorage(): Locale {
  // Keep this hook for compatibility and API consistency
  return getLocaleFromStorage()
}

