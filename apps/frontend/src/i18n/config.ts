// Supported locales and types (shared by client and server)
export const locales = ['en', 'zh', 'fr', 'ru', 'ar', 'es', 'ja', 'ko'] as const
export type Locale = (typeof locales)[number]

