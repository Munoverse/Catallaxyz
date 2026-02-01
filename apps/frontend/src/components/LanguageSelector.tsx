'use client'

import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { locales, type Locale } from '@/i18n/config'
import { languages as languageInfo } from '@/lib/locales-next-intl'
import { getLocaleFromStorage, saveLocaleToStorage } from '@/lib/get-locale-client'
import i18n from '@/i18n/i18n'
import { useState, useEffect } from 'react'

export default function LanguageSelector() {
  const { i18n: i18nInstance } = useTranslation()
  // Load current locale from storage
  const [locale, setLocale] = useState<Locale>(() => getLocaleFromStorage())
  const currentLanguage = languageInfo[locale]

  // Sync local state when i18n language changes
  useEffect(() => {
    const currentLang = i18nInstance.language as Locale
    if (locales.includes(currentLang) && currentLang !== locale) {
      setLocale(currentLang)
    }
  }, [i18nInstance.language, locale])

  // Initialize locale from storage
  useEffect(() => {
    const storedLocale = getLocaleFromStorage()
    if (storedLocale !== locale) {
      setLocale(storedLocale)
      if (i18nInstance.language !== storedLocale) {
        i18nInstance.changeLanguage(storedLocale)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLanguageChange = (newLocale: Locale) => {
    if (newLocale === locale) {
      return // No-op when selecting current language
    }

    if (typeof window === 'undefined') {
      return
    }

    // Persist language preference to storage and cookie
    saveLocaleToStorage(newLocale)

    // Update local state
    setLocale(newLocale)

    // Update i18next language
    i18nInstance.changeLanguage(newLocale)

    // Update html lang attribute
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLocale
    }

    // Update language without changing the URL
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 h-8 px-2"
          data-testid="language-selector-button"
          title={currentLanguage.nativeName}
        >
          <span className="text-lg leading-none">{currentLanguage.flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48" collisionPadding={16} align="end">
        {locales.map((code) => {
          const lang = languageInfo[code]
          return (
            <DropdownMenuItem
              key={code}
              onClick={() => handleLanguageChange(code)}
              className={locale === code ? 'bg-accent' : ''}
            >
              <span className="mr-2 text-lg">{lang.flag}</span>
              <span>{lang.nativeName}</span>
              <span className="ml-auto text-xs text-muted-foreground">{lang.name}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

