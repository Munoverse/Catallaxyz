'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { StarIcon } from 'lucide-react'
import DOMPurify from 'dompurify'

// AUDIT FIX F-42: Sanitize SVG content to prevent XSS attacks
function sanitizeSvg(svgString: string | undefined): string | null {
  if (!svgString) return null
  
  // Configure DOMPurify to only allow safe SVG elements
  const sanitized = DOMPurify.sanitize(svgString, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['svg', 'path', 'g', 'circle', 'rect', 'line', 'polygon', 'polyline', 'ellipse', 'defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop'],
    ADD_ATTR: ['viewBox', 'fill', 'stroke', 'stroke-width', 'd', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'points', 'transform', 'class', 'id', 'offset', 'stop-color', 'stop-opacity', 'clip-path', 'mask'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link'],
    FORBID_ATTR: ['onclick', 'onerror', 'onload', 'onmouseover', 'onfocus', 'onblur'],
  })
  
  return sanitized || null
}

export default function HeaderLogo() {
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'catallaxyz (Alpha)'
  
  // Get and sanitize SVG logos from environment variables
  const lightLogoSvg = useMemo(
    () => sanitizeSvg(process.env.NEXT_PUBLIC_SITE_LOGO_SVG),
    []
  )
  const darkLogoSvg = useMemo(
    () => sanitizeSvg(process.env.NEXT_PUBLIC_SITE_LOGO_SVG_DARK),
    []
  )
  
  // Check if we have both logos for theme switching
  const hasBothLogos = lightLogoSvg && darkLogoSvg
  const hasAnyLogo = lightLogoSvg || darkLogoSvg

  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-2 font-semibold transition-opacity hover:opacity-80"
    >
      {/* SVG Logo with CSS-based theme switching */}
      {hasAnyLogo ? (
        <div className="relative size-8 shrink-0">
          {/* Light mode logo */}
          {lightLogoSvg && (
            <div
              className="absolute inset-0 text-primary [&>svg]:size-full dark:hidden"
              dangerouslySetInnerHTML={{ __html: lightLogoSvg }}
            />
          )}
          {/* Dark mode logo */}
          {darkLogoSvg && hasBothLogos && (
            <div
              className="absolute inset-0 hidden text-primary [&>svg]:size-full dark:block"
              dangerouslySetInnerHTML={{ __html: darkLogoSvg }}
            />
          )}
        </div>
      ) : (
        /* Fallback Star Icon */
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <StarIcon className="size-5 fill-primary text-primary" />
        </div>
      )}
      
      {/* Site name - primary brand color */}
      <span className="text-2xl font-bold text-primary">{siteName}</span>
    </Link>
  )
}

