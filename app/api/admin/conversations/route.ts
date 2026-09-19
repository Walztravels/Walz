import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { adminChatwootOrNull } from '@/lib/chatwoot/config'
import {
  checkInboxPermission, canViewAllConversations,
  canAccessConversation, resolveChatwootAgentId,
} from '@/lib/inbox/authz'
import { mapChatwootFailure } from '@/lib/inbox/provider'

export const dynamic = 'force-dynamic'

// Fail closed (INBOX-0S.1): no non-null assertion on the token — when no
// Chatwoot token is configured every handler returns a controlled 503.
const cwCfg = adminChatwootOrNull()
const CW_BASE    = cwCfg?.base ?? ''
const CW_TOKEN   = cwCfg?.token ?? ''
const CW_ACCOUNT = cwCfg?.accountId ?? '1'

// Chatwoot returns at most 25 conversations per page. Fetching only page 1
// silently hid every conversation past the 25 most recently active — staff
// (including super admins) "not seeing all messages". Aggregate pages up to
// a sane cap so the admin inbox always has the full open list.
const PAGE_SIZE = 25
const MAX_PAGES = 8   // up to 200 conversations per status — hard ceiling, never exceeded

// Phase 1 (Agent A — Inbox Performance): walking all MAX_PAGES on EVERY
// call — including every 5s poll tick from every connected staff member —
// was unconditional. DEFAULT_MAX_PAGES is the fast depth for an initial
// load or a fresh tab switch; a caller (the inbox page's "Load more" /
// per-tick refresh) may request more via ?maxPages=, but never more than
// MAX_PAGES regardless of what's asked for.
const DEFAULT_MAX_PAGES = 2   // 50 conversations on first paint

// P1 hotfix (2026-09-19): the 2026-09-17 incident's root cause included
// Chatwoot fetches here with NO timeout at all, so a degraded upstream
// container hung requests instead of failing fast. Matches the pattern
// already used in lib/inbox/authz.ts (AbortSignal.timeout).
const CW_FETCH_TIMEOUT_MS = 8000

interface CWListEnvelope {
  data?: { meta?: Record<string, unknown>; payload?: unknown[] }
  meta?: Record<string, unknown>
  payload?: unknown[]
}

type FetchPageResult =
  | { ok: true; data: CWListEnvelope }
  | { ok: false; status: 'network' }
  | { ok: false; status: number }

export async function GET(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!cwCfg) return NextResponse.json({ error: 'Messaging service is not configured.' }, { status: 503 })
  const authz = checkInboxPermission(session, 'inbox_view')
  if (!authz.allowed) {
    // P1 hotfix: this was the one inbox route left logging nothing on a
    // permission denial — every sibling route does. Also gives staff a
    // failure class distinct from a provider outage (see failureResponse
    // below), instead of both looking identical to the browser.
    console.error('[conversations] permission denied for', session.email, authz.error)
    return NextResponse.json({ error: authz.error }, { status: authz.status })
  }

  const viewAll = canViewAllConversations(session)
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'open'
  // Fix 4 (P1 hotfix, 2026-09-19): assignee_type is a Chatwoot-side request
  // hint only — the REAL scope enforcement is the ownership filter applied
  // below. Staff without inbox_view_all get that filter unconditionally and
  // can never widen their queue by supplying assignee_type=all/unassigned/
  // anything else directly against this API, so the hint is simply not
  // honored for them at all. View-all staff (managers/admins/super admins)
  // keep their existing passthrough unchanged.
  const assigneeType = viewAll ? (searchParams.get('assignee_type') || '') : ''

  // Explicit page request → single-page passthrough (legacy behavior)
  const explicitPage = searchParams.get('page')

  // Phase 1 (Agent A): bound how many pages THIS call walks. Never trust the
  // caller past MAX_PAGES — clamp regardless of what's requested, and fall
  // back to the fast default for anything not a positive integer.
  const requestedMaxPages = ((): number => {
    const raw = Number(searchParams.get('maxPages'))
    if (!Number.isFinite(raw) || raw < 1) return DEFAULT_MAX_PAGES
    return Math.min(Math.floor(raw), MAX_PAGES)
  })()

  async function fetchPage(page: number): Promise<FetchPageResult> {
    const params = new URLSearchParams({ status, page: String(page) })
    if (assigneeType) params.set('assignee_type', assigneeType)
    const res = await fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations?${params}`, {
      headers: { api_access_token: CW_TOKEN },
      signal: AbortSignal.timeout(CW_FETCH_TIMEOUT_MS),
    }).catch((e) => { console.error('[conversations] Chatwoot unreachable:', e instanceof Error ? e.message.slice(0, 120) : e); return null })
    if (!res) return { ok: false, status: 'network' }
    if (!res.ok) {
      // Incident 2026-09-17: upstream failures were invisible in logs.
      console.error(`[conversations] Chatwoot upstream ${res.status} (page ${page})`)
      return { ok: false, status: res.status }
    }
    const json = await res.json().catch(() => null)
    if (json === null) {
      console.error('[conversations] Chatwoot non-JSON response')
      return { ok: false, status: 'network' }
    }
    return { ok: true, data: json as CWListEnvelope }
  }

  // Provider-failure mapping (P1 hotfix): routed through the SAME
  // mapChatwootFailure helper the [id] routes already use, instead of one
  // fixed generic string regardless of cause — a network/timeout failure
  // reads differently from an upstream non-2xx status.
  function failureResponse(status: 'network' | number) {
    const mapped = status === 'network'
      ? { status: 502, error: 'Could not load conversations — messaging service unreachable. Please try again.' }
      : mapChatwootFailure(status, 'Loading conversations')
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  // Fix 4 (P1 hotfix): ordinary staff (no inbox_view_all) get Mine only from
  // this list endpoint — never Unassigned, another agent's conversations, or
  // an unrestricted All queue, no matter what status/assignee_type/other
  // query param the request carries. canAccessConversation(..., false) also
  // lets an unassigned conversation (assigneeId === null) through — that
  // rule is correct and stays UNTOUCHED for per-conversation checks (an
  // agent may still open/reply/assign an unassigned conversation
  // individually via its own [id]). Here we apply it MORE STRICTLY by
  // additionally requiring a non-null assignee, narrowing the predicate to
  // exactly "mine" for list results only.
  function scopeToMine(assigneeId: number | null, myAgentId: number): boolean {
    return assigneeId != null && canAccessConversation(assigneeId, myAgentId, false)
  }

  if (explicitPage) {
    const result = await fetchPage(Number(explicitPage) || 1)
    if (!result.ok) return failureResponse(result.status)
    const inner = (result.data?.data ?? result.data) as { meta?: Record<string, unknown>; payload?: unknown[] }
    if (!viewAll) {
      if (Array.isArray(inner?.payload)) {
        const myAgentId = await resolveChatwootAgentId(session.email)
        inner.payload = inner.payload.filter((c) => {
          const conv = c as { meta?: { assignee?: { id?: number } | null }; assignee?: { id?: number } | null }
          const assigneeId = conv.meta?.assignee?.id ?? conv.assignee?.id ?? null
          return scopeToMine(assigneeId, myAgentId)
        })
      } else {
        // Fix 4 (P1 hotfix, 2026-09-19): this legacy passthrough branch used
        // to return `inner` as-is here, UNFILTERED, whenever the upstream
        // payload shape wasn't an array — inconsistent with the aggregating
        // path below, which defaults to [] (fails CLOSED) for the exact same
        // condition. An ordinary staff session must never receive whatever
        // raw/unexpected object Chatwoot returned. viewAll sessions are
        // untouched — this branch stays legacy passthrough for them.
        return NextResponse.json({ meta: inner?.meta ?? {}, payload: [] })
      }
    }
    return NextResponse.json(inner)
  }

  // Aggregate pages up to requestedMaxPages (bounded above, hard-capped at
  // MAX_PAGES) so no conversation within that depth is hidden by pagination.
  let meta: Record<string, unknown> = {}
  const payload: unknown[] = []
  // Phase 1 (Agent A): true when the loop stopped because it hit the
  // requested depth while the last page was STILL full — there might be
  // more beyond it. False when the last page came back short (genuinely no
  // more) or a later page failed outright. Lets the frontend show "Load
  // more" only when there's a real reason to believe more exists, using the
  // exact same "page came back short" signal this loop already uses to stop.
  let hasMore = false

  for (let page = 1; page <= requestedMaxPages; page++) {
    const result = await fetchPage(page)
    if (!result.ok) {
      if (page === 1) return failureResponse(result.status)
      hasMore = false
      break
    }
    const inner     = result.data.data ?? result.data
    const pageItems = Array.isArray(inner?.payload) ? inner.payload : []
    if (page === 1) meta = inner?.meta ?? {}
    payload.push(...pageItems)
    if (pageItems.length < PAGE_SIZE) { hasMore = false; break }
    hasMore = true   // this page was full — more MIGHT exist past requestedMaxPages
  }

  // Server-side inbox_view_all enforcement: staff without it receive only
  // conversations assigned to their own Chatwoot agent (Mine) — this holds
  // for direct API calls too, not just the UI's tabs/filters. The ownership
  // filter runs over `payload` as collected above — identical regardless of
  // how many pages requestedMaxPages walked; it holds no assumption about
  // page count.
  if (!viewAll) {
    const myAgentId = await resolveChatwootAgentId(session.email)
    const visible = payload.filter((c) => {
      const conv = c as { meta?: { assignee?: { id?: number } | null }; assignee?: { id?: number } | null }
      const assigneeId = conv.meta?.assignee?.id ?? conv.assignee?.id ?? null
      return scopeToMine(assigneeId, myAgentId)
    })
    return NextResponse.json({ meta, payload: visible, hasMore })
  }

  return NextResponse.json({ meta, payload, hasMore })
}
