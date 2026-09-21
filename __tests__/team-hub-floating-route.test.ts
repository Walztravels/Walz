/**
 * Admin-wide Floating Team Hub — lib/team-hub-floating/route.ts. Pure
 * decision logic behind:
 *   (1)  sidebar click on a non-Team-Hub Admin page opens the floating chrome
 *   (16) "Open Full Team Hub" navigates to /admin/team, carrying the
 *        selection across via the existing `?c=` deep-link convention
 *   (18) opening from /admin/inbox is a completely generic decision — the
 *        gate never inspects "is this the inbox", only "is this /admin/team"
 *   (19) mobile never mounts the floating chrome at all
 *   tablet sheet-mode selection
 */
import {
  isTeamHubFullPageRoute, shouldMountFloatingChrome, isTabletSheetMode,
  buildFullTeamHubHref, formatMinimizedLabel,
} from '@/lib/team-hub-floating/route'

describe('isTeamHubFullPageRoute', () => {
  it('true for the exact route and any sub-route', () => {
    expect(isTeamHubFullPageRoute('/admin/team')).toBe(true)
    expect(isTeamHubFullPageRoute('/admin/team/anything')).toBe(true)
  })
  it('false for every other Admin route, including a route that merely starts similarly', () => {
    expect(isTeamHubFullPageRoute('/admin/teams')).toBe(false)
    expect(isTeamHubFullPageRoute('/admin/inbox')).toBe(false)
    expect(isTeamHubFullPageRoute('/admin/visa-applications')).toBe(false)
  })
  it('false for null/undefined (no pathname yet)', () => {
    expect(isTeamHubFullPageRoute(null)).toBe(false)
    expect(isTeamHubFullPageRoute(undefined)).toBe(false)
  })
})

describe('shouldMountFloatingChrome', () => {
  it('(1) mounts on an ordinary Admin page once the staff member has opened it', () => {
    expect(shouldMountFloatingChrome({ deviceTier: 'desktop', pathname: '/admin/visa-applications', windowState: 'open' })).toBe(true)
    expect(shouldMountFloatingChrome({ deviceTier: 'desktop', pathname: '/admin/quotes', windowState: 'minimized' })).toBe(true)
  })

  it('never mounts before the staff member has opened it (closed by default)', () => {
    expect(shouldMountFloatingChrome({ deviceTier: 'desktop', pathname: '/admin/quotes', windowState: 'closed' })).toBe(false)
  })

  it('(18) opening from /admin/inbox is treated exactly like any other non-team Admin page — no Inbox-specific branch exists', () => {
    expect(shouldMountFloatingChrome({ deviceTier: 'desktop', pathname: '/admin/inbox', windowState: 'open' })).toBe(true)
  })

  it('never mounts on the full /admin/team page itself, regardless of windowState — the full page is always the sole owner there', () => {
    expect(shouldMountFloatingChrome({ deviceTier: 'desktop', pathname: '/admin/team', windowState: 'open' })).toBe(false)
    expect(shouldMountFloatingChrome({ deviceTier: 'desktop', pathname: '/admin/team', windowState: 'minimized' })).toBe(false)
  })

  it('(19) never mounts on mobile, even if windowState claims open (defence in depth against a stale/tampered state)', () => {
    expect(shouldMountFloatingChrome({ deviceTier: 'mobile', pathname: '/admin/quotes', windowState: 'open' })).toBe(false)
  })

  it('mounts on tablet, same as desktop, for a non-team route', () => {
    expect(shouldMountFloatingChrome({ deviceTier: 'tablet', pathname: '/admin/quotes', windowState: 'open' })).toBe(true)
  })
})

describe('isTabletSheetMode', () => {
  it('true only for tablet', () => {
    expect(isTabletSheetMode('tablet')).toBe(true)
    expect(isTabletSheetMode('desktop')).toBe(false)
    expect(isTabletSheetMode('mobile')).toBe(false)
  })
})

describe('buildFullTeamHubHref — (16) Open Full Team Hub handoff', () => {
  it('carries the selected conversation id via the existing `?c=` convention', () => {
    expect(buildFullTeamHubHref('conv-42')).toBe('/admin/team?c=conv-42')
  })
  it('URL-encodes an id containing special characters', () => {
    expect(buildFullTeamHubHref('conv 42/x')).toBe('/admin/team?c=conv%2042%2Fx')
  })
  it('links to the bare page when nothing is selected', () => {
    expect(buildFullTeamHubHref(null)).toBe('/admin/team')
  })
})

describe('formatMinimizedLabel', () => {
  it('shows no badge at zero unread', () => {
    expect(formatMinimizedLabel(0)).toBe('Team Hub')
  })
  it('shows the exact count under 100', () => {
    expect(formatMinimizedLabel(3)).toBe('Team Hub · 3 new')
  })
  it('caps at 99+ like every other unread badge in this codebase', () => {
    expect(formatMinimizedLabel(150)).toBe('Team Hub · 99+ new')
  })
})
