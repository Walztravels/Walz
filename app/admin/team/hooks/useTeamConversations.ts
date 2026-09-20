'use client'

/**
 * Walz Team Hub V1 — the left-nav conversation list: joined conversations +
 * discoverable (not-yet-joined) PUBLIC channels, per GET
 * /api/admin/team/conversations's exact `{joined, discoverablePublic}`
 * shape (lib/team/conversations.ts's listConversationsForStaff).
 *
 * Self-contained realtime: subscribes to team_conversations UPDATE (bumped
 * on every new message — see the messages route's `updatedAt: new Date()`
 * touch) so the list re-sorts/refreshes live, paired with a 30s poll
 * fallback exactly per the product spec's "Realtime + poll safety net"
 * requirement. Does not depend on useTeamMessages or useTeamRealtimeMessages.
 *
 * DM display-name resolution: the list endpoint returns raw TeamConversation
 * rows — a DM's own `name` column is always null (only GROUP/CHANNEL set
 * it). Rather than add another new endpoint, this reuses the EXISTING
 * GET .../conversations/[id] detail route (already membership-gated) once
 * per not-yet-resolved DM, caches the result by conversation id, and
 * overlays the other participant's name onto that DM's `name` field for
 * display. Bounded and cached — never re-fetched once resolved, so the 30s
 * poll/realtime refresh never re-triggers it for a DM already resolved.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { teamFetch, extractErrorMessage, isSessionExpiredError } from '../lib/teamFetch'
import type { TeamConversationSummary } from '../types'

const POLL_INTERVAL_MS = 30_000

export interface UseTeamConversationsResult {
  joined: TeamConversationSummary[]
  discoverablePublic: TeamConversationSummary[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useTeamConversations(currentStaffId?: string | null): UseTeamConversationsResult {
  const [joined, setJoined] = useState<TeamConversationSummary[]>([])
  const [discoverablePublic, setDiscoverablePublic] = useState<TeamConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const firstLoadRef = useRef(true)
  const [dmNames, setDmNames] = useState<Record<string, string>>({})
  const dmResolveAttemptedRef = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (firstLoadRef.current) setLoading(true)
    setError(null)
    try {
      const res = await teamFetch('/api/admin/team/conversations')
      if (!res.ok) {
        setError(await extractErrorMessage(res, 'Could not load your conversations.'))
        return
      }
      const data = (await res.json()) as {
        joined?: TeamConversationSummary[]
        discoverablePublic?: TeamConversationSummary[]
      }
      setJoined(Array.isArray(data.joined) ? data.joined : [])
      setDiscoverablePublic(Array.isArray(data.discoverablePublic) ? data.discoverablePublic : [])
    } catch (e) {
      if (isSessionExpiredError(e)) return
      setError(e instanceof Error ? e.message : 'Could not load your conversations.')
    } finally {
      firstLoadRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!currentStaffId) return
    const unresolved = joined.filter(c => c.type === 'DM' && !dmResolveAttemptedRef.current.has(c.id))
    if (unresolved.length === 0) return
    for (const dm of unresolved) dmResolveAttemptedRef.current.add(dm.id)

    let cancelled = false
    void (async () => {
      const entries = await Promise.all(unresolved.map(async dm => {
        try {
          const res = await teamFetch(`/api/admin/team/conversations/${dm.id}`)
          if (!res.ok) return null
          const data = (await res.json()) as { conversation: { members: { staffId: string; name: string }[] } }
          const other = data.conversation.members.find(m => m.staffId !== currentStaffId)
          return other ? ([dm.id, other.name] as const) : null
        } catch {
          return null
        }
      }))
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const entry of entries) if (entry) next[entry[0]] = entry[1]
      if (Object.keys(next).length > 0) setDmNames(prev => ({ ...prev, ...next }))
    })()
    return () => { cancelled = true }
  }, [joined, currentStaffId])

  const joinedWithNames = joined.map(c => (c.type === 'DM' && dmNames[c.id] ? { ...c, name: dmNames[c.id] } : c))

  useEffect(() => {
    const pollId = setInterval(() => void load(), POLL_INTERVAL_MS)

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    let sb: SupabaseClient | null = null
    let channel: RealtimeChannel | null = null
    if (url && key) {
      sb = createClient(url, key)
      channel = sb
        .channel('team-hub-conversations')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_conversations' }, () => void load())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_conversation_members' }, () => void load())
        .subscribe()
    }

    return () => {
      clearInterval(pollId)
      if (sb && channel) sb.removeChannel(channel)
    }
  }, [load])

  return { joined: joinedWithNames, discoverablePublic, loading, error, refetch: load }
}
