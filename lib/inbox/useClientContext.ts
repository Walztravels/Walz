'use client'

// useClientContext — Inbox Action Centre shared client-context loader.
//
// Phase 1 (Agent A — Inbox Performance): before this hook, every one of the
// following 6 UI spots independently fetched
// GET /api/admin/inbox/conversations/:id/client-context on its own effect:
//   - the rail ClientInfo (CSS-hidden below lg, but ALWAYS MOUNTED whenever a
//     conversation is selected — its effect fires regardless of viewport)
//   - the mobile/tablet "Client details" overlay ClientInfo (DetailsDrawer)
//   - PaymentRequestDrawer, CreateQuoteDrawer, VisaFormDrawer,
//     ItineraryRequestDrawer — each re-fetched the SAME endpoint again on
//     open, for a conversation the rail had usually already resolved.
// Opening any drawer for the selected conversation could fire this fetch up
// to 3 times concurrently (rail + overlay + drawer) with zero coordination.
//
// This module is a tiny in-memory, module-scoped cache keyed by
// conversationId, with:
//   - a short TTL (cache hits skip the network entirely);
//   - dedup of concurrent fetches for the SAME conversation (siblings
//     mounted at the same tick share one in-flight request);
//   - a stale-response guard (a slower/older fetch, or one started before an
//     invalidation, can never overwrite fresher data or a hook instance that
//     has since moved on to a different conversation — same discipline as
//     PaymentRequestDrawer's loadSeqRef, applied both to the shared cache
//     entry AND to each hook instance's own "which conversation am I
//     currently showing" guard);
//   - explicit invalidation via `identityRefreshToken`, the EXISTING signal
//     already threaded through ClientInfo (bumped by the page after a
//     Find/Create client-identity link — see page.tsx's identityRefreshToken
//     state and ClientIdentityDrawer's onLinked). A token change forces a
//     fresh fetch regardless of TTL, for every consumer of that conversation.
//   - the same 401 → /admin/login redirect every other inbox fetch path
//     uses (incident 2026-09-18) — a stale UI must never retry forever
//     against an expired session.
//   - an awaitable `retry()` — VisaFormDrawer's create-case flow needs to
//     wait for the refreshed context (now showing the new case) before it
//     stops showing its own "Creating…" state, exactly like the previous
//     `await loadContext()` call it replaces.
//
// Consumers preserve their EXACT existing render states (loading/error/
// ready) — only where the data comes from changed, not what gets rendered.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ActionStatusSummary } from './action-status'

/** The context DTO's fields, as read across all 6 consumers (rail/overlay
 *  ClientInfo + the 4 action drawers). The server may return more; only
 *  fields actually consumed anywhere are declared here. */
export interface ClientContextSlice {
  resolution: 'VERIFIED' | 'LINKED' | 'HEURISTIC' | 'UNRESOLVED'
  application: { id?: string; walzRef: string; applicationType: string; status: string } | null
  link: { linkMethod: string; clientReference: string | null } | null
  user?: { name: string | null } | null
  clientAccount?: { name: string | null } | null
  prismaLead?: { name: string | null } | null
  contact?: { name: string | null; email: string | null; phone: string | null } | null
  /** Phase 3 (Agent D — Client Action Centre UX): additive, read-only
   *  per-action status summary — populated by the server, omitted (chip
   *  not rendered) per-action when null. See lib/inbox/action-status.ts. */
  actionStatus?: ActionStatusSummary
}

export type ClientContextState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; context: ClientContextSlice }

/** Cache entries stay fresh for this long before a normal (non-invalidated)
 *  re-render is willing to hit the network again. Short enough that staff
 *  never see meaningfully stale identity data; long enough to dedupe the
 *  rail + overlay + drawer burst this hook exists to fix. */
const TTL_MS = 30_000

interface CacheEntry {
  data: ClientContextSlice | null
  fetchedAt: number
  /** The identityRefreshToken this data (or in-flight fetch) was fetched for. */
  refreshToken: number
  /** Monotonic per-conversation fetch counter — guards against a stale
   *  fetch (started before an invalidation) overwriting fresher data. */
  seq: number
  inflight: Promise<ClientContextSlice> | null
}

const cache = new Map<number, CacheEntry>()

function getEntry(id: number): CacheEntry {
  let e = cache.get(id)
  if (!e) {
    e = { data: null, fetchedAt: 0, refreshToken: -1, seq: 0, inflight: null }
    cache.set(id, e)
  }
  return e
}

/** Force the next read for this conversation to hit the network, regardless
 *  of TTL. Does not touch an in-flight fetch that is already underway —
 *  that fetch simply completes as normal; it just won't be treated as a
 *  fresh cache hit by itself. Exported for callers outside a hook instance
 *  (none currently) — every hook's own `retry()` is the normal path. */
export function invalidateClientContext(conversationId: number): void {
  const e = cache.get(conversationId)
  if (e) { e.data = null; e.fetchedAt = 0 }
}

async function fetchClientContext(
  id: number,
  router: ReturnType<typeof useRouter>,
): Promise<ClientContextSlice> {
  const res = await fetch(`/api/admin/inbox/conversations/${id}/client-context`)
  // 401 = session expired — send staff to login instead of an unwinnable
  // retry loop (incident 2026-09-18). Every fetch path in the inbox must
  // replicate this exact branch.
  if (res.status === 401) { router.push('/admin/login'); throw new Error('session expired') }
  if (!res.ok) throw new Error(String(res.status))
  const data = await res.json() as { context?: ClientContextSlice }
  if (!data?.context?.resolution) throw new Error('bad payload')
  return data.context
}

export interface UseClientContextResult {
  state: ClientContextState
  /** Manual retry — bypasses the cache, refetches, and resolves once the
   *  new state has been applied (or the fetch has failed). */
  retry: () => Promise<void>
}

/**
 * Shared, deduped, cached loader for a conversation's client-context.
 *
 * @param conversationId Pass `null`/`undefined` to opt out entirely (no
 *   fetch at all) — e.g. a drawer that is mounted but not `open` yet.
 * @param identityRefreshToken The existing invalidation signal (default 0).
 *   A change forces a fresh network fetch for this conversation, bypassing
 *   any cached/in-flight data fetched under a previous token.
 */
export function useClientContext(
  conversationId: number | null | undefined,
  identityRefreshToken = 0,
): UseClientContextResult {
  const router = useRouter()
  const [state, setState] = useState<ClientContextState>({ phase: 'loading' })

  // Guards against two classes of staleness at once:
  //  - mountedRef: never setState after this hook instance has unmounted.
  //  - currentIdRef: whichever conversationId this instance is CURRENTLY
  //    asked to show. A fetch started for conversation A that resolves
  //    after the instance has moved on to B must never paint A's data over
  //    B (identity-confusion class) — set at the START of every load() call
  //    so a newer call always wins over an older one still in flight.
  const mountedRef  = useRef(true)
  const currentIdRef = useRef<number | null>(null)
  useEffect(() => () => { mountedRef.current = false }, [])

  const load = useCallback(async (id: number, token: number) => {
    currentIdRef.current = id
    const entry = getEntry(id)
    const stillCurrent = () => mountedRef.current && currentIdRef.current === id

    // Fresh cache hit for this token — serve instantly, no network call.
    if (entry.data && entry.refreshToken === token && Date.now() - entry.fetchedAt < TTL_MS) {
      if (stillCurrent()) setState({ phase: 'ready', context: entry.data })
      return
    }

    if (stillCurrent()) setState({ phase: 'loading' })

    // Dedup: reuse an in-flight fetch already running for this conversation
    // under the SAME token (concurrent mounts — rail + overlay + a drawer
    // all asking for the same conversation at once).
    let promise = entry.inflight
    if (!promise || entry.refreshToken !== token) {
      const mySeq = ++entry.seq
      entry.refreshToken = token
      promise = fetchClientContext(id, router)
      entry.inflight = promise
      promise
        .then(ctx => {
          // Only cache the result if nothing newer (another invalidation/
          // token bump for this SAME conversation) started since.
          if (entry.seq === mySeq) { entry.data = ctx; entry.fetchedAt = Date.now() }
        })
        .catch(() => { /* do not cache errors */ })
        .finally(() => { if (entry.inflight === promise) entry.inflight = null })
    }

    try {
      const ctx = await promise
      if (stillCurrent()) setState({ phase: 'ready', context: ctx })
    } catch {
      if (stillCurrent()) setState({ phase: 'error' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  useEffect(() => {
    if (conversationId == null) return
    void load(conversationId, identityRefreshToken)
  }, [conversationId, identityRefreshToken, load])

  const retry = useCallback(async () => {
    if (conversationId == null) return
    invalidateClientContext(conversationId)
    await load(conversationId, identityRefreshToken)
  }, [conversationId, identityRefreshToken, load])

  return { state, retry }
}
