'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n/i18n'
import type { Locale } from '@/i18n/config'

export function I18nProvider({ 
  children, 
  locale 
}: { 
  children: ReactNode
  locale: Locale
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Update i18next when locale changes
    if (i18n.language !== locale) {
      i18n.changeLanguage(locale)
    }
  }, [locale])

  // Use default 'en' before hydration to avoid mismatch
  if (!mounted) {
    // Ensure initial language matches between server and client
    if (i18n.language !== 'en') {
      i18n.changeLanguage('en')
    }
  }

  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  )
}

