'use client'

import { useEffect, useState } from 'react'
import { getLocaleFromStorage } from '@/lib/get-locale-client'
import i18n from '@/i18n/i18n'

export function LocaleWrapper({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Read locale from storage and update i18next
    const locale = getLocaleFromStorage()
    if (i18n.language !== locale) {
      i18n.changeLanguage(locale)
    }

    // Update html lang attribute
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale
    }
  }, []) // Run once on mount

  // Ensure default language before hydration
  if (!mounted && typeof window !== 'undefined') {
    if (i18n.language !== 'en') {
      i18n.changeLanguage('en')
    }
  }

  return <>{children}</>
}

