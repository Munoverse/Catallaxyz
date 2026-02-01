import { Geist, Geist_Mono } from 'next/font/google'

export const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
})

export const geistMono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
})

// Keep compatibility with legacy font variable names
export const openSauceOne = geistSans

