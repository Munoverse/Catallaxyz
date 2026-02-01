import { Skeleton } from '@/components/ui/skeleton'

export default function PlatformLayoutSkeleton() {
  return (
    <>
      <header className="sticky top-0 z-50 bg-background border-b">
        <div className="container flex h-14 items-center gap-4">
          <Skeleton className="h-6 w-32" />
          <div className="flex flex-1 items-center gap-2">
            <Skeleton className="h-9 w-full max-w-xl" />
          </div>
          <Skeleton className="h-9 w-20" />
        </div>
      </header>
      <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
        <aside className="w-64 shrink-0 border-r bg-background p-4">
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </aside>
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="container grid gap-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={i} className="h-[180px]" />
              ))}
            </div>
          </div>
        </main>
      </div>
    </>
  )
}

