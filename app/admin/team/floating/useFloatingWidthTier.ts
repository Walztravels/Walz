'use client'

/**
 * Admin-wide Floating Team Hub — internal responsive tier for the floating
 * window's OWN width (not the browser window's width — see
 * app/admin/team/useBreakpoint.ts for the device-tier hook that decides
 * floating-vs-sheet-vs-native-mobile at the Admin-shell level). A wide
 * floating window shows the conversation rail beside the pane ('wide'); a
 * narrower one collapses the rail behind a toggle ('narrow') per the
 * product spec's "base this on the floating window's own width" rule.
 */
import { useEffect, useState, type RefObject } from 'react'

export type FloatingWidthTier = 'narrow' | 'wide'

/** Below this content width, a 280px conversation rail would squeeze the
 * pane unusably thin — collapse the rail behind a toggle instead. Exported
 * as a pure function (see lib/team-hub-floating/geometry.ts's header
 * comment on why this codebase's Team Hub UI logic is factored out into
 * plain, directly-unit-testable functions) rather than inlined in the
 * ResizeObserver callback below.
 */
export const WIDE_THRESHOLD_PX = 620

export function resolveFloatingWidthTier(width: number): FloatingWidthTier {
  return width >= WIDE_THRESHOLD_PX ? 'wide' : 'narrow'
}

export function useFloatingWidthTier(containerRef: RefObject<HTMLElement | null>, fallbackWidth: number): FloatingWidthTier {
  const [tier, setTier] = useState<FloatingWidthTier>(resolveFloatingWidthTier(fallbackWidth))

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? fallbackWidth
      setTier(resolveFloatingWidthTier(width))
    })
    observer.observe(el)
    return () => observer.disconnect()
    // fallbackWidth intentionally excluded — only the live measured width should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef])

  return tier
}
