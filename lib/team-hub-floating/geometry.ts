/**
 * Admin-wide Floating Team Hub — pure geometry math for the floating
 * window's position/size (drag, resize, clamp-to-viewport, maximize).
 *
 * Deliberately framework-free (no React, no DOM) so every rule here —
 * "never draggable off-screen", "resize respects min/max", "maximize fills
 * the Admin content area, not the browser" — is unit-testable without a
 * browser/jsdom, matching this codebase's existing convention of testing
 * Team Hub UI logic (lib/pagination.ts, lib/mentionParse.ts,
 * lib/messageGrouping.ts, lib/deepLink.ts) as plain functions under
 * __tests__/team-ui-*.test.ts with testEnvironment: 'node'.
 */

export interface Geometry {
  x: number
  y: number
  width: number
  height: number
}

/** The draggable/resizable/maximizable region — the Admin CONTENT area
 * (excludes the sidebar and top/bottom chrome), in viewport coordinates. */
export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

export const MIN_WIDTH = 420
export const MIN_HEIGHT = 450
export const DEFAULT_WIDTH = 720
export const DEFAULT_HEIGHT = 640
/** Gap kept from the content-area edge when placing the default position. */
const DEFAULT_INSET = 24

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

function boundsWidth(bounds: Bounds): number {
  return Math.max(0, bounds.right - bounds.left)
}
function boundsHeight(bounds: Bounds): number {
  return Math.max(0, bounds.bottom - bounds.top)
}

/** Clamp a size to [MIN, content-area size] — "max bounded to the Admin
 * content area" per spec. Falls back to MIN if the content area is somehow
 * smaller than MIN (e.g. a very small tablet) rather than producing a
 * negative/zero-size window. */
export function clampSize(size: { width: number; height: number }, bounds: Bounds): { width: number; height: number } {
  const maxW = Math.max(MIN_WIDTH, boundsWidth(bounds))
  const maxH = Math.max(MIN_HEIGHT, boundsHeight(bounds))
  const width = Math.min(Math.max(size.width, MIN_WIDTH), maxW)
  const height = Math.min(Math.max(size.height, MIN_HEIGHT), maxH)
  return { width, height }
}

/** Clamp a top-left position so the (already-sized) window stays entirely
 * within bounds — "never draggable fully off-screen". */
export function clampPosition(
  pos: { x: number; y: number },
  size: { width: number; height: number },
  bounds: Bounds,
): { x: number; y: number } {
  const maxX = Math.max(bounds.left, bounds.right - size.width)
  const maxY = Math.max(bounds.top, bounds.bottom - size.height)
  const x = Math.min(Math.max(pos.x, bounds.left), maxX)
  const y = Math.min(Math.max(pos.y, bounds.top), maxY)
  return { x, y }
}

/** Clamp a full geometry (size first, then position against the clamped
 * size) into bounds. Used on mount, on viewport resize, and whenever a
 * persisted/tampered geometry needs re-validating before being trusted. */
export function clampGeometry(geom: Geometry, bounds: Bounds): Geometry {
  const size = clampSize(geom, bounds)
  const pos = clampPosition(geom, size, bounds)
  return { ...pos, ...size }
}

/** Default normal-mode geometry: bottom-right of the content area, inset,
 * sized per DEFAULT_WIDTH/HEIGHT but never larger than the content area. */
export function defaultGeometry(bounds: Bounds): Geometry {
  const size = clampSize({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }, bounds)
  const rawPos = { x: bounds.right - size.width - DEFAULT_INSET, y: bounds.bottom - size.height - DEFAULT_INSET }
  const pos = clampPosition(rawPos, size, bounds)
  return { ...pos, ...size }
}

/** Maximized geometry fills the Admin CONTENT area exactly — never the
 * whole browser viewport (sidebar/top-nav stay visible). */
export function maximizedGeometry(bounds: Bounds): Geometry {
  return { x: bounds.left, y: bounds.top, width: boundsWidth(bounds), height: boundsHeight(bounds) }
}

/** Apply a drag delta to a starting geometry, clamped into bounds.
 *
 * `clampSize` (optional): the size to clamp the resulting POSITION against,
 * defaulting to `start`'s own width/height. Pass this when the thing
 * actually being dragged is NOT the full window itself — e.g. the
 * minimized bar (FloatingTeamHubMinimizedBar.tsx), which drags the same
 * underlying (x, y) as the normal window but renders at its own much
 * smaller ~200x44 footprint. Without an override, a caller whose on-screen
 * size differs from `start.width`/`start.height` gets clamped against the
 * WRONG size — e.g. the bar could never reach the last
 * (windowWidth − 200)px of the content area because it was being clamped
 * as if it were the full 720px-wide window.
 *
 * The returned geometry's width/height are always `start`'s own (never
 * `clampSize`) — dragging never changes size, regardless of which size was
 * used to clamp the position. */
export function dragGeometry(
  start: Geometry,
  dx: number,
  dy: number,
  bounds: Bounds,
  clampSize?: { width: number; height: number },
): Geometry {
  const size = clampSize ?? { width: start.width, height: start.height }
  const pos = clampPosition({ x: start.x + dx, y: start.y + dy }, size, bounds)
  return { ...pos, width: start.width, height: start.height }
}

/**
 * Whether a pointerdown on a drag surface should actually start a drag,
 * given the underlying window's `isMaximized` flag.
 *
 * The full window's header respects this guard (a maximized window is not
 * draggable by design — see FloatingTeamHubWindow.tsx). The minimized bar
 * does NOT: minimizing preserves `isMaximized` (so restoring returns to the
 * same prior state — see windowState.ts), which means a window that was
 * maximized before being minimized would otherwise leave its minimized bar
 * permanently undraggable, even though the bar is a distinct, always-
 * potentially-draggable UI element unrelated to whether the (currently
 * hidden) full window would maximize/restore correctly. Callers that are
 * NOT the full window's own header pass `ignoreMaximizedGuard: true`. */
export function shouldStartDrag(params: { isMaximized: boolean; ignoreMaximizedGuard?: boolean }): boolean {
  if (params.isMaximized && !params.ignoreMaximizedGuard) return false
  return true
}

/** Apply a resize delta from a given handle to a starting geometry, clamped
 * to [MIN, content-area] size and re-clamped into bounds. For a
 * west/north-anchored handle, the OPPOSITE edge stays fixed (resizing from
 * the left edge moves x, not just width). */
export function resizeGeometry(start: Geometry, handle: ResizeHandle, dx: number, dy: number, bounds: Bounds): Geometry {
  let width = start.width
  let height = start.height
  if (handle.includes('e')) width = start.width + dx
  if (handle.includes('w')) width = start.width - dx
  if (handle.includes('s')) height = start.height + dy
  if (handle.includes('n')) height = start.height - dy

  const size = clampSize({ width, height }, bounds)

  let x = start.x
  let y = start.y
  if (handle.includes('w')) x = start.x + (start.width - size.width)
  if (handle.includes('n')) y = start.y + (start.height - size.height)

  const pos = clampPosition({ x, y }, size, bounds)
  return { ...pos, ...size }
}

export function geometriesEqual(a: Geometry, b: Geometry): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}
