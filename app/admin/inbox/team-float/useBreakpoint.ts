'use client'

/**
 * Floating Ask Team Workspace — own small breakpoint copy, exactly mirroring
 * app/admin/team/useBreakpoint.ts and app/admin/inbox/components/
 * quote-builder/useBreakpoint.ts's thresholds (mobile <768px, tablet
 * 768-1023px, desktop >=1024px). This codebase's convention is one small
 * per-feature copy rather than a shared hook — see either sibling file's
 * own header comment for why.
 */
import { useEffect, useState } from 'react'

export type FloatBreakpoint = 'mobile' | 'tablet' | 'desktop'

const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023.98px)'
const DESKTOP_QUERY = '(min-width: 1024px)'

function resolve(): FloatBreakpoint {
  if (typeof window === 'undefined') return 'mobile'
  if (window.matchMedia(DESKTOP_QUERY).matches) return 'desktop'
  if (window.matchMedia(TABLET_QUERY).matches) return 'tablet'
  return 'mobile'
}

export function useFloatBreakpoint(): FloatBreakpoint {
  const [bp, setBp] = useState<FloatBreakpoint>('mobile')

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
