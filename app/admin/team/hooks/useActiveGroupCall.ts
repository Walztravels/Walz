'use client'

/**
 * Walz Team Hub V1 — polls whether a GROUP/CHANNEL conversation currently
 * has a non-terminal call (STARTED/ACTIVE), powering the header's "Start
 * Call" vs "Join Call" state and the lightweight "X started a call — Join"
 * banner. Poll-only (10s), matching this codebase's established
 * poll-over-postgres_changes decision for Team Hub (see
 * useTeamRealtimeMessages.ts's header comment for why) — a call's
 * start/end is not latency-sensitive enough to need push, and this is a
 * much smaller, cheaper endpoint than the message feed's own poll.
 */
import { useCallback, useEffect, useState } from 'react'
import { teamFetch, isSessionExpiredError } from '../lib/teamFetch'
import type { ActiveGroupCall, ConversationType } from '../types'

const POLL_INTERVAL_MS = 10_000

export interface UseActiveGroupCallResult {
  call: ActiveGroupCall | null
  refetch: () => void
}

export function useActiveGroupCall(conversationId: string | null, conversationType: ConversationType | undefined): UseActiveGroupCallResult {
  const [call, setCall] = useState<ActiveGroupCall | null>(null)
  const isGroupOrChannel = conversationType === 'GROUP' || conversationType === 'CHANNEL'

  const refetch = useCallback(() => {
    if (!conversationId || !isGroupOrChannel) return
    void teamFetch(`/api/admin/team/conversations/${conversationId}/calls/active`)
      .then(res => res.ok ? res.json() : { call: null })
      .then((data: { call: ActiveGroupCall | null }) => setCall(data.call))
      .catch((e) => { if (!isSessionExpiredError(e)) setCall(null) })
  }, [conversationId, isGroupOrChannel])

  useEffect(() => {
    setCall(null)
    if (!conversationId || !isGroupOrChannel) return
    refetch()
    const id = setInterval(refetch, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [conversationId, isGroupOrChannel, refetch])

  return { call, refetch }
}
