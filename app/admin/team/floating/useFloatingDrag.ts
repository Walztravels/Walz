'use client'

/**
 * Admin-wide Floating Team Hub — header-only drag handling. Pointer Events
 * (not mouse events) so the same code path handles touch on tablet.
 * "Interactive buttons inside the header must not trigger dragging" is
 * enforced by ignoring a pointerdown whose target is inside a button/link/
 * input/control — see the `closest(...)` check below.
 *
 * Two callers share this hook with different needs:
 *   - FloatingTeamHubWindow.tsx's header drags the FULL WINDOW — uses the
 *     defaults (clamp against the window's own geometry, respect the
 *     isMaximized guard: a maximized window is not draggable by design).
 *   - FloatingTeamHubMinimizedBar.tsx drags the much smaller minimized bar,
 *     which shares the window's (x, y) but renders at its own ~200x44
 *     footprint and must stay draggable even when the underlying window's
 *     isMaximized flag is true (minimizing preserves that flag so restoring
 *     returns to the same state — see windowState.ts; it says nothing about
 *     whether the BAR should be draggable). It passes `clampSize` (its own
 *     real size) and `ignoreMaximizedGuard: true`.
 */
import { useCallback, useRef, useState } from 'react'
import { dragGeometry, shouldStartDrag, type Geometry } from '@/lib/team-hub-floating/geometry'
import { useFloatingTeamHub } from './FloatingTeamHubContext'

const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, [role="button"], [data-no-drag]'

export interface UseFloatingDragOptions {
  /** The size to clamp the dragged POSITION against — defaults to the
   * context's own (normal window) geometry size. Pass the caller's actual
   * on-screen footprint when it differs from the full window (see file
   * header). Never affects the returned width/height — dragging never
   * resizes anything, see lib/team-hub-floating/geometry.ts's dragGeometry. */
  clampSize?: { width: number; height: number }
  /** Skip the `isMaximized` guard (see file header for why the minimized
   * bar needs this and the full window's header does not). */
  ignoreMaximizedGuard?: boolean
}

export function useFloatingDrag(options: UseFloatingDragOptions = {}) {
  const { clampSize, ignoreMaximizedGuard = false } = options
  const { geometry, isMaximized, previewGeometry, commitGeometry, getContentAreaBounds } = useFloatingTeamHub()
  const [isDragging, setIsDragging] = useState(false)
  const startRef = useRef<{ pointerId: number; startX: number; startY: number; geom: Geometry } | null>(null)

  const onHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!shouldStartDrag({ isMaximized, ignoreMaximizedGuard })) return
    if ((e.target as HTMLElement).closest?.(INTERACTIVE_SELECTOR)) return
    startRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, geom: geometry }
    setIsDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [geometry, isMaximized, ignoreMaximizedGuard])

  const onHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current
    if (!start || start.pointerId !== e.pointerId) return
    const dx = e.clientX - start.startX
    const dy = e.clientY - start.startY
    previewGeometry(dragGeometry(start.geom, dx, dy, getContentAreaBounds(), clampSize))
  }, [getContentAreaBounds, previewGeometry, clampSize])

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current
    if (!start || start.pointerId !== e.pointerId) return
    startRef.current = null
    setIsDragging(false)
    const dx = e.clientX - start.startX
    const dy = e.clientY - start.startY
    commitGeometry(dragGeometry(start.geom, dx, dy, getContentAreaBounds(), clampSize))
  }, [commitGeometry, getContentAreaBounds, clampSize])

  return {
    isDragging,
    onHeaderPointerDown,
    onHeaderPointerMove,
    onHeaderPointerUp: endDrag,
    onHeaderPointerCancel: endDrag,
  }
}
