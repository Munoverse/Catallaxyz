import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from '../messages/en.json'
import zh from '../messages/zh.json'
import fr from '../messages/fr.json'
import ru from '../messages/ru.json'
import ar from '../messages/ar.json'
import es from '../messages/es.json'
import ja from '../messages/ja.json'
import ko from '../messages/ko.json'
import { locales, type Locale } from './config'

const resources = {
  en: { translation: en },
  zh: { translation: zh },
  fr: { translation: fr },
  ru: { translation: ru },
  ar: { translation: ar },
  es: { translation: es },
  ja: { translation: ja },
  ko: { translation: ko },
} as const

// Always use 'en' on the server to avoid hydration mismatch
const defaultLanguage = typeof window === 'undefined' ? 'en' : undefined

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: defaultLanguage, // Force 'en' on the server
    fallbackLng: 'en',
    defaultNS: 'translation',
    supportedLngs: locales,
    detection: {
      // Prefer localStorage, then cookie, then browser language
      // Skip detection on the server to avoid hydration mismatch
      order: typeof window === 'undefined' ? [] : ['localStorage', 'cookie', 'navigator'],
      lookupLocalStorage: 'i18nextLng',
      lookupCookie: 'i18nextLng',
      caches: ['localStorage', 'cookie'],
      // Cookie options
      cookieOptions: {
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 365, // 1 year
      },
    },
    interpolation: {
      escapeValue: false, // React already escapes output
    },
    react: {
      useSuspense: false, // Disable Suspense for client components
    },
  })

export default i18n

