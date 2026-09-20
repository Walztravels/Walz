'use client'

/**
 * Walz Team Hub V1 — everything needed to render ONE open conversation's
 * main feed: conversation detail (name/type/members/myMembership) plus its
 * message list/pagination/send state, wired to the realtime+poll nudge.
 * Bundled here so all three breakpoint trees (Desktop/Tablet/Mobile) share
 * one set of hook instances for the selected conversation instead of each
 * tier re-fetching independently.
 *
 * A 403 from GET .../conversations/[id] is treated as the normal "you're
 * not (or no longer) a member of this conversation" case per
 * lib/team/authz.ts's header comment (no super_admin bypass) — surfaced as
 * `forbidden`, not thrown as an error.
 */
import { useCallback, useEffect, useState } from 'react'
import { teamFetch, isSessionExpiredError } from '../lib/teamFetch'
import { useTeamMessages } from './useTeamMessages'
import { useTeamRealtimeMessages } from './useTeamRealtimeMessages'
import type { TeamConversationDetail } from '../types'

export interface UseSelectedConversationResult {
  conversation: TeamConversationDetail | null
  detailLoading: boolean
  detailError: boolean
  forbidden: boolean
  notFound: boolean
  refetchDetail: () => void
  messages: ReturnType<typeof useTeamMessages>
}

export function useSelectedConversation(
  conversationId: string | null,
  currentStaffId: string | null | undefined,
  currentStaffName: string | null | undefined,
): UseSelectedConversationResult {
  const [conversation, setConversation] = useState<TeamConversationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!conversationId) { setConversation(null); return }
    setDetailLoading(true)
    setDetailError(false)
    setForbidden(false)
    setNotFound(false)
    try {
      const res = await teamFetch(`/api/admin/team/conversations/${conversationId}`)
      if (res.status === 403) { setForbidden(true); return }
      if (res.status === 404) { setNotFound(true); return }
      if (!res.ok) { setDetailError(true); return }
      const data = (await res.json()) as { conversation: TeamConversationDetail }
      setConversation(data.conversation)
    } catch (e) {
      if (isSessionExpiredError(e)) return
      setDetailError(true)
    } finally {
      setDetailLoading(false)
    }
  }, [conversationId])

  useEffect(() => { void loadDetail() }, [loadDetail])

  const messages = useTeamMessages({ conversationId, currentStaffId, currentStaffName })
  useTeamRealtimeMessages(conversationId, messages.refreshNewest)

  return { conversation, detailLoading, detailError, forbidden, notFound, refetchDetail: loadDetail, messages }
}
