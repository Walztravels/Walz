'use client'

/**
 * Floating Ask Team Workspace — hand-rolled pointer-based drag/resize.
 *
 * No drag/resize library was already installed in this codebase (the
 * @dnd-kit packages present are for sortable lists, not free-form window
 * geometry). A small pointer-events implementation was chosen over adding
 * react-rnd or similar: the geometry math itself (clamping to the Inbox's
 * own viewport, min/max sizing) already had to be hand-written as pure,
 * independently-tested functions in lib/team-float/state.ts regardless —
 * wrapping a third-party library would only have replaced the thin
 * event-wiring layer below, not the part that actually needed care, while
 * adding a new dependency and a second geometry model to keep in sync with
 * the accessibility "reset position" affordance. Uses the Pointer Events
 * API (mouse + touch + pen in one code path) with pointer capture so a fast
 * drag that leaves the handle element still tracks correctly.
 */
import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, [role="button"], [data-no-drag]'

export interface PointerDragHandlers {
  onPointerDown: (e: ReactPointerEvent) => void
  onPointerMove: (e: ReactPointerEvent) => void
  onPointerUp: (e: ReactPointerEvent) => void
  onPointerCancel: (e: ReactPointerEvent) => void
}

/**
 * A drag handle (e.g. the floating window's header). Ignores pointerdown
 * events that originate on an interactive control inside the handle (a
 * button/link) so minimize/maximize/close never also start a drag.
 */
export function useDragHandle(onDragBy: (dx: number, dy: number) => void, onDragEnd?: () => void): PointerDragHandlers {
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const draggingRef = useRef(false)

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    const target = e.target as HTMLElement
    if (target.closest(INTERACTIVE_SELECTOR)) return
    if (e.button !== undefined && e.button !== 0) return
    draggingRef.current = true
    lastRef.current = { x: e.clientX, y: e.clientY }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* unsupported in some test/jsdom envs */ }
    if (typeof document !== 'undefined') document.body.style.userSelect = 'none'
    e.preventDefault()
  }, [])

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!draggingRef.current || !lastRef.current) return
    const dx = e.clientX - lastRef.current.x
    const dy = e.clientY - lastRef.current.y
    lastRef.current = { x: e.clientX, y: e.clientY }
    if (dx !== 0 || dy !== 0) onDragBy(dx, dy)
  }, [onDragBy])

  const end = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = false
    lastRef.current = null
    if (typeof document !== 'undefined') document.body.style.userSelect = ''
    onDragEnd?.()
  }, [onDragEnd])

  // Force-end a drag if the window loses focus mid-drag without a
  // pointerup/pointercancel ever firing (e.g. an OS dialog interrupting).
  // `end()` already no-ops when no drag is active, so this is safe to leave
  // registered at all times rather than only while dragging.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.addEventListener('blur', end)
    return () => window.removeEventListener('blur', end)
  }, [end])

  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end }
}

/** One resize handle (edge or corner). Same pointer-capture shape as the drag handle. */
export function useResizeHandle(onResizeBy: (dx: number, dy: number) => void, onResizeEnd?: () => void): PointerDragHandlers {
  // Identical mechanics to useDragHandle — kept as a separate named hook so
  // call sites read as "this is a resize handle" rather than reusing the
  // drag hook's name, and so the interactive-control guard never
  // accidentally suppresses a resize starting from a handle that (unlike
  // the header) never contains buttons.
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const activeRef = useRef(false)

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return
    activeRef.current = true
    lastRef.current = { x: e.clientX, y: e.clientY }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* unsupported in some test/jsdom envs */ }
    if (typeof document !== 'undefined') document.body.style.userSelect = 'none'
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!activeRef.current || !lastRef.current) return
    const dx = e.clientX - lastRef.current.x
    const dy = e.clientY - lastRef.current.y
    lastRef.current = { x: e.clientX, y: e.clientY }
    if (dx !== 0 || dy !== 0) onResizeBy(dx, dy)
  }, [onResizeBy])

  const end = useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    lastRef.current = null
    if (typeof document !== 'undefined') document.body.style.userSelect = ''
    onResizeEnd?.()
  }, [onResizeEnd])

  // Same window-blur fallback as useDragHandle — see its comment.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.addEventListener('blur', end)
    return () => window.removeEventListener('blur', end)
  }, [end])

  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end }
}
