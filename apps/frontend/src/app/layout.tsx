import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { LocaleWrapper } from '@/components/LocaleWrapper'
import { openSauceOne } from '@/lib/fonts'
import './globals.css'

export const metadata: Metadata = {
  title: {
    template: `${process.env.NEXT_PUBLIC_SITE_NAME || 'catallaxyz (Alpha)'} | %s`,
    default: `${process.env.NEXT_PUBLIC_SITE_NAME || 'catallaxyz (Alpha)'} | ${process.env.NEXT_PUBLIC_SITE_DESCRIPTION || 'Order to the Universe'}`,
  },
  description: process.env.NEXT_PUBLIC_SITE_DESCRIPTION || 'Order to the Universe',
  applicationName: process.env.NEXT_PUBLIC_SITE_NAME || 'catallaxyz (Alpha)',
  icons: {
    icon: '/favicon.ico',
    apple: '/logo.ico',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0E1A' }, // Deep brand purple-black
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${openSauceOne.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans antialiased" suppressHydrationWarning>
        <LocaleWrapper>
          {children}
        </LocaleWrapper>
      </body>
    </html>
  )
}
