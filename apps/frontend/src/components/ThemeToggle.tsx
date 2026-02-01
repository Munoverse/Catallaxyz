'use client'

import { MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="default"
          size="icon"
          className="h-8 w-8"
        >
          <SunIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
        >
          <MoonIcon className="size-4" />
        </Button>
      </div>
    )
  }

  const isDark = theme === 'dark'

  return (
    <div className="flex items-center gap-1">
      <Button
        variant={!isDark ? 'default' : 'ghost'}
        size="icon"
        className="h-8 w-8"
        onClick={() => setTheme('light')}
      >
        <SunIcon className="size-4" />
      </Button>
      <Button
        variant={isDark ? 'default' : 'ghost'}
        size="icon"
        className="h-8 w-8"
        onClick={() => setTheme('dark')}
      >
        <MoonIcon className="size-4" />
      </Button>
    </div>
  )
}
