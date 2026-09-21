/**
 * Admin-wide Floating Team Hub — lib/team-hub-floating/geometry.ts. Pure
 * math, no DOM: covers the "drag/resize/maximize never escapes the Admin
 * content area" invariants from the product spec, and their corresponding
 * QA scenarios (2) drag stays within bounds, (3) resize respects min/max,
 * (8) shrinking the viewport clamps a saved large-screen geometry back into
 * view, (9) maximize fills the content area exactly and restore returns
 * the exact prior normal geometry.
 */
import {
  clampPosition, clampSize, clampGeometry, defaultGeometry, maximizedGeometry,
  dragGeometry, resizeGeometry, geometriesEqual, shouldStartDrag,
  MIN_WIDTH, MIN_HEIGHT, DEFAULT_WIDTH, DEFAULT_HEIGHT,
  type Bounds, type Geometry,
} from '@/lib/team-hub-floating/geometry'

const DESKTOP_BOUNDS: Bounds = { left: 240, top: 64, right: 1440, bottom: 900 } // sidebar(240) + header(64) reserved

describe('clampSize', () => {
  it('never shrinks below MIN_WIDTH/MIN_HEIGHT', () => {
    const size = clampSize({ width: 100, height: 100 }, DESKTOP_BOUNDS)
    expect(size.width).toBe(MIN_WIDTH)
    expect(size.height).toBe(MIN_HEIGHT)
  })

  it('never grows past the content-area size ("max bounded to the Admin content area")', () => {
    const size = clampSize({ width: 5000, height: 5000 }, DESKTOP_BOUNDS)
    expect(size.width).toBe(DESKTOP_BOUNDS.right - DESKTOP_BOUNDS.left)
    expect(size.height).toBe(DESKTOP_BOUNDS.bottom - DESKTOP_BOUNDS.top)
  })

  it('passes an in-range size through unchanged', () => {
    const size = clampSize({ width: 720, height: 640 }, DESKTOP_BOUNDS)
    expect(size).toEqual({ width: 720, height: 640 })
  })

  it('falls back to MIN when the content area itself is smaller than MIN (never zero/negative)', () => {
    const tinyBounds: Bounds = { left: 0, top: 0, right: 300, bottom: 300 }
    const size = clampSize({ width: 720, height: 640 }, tinyBounds)
    expect(size.width).toBe(MIN_WIDTH)
    expect(size.height).toBe(MIN_HEIGHT)
  })
})

describe('clampPosition — never draggable off-screen', () => {
  const size = { width: 720, height: 640 }

  it('clamps a position above/left of the content area back to its top-left', () => {
    const pos = clampPosition({ x: -500, y: -500 }, size, DESKTOP_BOUNDS)
    expect(pos).toEqual({ x: DESKTOP_BOUNDS.left, y: DESKTOP_BOUNDS.top })
  })

  it('clamps a position below/right of the content area so the window stays fully visible', () => {
    const pos = clampPosition({ x: 9000, y: 9000 }, size, DESKTOP_BOUNDS)
    expect(pos.x).toBe(DESKTOP_BOUNDS.right - size.width)
    expect(pos.y).toBe(DESKTOP_BOUNDS.bottom - size.height)
  })

  it('leaves an already-in-bounds position untouched', () => {
    const pos = clampPosition({ x: 300, y: 100 }, size, DESKTOP_BOUNDS)
    expect(pos).toEqual({ x: 300, y: 100 })
  })
})

describe('defaultGeometry', () => {
  it('produces a geometry fully inside the content area, sized within the default range', () => {
    const g = defaultGeometry(DESKTOP_BOUNDS)
    expect(g.width).toBeLessThanOrEqual(DEFAULT_WIDTH)
    expect(g.height).toBeLessThanOrEqual(DEFAULT_HEIGHT)
    expect(g.x).toBeGreaterThanOrEqual(DESKTOP_BOUNDS.left)
    expect(g.y).toBeGreaterThanOrEqual(DESKTOP_BOUNDS.top)
    expect(g.x + g.width).toBeLessThanOrEqual(DESKTOP_BOUNDS.right)
    expect(g.y + g.height).toBeLessThanOrEqual(DESKTOP_BOUNDS.bottom)
  })
})

describe('maximizedGeometry — fills the Admin CONTENT area, not the whole browser', () => {
  it('exactly matches the content-area bounds', () => {
    const g = maximizedGeometry(DESKTOP_BOUNDS)
    expect(g).toEqual({
      x: DESKTOP_BOUNDS.left,
      y: DESKTOP_BOUNDS.top,
      width: DESKTOP_BOUNDS.right - DESKTOP_BOUNDS.left,
      height: DESKTOP_BOUNDS.bottom - DESKTOP_BOUNDS.top,
    })
  })

  it('never includes the reserved sidebar/header region', () => {
    const g = maximizedGeometry(DESKTOP_BOUNDS)
    expect(g.x).toBeGreaterThanOrEqual(240) // sidebar width reserved out of bounds.left
    expect(g.y).toBeGreaterThanOrEqual(64)  // header height reserved out of bounds.top
  })
})

describe('dragGeometry — scenario (2): drag stays within Admin viewport bounds', () => {
  const start: Geometry = { x: 300, y: 100, width: 720, height: 640 }

  it('applies an in-bounds delta directly', () => {
    const g = dragGeometry(start, 50, 20, DESKTOP_BOUNDS)
    expect(g).toEqual({ x: 350, y: 120, width: 720, height: 640 })
  })

  it('clamps a drag that would push the window off the top/left edge', () => {
    const g = dragGeometry(start, -10000, -10000, DESKTOP_BOUNDS)
    expect(g.x).toBe(DESKTOP_BOUNDS.left)
    expect(g.y).toBe(DESKTOP_BOUNDS.top)
    expect(g.width).toBe(720)
    expect(g.height).toBe(640)
  })

  it('clamps a drag that would push the window off the bottom/right edge', () => {
    const g = dragGeometry(start, 10000, 10000, DESKTOP_BOUNDS)
    expect(g.x + g.width).toBeLessThanOrEqual(DESKTOP_BOUNDS.right)
    expect(g.y + g.height).toBeLessThanOrEqual(DESKTOP_BOUNDS.bottom)
  })
})

describe('dragGeometry — minimized bar clamp-size override (QA fix: dragging the bar was clamped against the full window\'s size, not its own footprint)', () => {
  // Mirrors the real bug: `start` is the underlying NORMAL WINDOW's
  // geometry (720x640) — that's what the minimized bar's drag start
  // captures from context, since it shares the window's (x, y).
  const start: Geometry = { x: 300, y: 100, width: 720, height: 640 }
  const barSize = { width: 200, height: 44 } // the bar's own real footprint

  it('without an override (the pre-fix bug), a drag toward the edge is clamped as if it were still a 720x640 window — the bar can never reach the last ~520px of the content area', () => {
    const g = dragGeometry(start, 10000, 0, DESKTOP_BOUNDS)
    expect(g.x).toBe(DESKTOP_BOUNDS.right - 720)
  })

  it('with the bar\'s real ~200x44 footprint supplied, the bar CAN be dragged into what was previously an unreachable dead zone', () => {
    const g = dragGeometry(start, 10000, 0, DESKTOP_BOUNDS, barSize)
    expect(g.x).toBe(DESKTOP_BOUNDS.right - barSize.width)
    // strictly further right than the full-window clamp ever allowed —
    // this IS the previously-dead zone becoming reachable
    expect(g.x).toBeGreaterThan(DESKTOP_BOUNDS.right - 720)
  })

  it('the override never changes the RETURNED width/height — dragging the bar must not resize the underlying window', () => {
    const g = dragGeometry(start, 10000, 10000, DESKTOP_BOUNDS, barSize)
    expect(g.width).toBe(720)
    expect(g.height).toBe(640)
  })

  it('an in-bounds drag is identical whether or not a clampSize override is supplied', () => {
    const withoutOverride = dragGeometry(start, 10, 10, DESKTOP_BOUNDS)
    const withOverride = dragGeometry(start, 10, 10, DESKTOP_BOUNDS, barSize)
    expect(withoutOverride).toEqual(withOverride)
  })
})

describe('shouldStartDrag — QA fix: the minimized bar ignores the isMaximized guard, the full window\'s header does not', () => {
  it('the full window\'s header (no ignoreMaximizedGuard) is blocked while maximized', () => {
    expect(shouldStartDrag({ isMaximized: true })).toBe(false)
  })
  it('the full window\'s header can drag a normal (non-maximized) window', () => {
    expect(shouldStartDrag({ isMaximized: false })).toBe(true)
  })
  it('(fix) the minimized bar stays draggable even when the underlying window state says isMaximized: true — minimizing a previously-maximized window no longer makes the bar undraggable', () => {
    expect(shouldStartDrag({ isMaximized: true, ignoreMaximizedGuard: true })).toBe(true)
  })
  it('ignoreMaximizedGuard has no effect when not maximized', () => {
    expect(shouldStartDrag({ isMaximized: false, ignoreMaximizedGuard: true })).toBe(true)
  })
})

describe('resizeGeometry — scenario (3): resize respects min/max constraints', () => {
  const start: Geometry = { x: 400, y: 200, width: 720, height: 640 }

  it('grows from the "se" (bottom-right) handle, anchoring the top-left corner', () => {
    const g = resizeGeometry(start, 'se', 100, 50, DESKTOP_BOUNDS)
    expect(g.x).toBe(start.x)
    expect(g.y).toBe(start.y)
    expect(g.width).toBe(820)
    expect(g.height).toBe(690)
  })

  it('shrinking from "se" below MIN clamps to MIN_WIDTH/MIN_HEIGHT, not below', () => {
    const g = resizeGeometry(start, 'se', -10000, -10000, DESKTOP_BOUNDS)
    expect(g.width).toBe(MIN_WIDTH)
    expect(g.height).toBe(MIN_HEIGHT)
  })

  it('resizing from "w" (west) moves x and keeps the RIGHT edge fixed', () => {
    const rightEdge = start.x + start.width
    const g = resizeGeometry(start, 'w', -50, 0, DESKTOP_BOUNDS)
    expect(g.width).toBe(770)
    expect(g.x + g.width).toBe(rightEdge)
  })

  it('resizing from "w" past MIN keeps the right edge fixed even when clamped', () => {
    const rightEdge = start.x + start.width
    const g = resizeGeometry(start, 'w', 100000, 0, DESKTOP_BOUNDS) // dx positive shrinks width from the west handle
    expect(g.width).toBe(MIN_WIDTH)
    expect(g.x + g.width).toBe(rightEdge)
  })

  it('resizing from "n" (north) moves y and keeps the BOTTOM edge fixed', () => {
    const bottomEdge = start.y + start.height
    const g = resizeGeometry(start, 'n', 0, -30, DESKTOP_BOUNDS)
    expect(g.height).toBe(670)
    expect(g.y + g.height).toBe(bottomEdge)
  })

  it('never grows past the content-area bounds from any handle', () => {
    const g = resizeGeometry(start, 'se', 100000, 100000, DESKTOP_BOUNDS)
    expect(g.x + g.width).toBeLessThanOrEqual(DESKTOP_BOUNDS.right)
    expect(g.y + g.height).toBeLessThanOrEqual(DESKTOP_BOUNDS.bottom)
  })
})

describe('clampGeometry — scenario (8): shrinking the viewport re-clamps a saved large-screen geometry', () => {
  it('pulls a geometry saved on a large monitor back into a much smaller laptop viewport', () => {
    const savedOnLargeMonitor: Geometry = { x: 1600, y: 900, width: 900, height: 800 }
    const laptopBounds: Bounds = { left: 240, top: 64, right: 1024, bottom: 640 }

    const clamped = clampGeometry(savedOnLargeMonitor, laptopBounds)

    expect(clamped.x).toBeGreaterThanOrEqual(laptopBounds.left)
    expect(clamped.y).toBeGreaterThanOrEqual(laptopBounds.top)
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(laptopBounds.right)
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(laptopBounds.bottom)
  })

  it('is idempotent — clamping an already-valid geometry is a no-op', () => {
    const g: Geometry = { x: 300, y: 100, width: 720, height: 640 }
    expect(geometriesEqual(clampGeometry(g, DESKTOP_BOUNDS), g)).toBe(true)
  })
})

describe('geometriesEqual', () => {
  it('true for identical geometries, false for any differing field', () => {
    const a: Geometry = { x: 1, y: 2, width: 3, height: 4 }
    expect(geometriesEqual(a, { ...a })).toBe(true)
    expect(geometriesEqual(a, { ...a, x: 5 })).toBe(false)
  })
})
