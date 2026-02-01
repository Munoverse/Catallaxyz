import type { Locale } from '@/i18n/config'

export const languages: Record<Locale, { name: string; nativeName: string; flag: string }> = {
  en: { name: 'English', nativeName: 'English', flag: '🇺🇸' },
  zh: { name: 'Chinese', nativeName: 'Chinese', flag: '🇨🇳' },
  fr: { name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  ru: { name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  ar: { name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  es: { name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  ja: { name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  ko: { name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
}

