'use client'

import { SearchIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { useRouter } from 'next/navigation'

export default function HeaderSearch() {
  const searchRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const { t } = useTranslation()
  const router = useRouter()

  useEffect(() => {
    function handleSlashShortcut(event: KeyboardEvent) {
      if (event.key !== '/') {
        return
      }

      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      const isEditable = tagName === 'input' || tagName === 'textarea' || target?.isContentEditable

      if (event.metaKey || event.ctrlKey || event.altKey || isEditable) {
        return
      }

      event.preventDefault()
      inputRef.current?.focus()
    }

    window.addEventListener('keydown', handleSlashShortcut)
    return () => {
      window.removeEventListener('keydown', handleSlashShortcut)
    }
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/markets?search=${encodeURIComponent(query)}`)
    }
  }

  return (
    <form
      className="relative ms-2 me-2 hidden flex-1 sm:ms-4 sm:me-0 sm:flex sm:max-w-xl"
      ref={searchRef}
      data-testid="header-search-container"
      onSubmit={handleSearch}
    >
      <SearchIcon className="absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        ref={inputRef}
        data-testid="header-search-input"
        placeholder={t('header.search.placeholder')}
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full pr-12 pl-9 text-sm"
      />
      <Kbd className="absolute top-1/2 right-3 hidden -translate-y-1/2 sm:inline-flex">/</Kbd>
    </form>
  )
}

