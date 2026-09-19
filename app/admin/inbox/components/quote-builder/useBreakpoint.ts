'use client'

// QUOTE BUILDER V1.2 — shared breakpoint detector for the responsive
// workspace (Desktop / Tablet / Mobile trees). Client-only: the drawer this
// feeds is always mounted after a user click (open starts false), so there
// is no SSR/hydration mismatch to guard against — matchMedia is available
// by the time this ever renders a real breakpoint.
//
// Boundaries chosen to match the V1.2 brief's required test widths
// (375/390/430 = mobile, 768 = tablet, 1024/1280/1440 = desktop):
//   < 768px       -> mobile
//   768–1023px    -> tablet
//   >= 1024px     -> desktop
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

export function useBreakpoint(active: boolean): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => (active ? resolve() : 'mobile'))

  useEffect(() => {
    if (!active) return
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
  }, [active])

  return bp
}
