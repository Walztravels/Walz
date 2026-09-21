'use client'

/**
 * Admin-wide Floating Team Hub — the ONE shared poller for the Team Hub
 * unread badge, extracted out of components/admin/AdminSidebar.tsx (which
 * previously inlined this exact fetch/interval) so the sidebar badge and
 * the floating window's minimized-bar badge ("Team Hub · 3 new") read the
 * SAME poll instead of each running an independent interval against the
 * same endpoint — the product spec's "don't create duplicate independent
 * pollers for the same data" performance requirement.
 *
 * Poll-only (45s), matching the interval AdminSidebar already used. GET
 * /api/admin/team/unread-count is membership-scoped server-side (see that
 * route's own header comment) — this hook is never a source of
 * authorization, only a display count; see that route file and
 * app/admin/team/hooks/useTeamRealtimeMessages.ts's header comment for why
 * Team Hub deliberately has no browser-side realtime subscription.
 *
 * `enabled` (default true): pass `false` to skip the fetch/interval
 * entirely — used by FloatingTeamHubContext.tsx's useSharedTeamHubUnreadCount()
 * so that AdminSidebar (and anything else that has the floating provider's
 * already-polled count available) never spins up a SECOND independent
 * interval against this same endpoint. Without this, two mounted instances
 * of this hook (one in AdminSidebar, one in FloatingTeamHubContext) would
 * each poll on their own 45s timer, and the two badges could transiently
 * disagree for up to a full poll interval.
 */
import { useEffect, useState } from 'react'

const POLL_INTERVAL_MS = 45 * 1000

export function useTeamHubUnreadCount(enabled = true): number {
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/admin/team/unread-count')
        const data = (await res.json()) as { unreadCount?: number }
        if (!cancelled) setUnreadCount(data.unreadCount ?? 0)
      } catch {
        /* non-fatal — badge simply doesn't update this cycle */
      }
    }

    void fetchUnread()
    const id = setInterval(() => void fetchUnread(), POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled])

  return unreadCount
}
