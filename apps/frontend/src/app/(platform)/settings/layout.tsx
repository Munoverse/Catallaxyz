import type { Metadata } from 'next'
import SettingsSidebar from '@/app/(platform)/settings/_components/SettingsSidebar'

export const metadata: Metadata = {
  title: 'Settings | catallaxyz',
  description: 'Manage your account settings and preferences',
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="container py-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 lg:grid-cols-[240px_1fr] lg:gap-16">
          <SettingsSidebar />
          {children}
        </div>
      </div>
    </main>
  )
}
