/**
 * Admin-wide Floating Team Hub — small pure decision helpers, pulled out of
 * FloatingTeamHubProvider.tsx/FloatingTeamHubWindow.tsx/
 * FloatingTeamHubMinimizedBar.tsx specifically so the mounting/handoff
 * logic that decides "floating window vs full page vs nothing at all" is
 * directly unit-testable without React/jsdom — matching this codebase's
 * existing convention (see geometry.ts's header comment).
 */

export type DeviceTier = 'mobile' | 'tablet' | 'desktop'
export type FloatingWindowState = 'closed' | 'open' | 'minimized'

export const TEAM_HUB_ROUTE_PREFIX = '/admin/team'

/** True for /admin/team and any of its sub-routes — the full-page Team Hub
 * experience, which must always be the SOLE owner of both the Team Hub
 * hooks' polling and the Twilio calling Device (see
 * calls/useTeamCallDevice.ts's "one Device per tab" requirement). */
export function isTeamHubFullPageRoute(pathname: string | null | undefined): boolean {
  const p = pathname ?? ''
  // Exact match or a real sub-route only — a bare `startsWith` would also
  // match an unrelated future route like `/admin/teams`, mirroring the
  // same exact-or-slash-prefixed convention AdminSidebar's own isActive()
  // already uses for every other nav item.
  return p === TEAM_HUB_ROUTE_PREFIX || p.startsWith(`${TEAM_HUB_ROUTE_PREFIX}/`)
}

/**
 * Whether the floating chrome (window/minimized bar + its own
 * TeamCallDeviceProvider) should mount at all:
 *   - never on mobile (<768px) — mobile gets the existing full native page
 *     via components/admin/MobileMoreDrawer.tsx's plain Link, unchanged.
 *   - never on the full /admin/team page itself — that page owns both the
 *     messaging hooks and the calling Device exclusively while active.
 *   - otherwise, only once the staff member has actually opened it
 *     (windowState !== 'closed').
 */
export function shouldMountFloatingChrome(params: {
  deviceTier: DeviceTier
  pathname: string | null | undefined
  windowState: FloatingWindowState
}): boolean {
  if (params.deviceTier === 'mobile') return false
  if (isTeamHubFullPageRoute(params.pathname)) return false
  return params.windowState !== 'closed'
}

/** Tablet (768–1023px): a fixed, non-draggable, non-resizable sheet filling
 * the Admin content area, rather than a small floating window — see
 * FloatingTeamHubWindow.tsx's `sheetMode` prop header comment for why a
 * fixed choice was made over a room-detection heuristic. */
export function isTabletSheetMode(deviceTier: DeviceTier): boolean {
  return deviceTier === 'tablet'
}

/**
 * The "Open Full Team Hub" handoff URL — carries the currently-selected
 * conversation id across via the SAME `?c=` deep-link convention
 * app/admin/team/lib/deepLink.ts already parses. The full page
 * independently re-validates membership server-side on every load
 * (GET /api/admin/team/conversations/[id] -> checkConversationMembership)
 * — this URL param is a convenience hint only, never trusted as
 * authorization by itself.
 */
export function buildFullTeamHubHref(conversationId: string | null): string {
  return conversationId ? `/admin/team?c=${encodeURIComponent(conversationId)}` : '/admin/team'
}

/** The minimized bar's label — "Team Hub" with no badge at zero unread,
 * "Team Hub · N new" otherwise, capped at "99+" like every other unread
 * badge in this codebase (AdminSidebar's inbox/link-request/Team Hub badges). */
export function formatMinimizedLabel(unreadCount: number): string {
  if (unreadCount <= 0) return 'Team Hub'
  const n = unreadCount > 99 ? '99+' : String(unreadCount)
  return `Team Hub · ${n} new`
}
