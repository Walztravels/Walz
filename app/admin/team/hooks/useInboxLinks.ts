'use client'

/**
 * Walz Team Hub V1 — fetches this conversation's inbox clarification links
 * (see the new GET .../inbox-links list endpoint, added specifically for
 * this UI pass — app/api/admin/team/conversations/[id]/inbox-links/route.ts)
 * and resolves the single "active" one to surface in ConversationHeader's
 * banner and Composer's "Prepare Client Reply" gate: the most recently
 * created link overall, whatever its status (a RESOLVED one still renders,
 * just with a resolved chip — a staff member should still be able to see
 * and re-open the client conversation from history).
 */
import { useCallback, useEffect, useState } from 'react'
import { teamFetch, isSessionExpiredError } from '../lib/teamFetch'
import type { TeamInboxLink } from '../types'

export interface UseInboxLinksResult {
  links: TeamInboxLink[]
  activeLink: TeamInboxLink | null
  setActiveLink: (link: TeamInboxLink) => void
  refetch: () => void
}

export function useInboxLinks(conversationId: string | null): UseInboxLinksResult {
  const [links, setLinks] = useState<TeamInboxLink[]>([])

  const load = useCallback(async () => {
    if (!conversationId) { setLinks([]); return }
    try {
      const res = await teamFetch(`/api/admin/team/conversations/${conversationId}/inbox-links`)
      if (!res.ok) return
      const data = (await res.json()) as { links: TeamInboxLink[] }
      setLinks(Array.isArray(data.links) ? data.links : [])
    } catch (e) {
      if (isSessionExpiredError(e)) return
      // best-effort — the banner simply doesn't show on failure
    }
  }, [conversationId])

  useEffect(() => { void load() }, [load])

  const activeLink = links[0] ?? null

  function setActiveLink(link: TeamInboxLink) {
    setLinks(prev => {
      const idx = prev.findIndex(l => l.id === link.id)
      if (idx === -1) return [link, ...prev]
      const next = prev.slice()
      next[idx] = link
      return next
    })
  }

  return { links, activeLink, setActiveLink, refetch: load }
}
