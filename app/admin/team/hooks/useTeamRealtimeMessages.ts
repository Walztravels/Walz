'use client'

/**
 * Walz Team Hub V1 — realtime message nudge for a single open conversation
 * (main feed or an open thread). Poll-only for V1 (25s interval).
 *
 * Security review finding (MEDIUM, functional, fixed here): an earlier
 * version also opened a `postgres_changes` subscription on `team_messages`
 * using the public anon key. `prisma/migrations/team_hub_v1_core.sql`
 * deliberately `REVOKE ALL ... FROM anon, authenticated` on every Team Hub
 * table (service-role-only access — see that file's RLS section) precisely
 * BECAUSE this app has no Supabase-Auth-issued per-staff JWT to scope RLS
 * to (`getAdminSession()` is a separate, cookie-based identity system) — so
 * that subscription could never actually receive an event; it degraded
 * silently to poll-only every time. Removed rather than left as dead code,
 * because leaving it created an attractive-nuisance: a future "fix" that
 * granted `anon`/`authenticated` SELECT on these tables to make it work
 * would leak every private DM/channel message (via `postgres_changes`
 * payloads) to anyone holding the public NEXT_PUBLIC_SUPABASE_ANON_KEY —
 * readable in any deployed JS bundle — since a client-supplied `filter`
 * (e.g. `conversation_id=eq.<id>`) is NOT an authorization boundary, just a
 * subscribe-time string any caller can set to any conversation id.
 *
 * DO NOT re-add a `postgres_changes` subscription on these tables without
 * first giving the browser a real per-staff credential RLS can key off of.
 * The correct fast-follow for genuine low-latency push is a Supabase
 * Realtime BROADCAST channel published server-side (via the service-role
 * client) only after the authz-checked REST write succeeds — that needs no
 * table-level grant to the browser at all.
 */
import { useEffect, useRef } from 'react'

const POLL_INTERVAL_MS = 25_000

export function useTeamRealtimeMessages(conversationId: string | null, onChange: () => void): void {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!conversationId) return
    const pollId = setInterval(() => onChangeRef.current(), POLL_INTERVAL_MS)
    return () => clearInterval(pollId)
  }, [conversationId])
}
