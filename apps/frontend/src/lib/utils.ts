import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const SCRIPT_OPEN_TAG = '<script'
const SCRIPT_CLOSE_TAG = '</script>'

function stripScriptTags(svg: string) {
  const lower = svg.toLowerCase()
  let cursor = 0
  let sanitized = ''

  while (cursor < svg.length) {
    const start = lower.indexOf(SCRIPT_OPEN_TAG, cursor)
    if (start === -1) {
      sanitized += svg.slice(cursor)
      break
    }

    sanitized += svg.slice(cursor, start)
    const end = lower.indexOf(SCRIPT_CLOSE_TAG, start)
    if (end === -1) {
      break
    }

    cursor = end + SCRIPT_CLOSE_TAG.length
  }

  return sanitized
}

export function sanitizeSvg(svg: string) {
  return stripScriptTags(svg)
    .replace(/on\w+=["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:(?!image\/)/gi, '')
}

export function calculateWinnings(amount: number, price: number): number {
  return amount / price - amount
}

