/**
 * Admin-wide Floating Team Hub — QA/accessibility review follow-up fixes.
 *
 * (1) The sidebar badge and the floating chrome's badge were each running
 *     their OWN independent 45s poller of the same endpoint, despite
 *     comments in both files claiming a single shared poll. Fixed by
 *     routing AdminSidebar through FloatingTeamHubContext's
 *     useSharedTeamHubUnreadCount(), which reads the provider's
 *     already-polled count and only falls back to an independent poll
 *     (disabled via hooks/useTeamHubUnreadCount.ts's `enabled` param) when
 *     the provider genuinely isn't mounted.
 * (2) The minimized bar's drag was clamped using the full window's
 *     geometry (720x640) instead of its own ~200x44 footprint, and was
 *     permanently undraggable once the underlying window had ever been
 *     maximized (isMaximized survives minimize by design). Covered at the
 *     pure-function level in team-hub-floating-geometry.test.ts
 *     (dragGeometry's clampSize override, shouldStartDrag's
 *     ignoreMaximizedGuard) — this file asserts the actual wiring uses
 *     both.
 * (3) Header/bar touch targets were 32px/28px despite the tablet-sheet-mode
 *     header comment claiming ">=44px, same as the normal header's
 *     buttons" — bumped to 44x44 everywhere, matching the established
 *     `min-w-[44px] min-h-[44px]` precedent from
 *     app/admin/team/components/Overlay.tsx's close button.
 */
import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

const ADMIN_SIDEBAR = 'components/admin/AdminSidebar.tsx'
const FLOATING_CONTEXT = 'app/admin/team/floating/FloatingTeamHubContext.tsx'
const FLOATING_PROVIDER = 'app/admin/team/floating/FloatingTeamHubProvider.tsx'
const UNREAD_HOOK = 'hooks/useTeamHubUnreadCount.ts'
const USE_FLOATING_DRAG = 'app/admin/team/floating/useFloatingDrag.ts'
const MINIMIZED_BAR = 'app/admin/team/floating/FloatingTeamHubMinimizedBar.tsx'
const FLOATING_WINDOW = 'app/admin/team/floating/FloatingTeamHubWindow.tsx'
const GEOMETRY = 'lib/team-hub-floating/geometry.ts'

describe('Fix 1 — the unread badge is a single shared poll, not two independent ones', () => {
  const sidebarSrc = read(ADMIN_SIDEBAR)
  const contextSrc = read(FLOATING_CONTEXT)
  const providerSrc = read(FLOATING_PROVIDER)
  const hookSrc = read(UNREAD_HOOK)

  it('AdminSidebar no longer calls useTeamHubUnreadCount() directly', () => {
    expect(sidebarSrc).not.toContain("from '@/hooks/useTeamHubUnreadCount'")
    expect(sidebarSrc).not.toMatch(/\buseTeamHubUnreadCount\s*\(/)
  })

  it('AdminSidebar instead reads the shared/optional accessor exposed by the floating provider', () => {
    expect(sidebarSrc).toContain('useSharedTeamHubUnreadCount')
    expect(sidebarSrc).toMatch(/const teamHubUnread = useSharedTeamHubUnreadCount\(\)/)
  })

  it('the shared accessor is exported from the floating provider module AdminSidebar imports from', () => {
    expect(providerSrc).toContain('useSharedTeamHubUnreadCount')
    expect(sidebarSrc).toMatch(/import\s*\{[^}]*useSharedTeamHubUnreadCount[^}]*\}\s*from\s*'@\/app\/admin\/team\/floating\/FloatingTeamHubProvider'/)
  })

  it('the shared accessor reads the context\'s own (already-polled) unreadCount when mounted', () => {
    expect(contextSrc).toMatch(/export function useSharedTeamHubUnreadCount[\s\S]*?return ctx \? ctx\.unreadCount : fallback/)
  })

  it('the shared accessor only falls back to an independent poll, and disables it whenever the shared context is present — never two live pollers at once', () => {
    expect(contextSrc).toMatch(/useTeamHubUnreadCount\(ctx === null\)/)
  })

  it('the underlying poller hook supports being disabled (the mechanism the fallback relies on)', () => {
    expect(hookSrc).toMatch(/function useTeamHubUnreadCount\(enabled = true\)/)
    expect(hookSrc).toContain('if (!enabled) return')
  })

  it('the floating window/minimized-bar chrome still reads unreadCount from the SAME context that now backs the sidebar', () => {
    // FloatingTeamHubContext's own poll instance is the one being shared —
    // both the window header and the minimized bar consume it via
    // useFloatingTeamHub()'s `unreadCount`, not a separate hook call.
    expect(read(FLOATING_WINDOW)).toMatch(/unreadCount/)
    expect(read(MINIMIZED_BAR)).toMatch(/unreadCount/)
    expect(read(FLOATING_WINDOW)).not.toContain('useTeamHubUnreadCount(')
    expect(read(MINIMIZED_BAR)).not.toContain('useTeamHubUnreadCount(')
  })
})

describe('Fix 2 — the minimized bar drags using its own footprint and ignores the maximized guard', () => {
  const dragHookSrc = read(USE_FLOATING_DRAG)
  const barSrc = read(MINIMIZED_BAR)
  const geometrySrc = read(GEOMETRY)

  it('useFloatingDrag accepts a clampSize override and an ignoreMaximizedGuard flag', () => {
    expect(dragHookSrc).toContain('clampSize?: { width: number; height: number }')
    expect(dragHookSrc).toContain('ignoreMaximizedGuard?: boolean')
  })

  it('useFloatingDrag passes the override through to dragGeometry (not just to the full-window default)', () => {
    expect(dragHookSrc).toMatch(/dragGeometry\(start\.geom, dx, dy, getContentAreaBounds\(\), clampSize\)/)
  })

  it('useFloatingDrag\'s guard delegates to shouldStartDrag with the caller-supplied ignoreMaximizedGuard, not a hardcoded isMaximized check', () => {
    expect(dragHookSrc).toContain('shouldStartDrag({ isMaximized, ignoreMaximizedGuard })')
  })

  it('the minimized bar passes its own real ~200x44 footprint and ignores the maximized guard', () => {
    expect(barSrc).toMatch(/useFloatingDrag\(\{[\s\S]*?clampSize:\s*\{\s*width:\s*BAR_WIDTH,\s*height:\s*BAR_HEIGHT\s*\}[\s\S]*?ignoreMaximizedGuard:\s*true[\s\S]*?\}\)/)
  })

  it('dragGeometry stays a pure function taking explicit size params (the fix is in the CALLER, not a stateful rewrite)', () => {
    expect(geometrySrc).toMatch(/export function dragGeometry\(\s*start: Geometry,\s*dx: number,\s*dy: number,\s*bounds: Bounds,\s*clampSize\?: \{ width: number; height: number \},?\s*\): Geometry/)
  })
})

describe('Fix 3 — touch targets reach 44x44, matching the Overlay.tsx precedent', () => {
  const windowSrc = read(FLOATING_WINDOW)
  const barSrc = read(MINIMIZED_BAR)

  it('every icon-only control in the floating window header is now min-w-[44px] min-h-[44px]', () => {
    expect(windowSrc).not.toContain('min-w-[32px]')
    expect(windowSrc).not.toContain('min-h-[32px]')
    // Window settings, Open Full Team Hub, Minimize, Maximize/Restore, Close
    const count = (windowSrc.match(/min-w-\[44px\] min-h-\[44px\]/g) ?? []).length
    expect(count).toBeGreaterThanOrEqual(5)
  })

  it('the minimized bar\'s close button reaches 44x44 using the same convention as Overlay.tsx\'s close button (min-w-[44px] min-h-[44px] with a compensating negative margin)', () => {
    expect(barSrc).not.toContain('min-w-[28px]')
    expect(barSrc).not.toContain('min-h-[28px]')
    expect(barSrc).toMatch(/min-w-\[44px\] min-h-\[44px\] -m-2/)
  })

  it('the established 44px precedent this fix follows really does exist in Overlay.tsx (sanity check the convention being matched)', () => {
    const overlaySrc = read('app/admin/team/components/Overlay.tsx')
    expect(overlaySrc).toContain('min-w-[44px] min-h-[44px] -m-2')
  })
})
