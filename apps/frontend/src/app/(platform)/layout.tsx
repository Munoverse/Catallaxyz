import { Suspense } from 'react'
import type { ReactNode } from 'react'
import Header from '@/components/Header'
import SidebarNavigation from '@/components/SidebarNavigation'
import PlatformLayoutSkeleton from '@/components/PlatformLayoutSkeleton'
import { FilterProvider } from '@/providers/FilterProvider'
import { Providers } from '@/providers/Providers'

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PlatformLayoutSkeleton />}>
      <Providers>
        <FilterProvider>
          <Suspense fallback={<PlatformLayoutSkeleton />}>
            <Header />
          </Suspense>
          <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
            <aside className="w-64 shrink-0 border-r bg-background p-4 overflow-y-auto">
              <Suspense fallback={<div className="h-full" />}>
                <SidebarNavigation />
              </Suspense>
            </aside>
            <main className="flex-1 min-w-0 overflow-y-auto">
              {children}
            </main>
          </div>
        </FilterProvider>
      </Providers>
    </Suspense>
  )
}

