'use client'

/**
 * Admin-wide Floating Team Hub — top-level export mounted ONCE in
 * app/admin/layout.tsx, wrapping the ENTIRE Admin shell (sidebar + header +
 * page content + existing floating widgets) so:
 *
 *   1. FloatingTeamHubContext survives client-side navigation between
 *      ordinary Admin pages (the context Provider lives above <main>, only
 *      the page content inside <main> unmounts/remounts on navigation).
 *   2. components/admin/AdminSidebar.tsx — a SIBLING of this provider's
 *      other children in the layout tree, not a descendant of the window
 *      itself — can still read/drive the shared context (open/restore,
 *      "is it open" for the sidebar's indicator dot), since the context
 *      Provider wraps siblings, not just this file's own subtree.
 *
 * ONE Twilio Device per browser tab (see calls/useTeamCallDevice.ts's own
 * header comment) is preserved by NEVER mounting this file's
 * TeamCallDeviceProvider while the full /admin/team page is also mounted —
 * that page creates its own. Concretely:
 *   - On /admin/team itself: this renders nothing beyond the context
 *     (no window, no minimized bar, no TeamCallDeviceProvider) and force-
 *     closes any prior open/minimized state, so the full page is always
 *     the sole owner of both messaging state and the calling Device there.
 *   - Elsewhere: this owns the Device (mounted whenever the floating window
 *     is open OR minimized, so an active call survives minimize).
 *
 * ACCEPTED LIMITATION (documented, not fixed — Twilio/calling architecture
 * is explicitly out of scope for this feature): if a call is active via the
 * floating widget and the staff member then navigates to the full
 * /admin/team page (via the header's "Open Full Team Hub" button, browser
 * back/forward, or a bookmark), this provider's TeamCallDeviceProvider
 * unmounts (destroying its Device) a render before the full page's own
 * TeamCallDeviceProvider mounts a fresh one — the call drops. Minimizing,
 * moving, resizing, or navigating to any OTHER Admin page does not touch
 * the Device at all and does not drop an active call.
 *
 * Mobile (<768px): renders nothing at all — Team Hub's mobile experience
 * (components/admin/MobileMoreDrawer.tsx's existing plain
 * `<Link href="/admin/team">`) already opens the full native page, exactly
 * per the product spec's "no floating window at all" rule for mobile — no
 * change needed there.
 */
import { useEffect, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { FloatingTeamHubProviderState, useFloatingTeamHub } from './FloatingTeamHubContext'
import { FloatingTeamHubWindow } from './FloatingTeamHubWindow'
import { FloatingTeamHubMinimizedBar } from './FloatingTeamHubMinimizedBar'
import { TeamCallDeviceProvider } from '../calls/useTeamCallDevice'
import { IncomingCallOverlay } from '../calls/IncomingCallOverlay'
import { useBreakpoint } from '../useBreakpoint'
import { isTeamHubFullPageRoute, isTabletSheetMode, shouldMountFloatingChrome } from '@/lib/team-hub-floating/route'

function FloatingTeamHubMount() {
  const pathname = usePathname()
  const breakpoint = useBreakpoint()
  const { windowState, close } = useFloatingTeamHub()
  const isTeamRoute = isTeamHubFullPageRoute(pathname)

  // Landing on the full page always fully closes the floating state (not
  // just hides it) — the single source of truth for "am I on the full
  // page" is the route itself, so there is never a window where both this
  // provider's calling subtree and the full page's own could be mounted at
  // once (see file header).
  useEffect(() => {
    if (isTeamRoute) close()
  }, [isTeamRoute, close])

  if (!shouldMountFloatingChrome({ deviceTier: breakpoint, pathname, windowState })) return null

  const sheetMode = isTabletSheetMode(breakpoint)

  return (
    <TeamCallDeviceProvider>
      <IncomingCallOverlay />
      {windowState === 'open' && <FloatingTeamHubWindow sheetMode={sheetMode} />}
      {windowState === 'minimized' && <FloatingTeamHubMinimizedBar />}
    </TeamCallDeviceProvider>
  )
}

export function FloatingTeamHubProvider({ children }: { children: ReactNode }) {
  return (
    <FloatingTeamHubProviderState>
      {children}
      <FloatingTeamHubMount />
    </FloatingTeamHubProviderState>
  )
}

export { useFloatingTeamHub, useFloatingTeamHubOptional, useSharedTeamHubUnreadCount } from './FloatingTeamHubContext'
