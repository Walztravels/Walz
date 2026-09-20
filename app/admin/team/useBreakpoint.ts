'use client'

/**
 * Walz Team Hub V1 — shared breakpoint detector for the responsive
 * TeamWorkspaceShell (Desktop / Tablet / Mobile trees), mirroring the exact
 * structural precedent set by app/admin/inbox/components/quote-builder/
 * useBreakpoint.ts. Written as its own small copy rather than importing
 * that one directly — the Quote Builder's version gates its `active` param
 * on "the drawer was just opened by a click" (no SSR mismatch to guard
 * against there); the Team Hub page is a normal top-level route that can be
 * hit directly/refreshed, so this version is always active and defaults to
 * 'mobile' before first measurement (matching `lg` = 1024px as this
 * codebase's desktop-vs-tablet-or-below convention).
 */
import { useEffect, useState } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023.98px)'
const DESKTOP_QUERY = '(min-width: 1024px)'

function resolve(): Breakpoint {
  if (typeof window === 'undefined') return 'mobile'
  if (window.matchMedia(DESKTOP_QUERY).matches) return 'desktop'
  if (window.matchMedia(TABLET_QUERY).matches) return 'tablet'
  return 'mobile'
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>('mobile')

  useEffect(() => {
    setBp(resolve())
    const tabletMql = window.matchMedia(TABLET_QUERY)
    const desktopMql = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => setBp(resolve())
    tabletMql.addEventListener('change', onChange)
    desktopMql.addEventListener('change', onChange)
    return () => {
      tabletMql.removeEventListener('change', onChange)
      desktopMql.removeEventListener('change', onChange)
    }
  }, [])

  return bp
}
