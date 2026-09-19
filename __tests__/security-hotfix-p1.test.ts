/**
 * P1 SECURITY HOTFIX (2026-09-19) — end-to-end regression matrix.
 *
 * Independent security review findings, fixed here:
 *   1. Routing-agent mutation endpoints (POST/PATCH/DELETE
 *      /api/admin/routing/agents[...]) had zero permission check beyond
 *      "is this any logged-in staff member" — any staff member could
 *      repoint their own RoutingAgent row's chatwootAgentId at a
 *      colleague's, then inherit that colleague's full conversation
 *      access via resolveChatwootAgentId(). Fixed with a
 *      'settings_integrations' permission gate (also applied to GET,
 *      which was the read-side half of the same exploit chain).
 *   2. DELETE /api/admin/conversations/[id] never checked ownership —
 *      fixed by adding the same checkConversationAccess() call every
 *      sibling route in that directory already makes.
 *   3. resolveChatwootAgentId()'s stale EMAIL_TO_AGENT hardcoded fallback
 *      tier removed — unresolvable identity now fails closed (id 0).
 *   4. The conversations list endpoint now scopes ordinary staff to
 *      Mine (+ their own Resolved) ONLY — never Unassigned, another
 *      agent's conversations, or an unrestricted All queue — no matter
 *      what query parameters a direct API request supplies.
 *
 * These tests execute the REAL route handlers (not just the underlying
 * authz functions in isolation) against mocked session/Supabase/Chatwoot
 * layers, proving the exploit chain is broken end-to-end.
 */

const mockGetSession = jest.fn()
const mockGetSupabaseAdmin = jest.fn()

jest.mock('@/lib/admin-auth', () => ({
  getAdminSession: (...a: unknown[]) => mockGetSession(...a),
}))
jest.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: (...a: unknown[]) => mockGetSupabaseAdmin(...a),
}))
jest.mock('@/lib/chatwoot/config', () => ({
  adminChatwootOrNull: () => ({ base: 'https://cw.test', token: 'test-token', accountId: '1' }),
  botChatwootOrNull:   () => ({ base: 'https://cw.test', token: 'test-token', accountId: '1' }),
}))
// lib/inbox/authz is intentionally NOT mocked — these tests exercise the
// real permission/ownership logic the hotfix changed.

import { GET as routingAgentsGET, POST as routingAgentsPOST } from '@/app/api/admin/routing/agents/route'
import { PATCH as routingAgentPATCH, DELETE as routingAgentDELETE } from '@/app/api/admin/routing/agents/[id]/route'
import { GET as conversationsListGET } from '@/app/api/admin/conversations/route'
import { GET as conversationGET, DELETE as conversationDELETE } from '@/app/api/admin/conversations/[id]/route'
import { GET as messagesGET } from '@/app/api/admin/conversations/[id]/messages/route'
import { GET as routingOverviewGET } from '@/app/api/admin/routing/route'
import { GET as inboxMappingGET } from '@/app/api/admin/inbox-mapping/route'
import { GET as aircallUsersGET } from '@/app/api/admin/routing/aircall-users/route'
import { clearInboxAuthzCaches } from '@/lib/inbox/authz'
import type { AdminSession } from '@/lib/admin-auth'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const AGENT_A_CW_ID = 101
const AGENT_B_CW_ID = 102

type Row = Record<string, unknown>

function baseSession(over: Partial<AdminSession>): AdminSession {
  return {
    id: 's1', email: 'staff@walztravels.com', name: 'Staff', roleTitle: 'Consultant',
    sendingEmail: 'bookings@walztravels.com', signatureTagline: null,
    role: 'sales_rep', staffRole: 'sales_rep', permissions: {},
    branch: 'nigeria', department: 'general', isActive: true,
    ...over,
  }
}

const agentA = baseSession({
  email: 'agenta@walztravels.com', name: 'Agent A',
  permissions: { inbox_view: true, inbox_delete: true },
})
const agentB = baseSession({
  email: 'agentb@walztravels.com', name: 'Agent B',
  permissions: { inbox_view: true, inbox_delete: true },
})
const manager = baseSession({
  email: 'manager@walztravels.com', name: 'Manager',
  role: 'general_manager', staffRole: 'general_manager',
  permissions: { inbox_view: true, inbox_view_all: true, inbox_delete: true },
})
// Holds settings_integrations WITHOUT being super_admin — proves the gate
// is a genuine permission check, not a disguised role-string check.
const opsWithIntegrations = baseSession({
  email: 'ops@walztravels.com', name: 'Ops', role: 'senior_manager', staffRole: 'senior_manager',
  permissions: { settings_integrations: true },
})
// Ordinary staff with inbox_view but no resolvable Chatwoot identity anywhere
// (no RoutingAgent row, empty live Chatwoot agents list) — fail-closed case.
const ghost = baseSession({ email: 'ghost@walztravels.com', name: 'Ghost', permissions: { inbox_view: true } })
// Holds no inbox permission at all — for routes whose bar is 'any inbox
// permission' (Fix 3) rather than a specific one.
const noPerms = baseSession({ email: 'noperms@walztravels.com', name: 'No Perms', permissions: {} })

let routingRows: Row[] = []
let conversations: Array<{ id: number; status: string; assignee: { id: number } | null }> = []

function resetFixtures() {
  routingRows = [
    { id: 'ra-a', name: 'Agent A', email: 'agenta@walztravels.com', chatwootAgentId: AGENT_A_CW_ID, active: true, isEscalation: false, roundRobinPosition: 0 },
    { id: 'ra-b', name: 'Agent B', email: 'agentb@walztravels.com', chatwootAgentId: AGENT_B_CW_ID, active: true, isEscalation: false, roundRobinPosition: 1 },
  ]
  conversations = [
    { id: 1001, status: 'open',     assignee: { id: AGENT_A_CW_ID } },  // Agent A's — Mine for A
    { id: 1002, status: 'open',     assignee: { id: AGENT_B_CW_ID } },  // Agent B's — must be invisible to A
    { id: 1003, status: 'open',     assignee: null },                  // Unassigned — must be invisible to A (Fix 4)
    { id: 1004, status: 'resolved', assignee: { id: AGENT_B_CW_ID } },  // B's resolved — invisible to A
    { id: 1005, status: 'resolved', assignee: { id: AGENT_A_CW_ID } },  // A's own resolved — visible to A
  ]
}

/** Minimal Supabase query-builder fake covering exactly the chains the
 *  routing/agents routes and resolveChatwootAgentId issue against
 *  RoutingAgent: select/eq/order/maybeSingle/single, count-mode select,
 *  insert().select().single(), update().eq().select().single(),
 *  and update().eq() awaited directly (no .select()). */
function makeFakeSupabaseAdmin(rows: Row[]) {
  function builder() {
    const filters: Row = {}
    let countMode = false
    const matches = (r: Row) => Object.entries(filters).every(([k, v]) => r[k] === v)
    const chain = {
      select: (_cols?: unknown, opts?: { count?: string }) => { if (opts?.count) countMode = true; return chain },
      eq: (col: string, val: unknown) => { filters[col] = val; return chain },
      order: () => chain,
      gte: () => chain,
      limit: () => chain,
      insert: (row: Row) => {
        const created: Row = { id: `ra-new-${rows.length + 1}`, active: true, isEscalation: false, roundRobinPosition: rows.length, ...row }
        return { select: () => ({ single: async () => { rows.push(created); return { data: created, error: null } } }) }
      },
      update: (patch: Row) => ({
        eq: (col: string, val: unknown) => ({
          select: () => ({
            single: async () => {
              const row = rows.find(r => r[col] === val)
              if (row) Object.assign(row, patch)
              return row ? { data: row, error: null } : { data: null, error: { message: 'not found' } }
            },
          }),
          then: (resolve: (v: unknown) => void) => {
            const row = rows.find(r => r[col] === val)
            if (row) Object.assign(row, patch)
            resolve({ data: null, error: null })
          },
        }),
      }),
      maybeSingle: async () => {
        const row = rows.find(matches)
        return { data: row ?? null, error: null }
      },
      single: async () => {
        const row = rows.find(matches)
        return row ? { data: row, error: null } : { data: null, error: { message: 'not found' } }
      },
      then: (resolve: (v: unknown) => void) => {
        const matched = rows.filter(matches)
        resolve(countMode ? { data: null, error: null, count: matched.length } : { data: matched, error: null })
      },
    }
    return chain
  }
  return { from: (_table: string) => builder() }
}

function makeFetchMock() {
  return jest.fn(async (input: unknown, init?: { method?: string }) => {
    const url = String(input)
    const method = init?.method ?? 'GET'

    if (url.endsWith('/agents')) {
      return { ok: true, json: async () => [] } as unknown as Response
    }
    if (url.includes('/messages')) {
      return { ok: true, json: async () => ({ payload: [] }) } as unknown as Response
    }
    const singleConvMatch = url.match(/\/conversations\/(\d+)(?:\?|$)/)
    if (singleConvMatch) {
      const id = Number(singleConvMatch[1])
      const conv = conversations.find(c => c.id === id)
      if (!conv) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
      if (method === 'DELETE') return { ok: true, json: async () => ({}) } as unknown as Response
      return { ok: true, json: async () => ({ meta: { assignee: conv.assignee } }) } as unknown as Response
    }
    if (url.includes('/conversations?')) {
      const parsed = new URL(url)
      const status = parsed.searchParams.get('status') ?? 'open'
      const page = parsed.searchParams.get('page') ?? '1'
      if (page !== '1') return { ok: true, json: async () => ({ meta: {}, payload: [] }) } as unknown as Response
      const payload = conversations
        .filter(c => c.status === status)
        .map(c => ({ id: c.id, meta: { assignee: c.assignee } }))
      return { ok: true, json: async () => ({ meta: {}, payload }) } as unknown as Response
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
  })
}

function urlReq(url: string) { return { url } as unknown as Request }
function jsonReq(body: unknown) { return { json: async () => body } as unknown as Parameters<typeof routingAgentsPOST>[0] }
function idParams(id: string) { return { params: { id } } }
function idParamsPromise(id: string) { return { params: Promise.resolve({ id }) } }

beforeEach(() => {
  jest.clearAllMocks()
  clearInboxAuthzCaches()
  resetFixtures()
  mockGetSupabaseAdmin.mockImplementation(() => makeFakeSupabaseAdmin(routingRows))
  global.fetch = makeFetchMock() as unknown as typeof fetch
})

async function convPayload(session: AdminSession, qs: string): Promise<Array<{ id: number }>> {
  mockGetSession.mockResolvedValue(session)
  const res = await conversationsListGET(urlReq(`http://localhost/api/admin/conversations${qs}`))
  const body = await res.json() as { payload?: Array<{ id: number }> }
  return body.payload ?? []
}

// ── 1-5: conversations list scoping (Fix 4) ─────────────────────────────────

describe('Fix 4 — conversations list: ordinary staff get Mine (+ own Resolved) only', () => {
  it('1. Agent A sees Agent A\'s own open conversation (Mine)', async () => {
    const ids = (await convPayload(agentA, '?status=open')).map(c => c.id)
    expect(ids).toContain(1001)
  })

  it('2+4. no crafted filter/assignee_type widens Agent A\'s queue beyond Mine', async () => {
    for (const qs of [
      '?status=open', '?status=open&assignee_type=all', '?status=open&assignee_type=unassigned',
      '?status=open&filter=all', '?status=open&filter=unassigned',
    ]) {
      const ids = (await convPayload(agentA, qs)).map(c => c.id)
      expect(ids).not.toContain(1002)   // Agent B's — never visible
      expect(ids).not.toContain(1003)   // Unassigned — never visible (Fix 4 tightening)
      expect(ids.every(id => id === 1001)).toBe(true)   // nothing beyond "mine"
    }
  })

  it('3. Agent A cannot retrieve Unassigned conversations at all', async () => {
    const ids = (await convPayload(agentA, '?status=open')).map(c => c.id)
    expect(ids).not.toContain(1003)
  })

  it('5. Agent A cannot retrieve Agent B\'s resolved conversations, but can see her own', async () => {
    const ids = (await convPayload(agentA, '?status=resolved')).map(c => c.id)
    expect(ids).not.toContain(1004)   // Agent B's resolved
    expect(ids).toContain(1005)       // Agent A's own resolved
  })

  it('10. an unresolvable identity fails closed — sees nothing, never everything', async () => {
    const ids = (await convPayload(ghost, '?status=open')).map(c => c.id)
    expect(ids).toEqual([])
  })

  it('11. Manager (inbox_view_all) keeps full existing access — unchanged', async () => {
    const open = (await convPayload(manager, '?status=open')).map(c => c.id).sort()
    expect(open).toEqual([1001, 1002, 1003].sort())
    const resolved = (await convPayload(manager, '?status=resolved')).map(c => c.id).sort()
    expect(resolved).toEqual([1004, 1005].sort())
  })
})

// ── 6-7: per-conversation ownership (checkConversationAccess) ──────────────

describe('per-conversation access — Agent A cannot reach Agent B\'s conversation directly', () => {
  it('6a. GET /api/admin/conversations/[id] on B\'s conversation is denied', async () => {
    mockGetSession.mockResolvedValue(agentA)
    const res = await conversationGET(urlReq('http://localhost/x'), idParams('1002'))
    expect(res.status).toBe(403)
  })

  it('6b. GET .../[id]/messages on B\'s conversation is denied, and never reaches Chatwoot messages', async () => {
    mockGetSession.mockResolvedValue(agentA)
    const res = await messagesGET(urlReq('http://localhost/x'), idParams('1002'))
    expect(res.status).toBe(403)
    const fetchMock = global.fetch as jest.Mock
    const hitMessages = fetchMock.mock.calls.some(([u]: [string]) => String(u).includes('/messages'))
    expect(hitMessages).toBe(false)
  })

  it('7. DELETE /api/admin/conversations/[id] on B\'s conversation is denied even though Agent A holds inbox_delete', async () => {
    mockGetSession.mockResolvedValue(agentA)
    const res = await conversationDELETE(urlReq('http://localhost/x'), idParams('1002'))
    expect(res.status).toBe(403)
    const fetchMock = global.fetch as jest.Mock
    const deletedIt = fetchMock.mock.calls.some(([, init]: [string, { method?: string }]) => init?.method === 'DELETE')
    expect(deletedIt).toBe(false)   // the mutating call to Chatwoot never happened
  })

  it('sanity: Agent A CAN delete her OWN conversation (proves the block above is ownership, not a blanket denial)', async () => {
    mockGetSession.mockResolvedValue(agentA)
    const res = await conversationDELETE(urlReq('http://localhost/x'), idParams('1001'))
    expect(res.status).toBe(200)
  })
})

// ── 8-9, 12: routing-agent identity mapping (Fix 1) ─────────────────────────

describe('Fix 1 — routing-agent mutation endpoints require settings_integrations', () => {
  it('GET is gated too (closes the read-side half of the exploit chain)', async () => {
    mockGetSession.mockResolvedValue(agentA)
    const res = await routingAgentsGET()
    expect(res.status).toBe(403)
  })

  it('8. Agent A cannot PATCH her own row to Agent B\'s chatwootAgentId — and still cannot see B\'s conversations afterward', async () => {
    mockGetSession.mockResolvedValue(agentA)
    const res = await routingAgentPATCH(jsonReq({ chatwootAgentId: AGENT_B_CW_ID }), idParamsPromise('ra-a'))
    expect(res.status).toBe(403)
    expect(routingRows.find(r => r.id === 'ra-a')?.chatwootAgentId).toBe(AGENT_A_CW_ID)   // unchanged

    // End-to-end: the denied PATCH must not have granted Agent A access to
    // Agent B's conversations through the back door.
    const ids = (await convPayload(agentA, '?status=open')).map(c => c.id)
    expect(ids).not.toContain(1002)
  })

  it('9. Agent A cannot mutate Agent B\'s RoutingAgent row at all, any field', async () => {
    mockGetSession.mockResolvedValue(agentA)
    const res = await routingAgentPATCH(jsonReq({ name: 'Hacked', active: false, chatwootAgentId: 999 }), idParamsPromise('ra-b'))
    expect(res.status).toBe(403)
    const rowB = routingRows.find(r => r.id === 'ra-b')
    expect(rowB?.name).toBe('Agent B')
    expect(rowB?.active).toBe(true)
    expect(rowB?.chatwootAgentId).toBe(AGENT_B_CW_ID)
  })

  it('DELETE is gated the same way', async () => {
    mockGetSession.mockResolvedValue(agentA)
    const res = await routingAgentDELETE({} as never, idParamsPromise('ra-b'))
    expect(res.status).toBe(403)
    expect(routingRows.find(r => r.id === 'ra-b')?.active).toBe(true)
  })

  it('12. a legitimate settings_integrations holder (NOT super_admin) can still manage routing agents', async () => {
    mockGetSession.mockResolvedValue(opsWithIntegrations)

    const list = await routingAgentsGET()
    expect(list.status).toBe(200)

    const created = await routingAgentsPOST(jsonReq({ name: 'New Agent', email: 'new-agent@walztravels.com' }))
    expect(created.status).toBe(201)
    const createdBody = await created.json() as { agent: { id: string } }

    const patched = await routingAgentPATCH(jsonReq({ name: 'Renamed Agent' }), idParamsPromise(createdBody.agent.id))
    expect(patched.status).toBe(200)

    const deleted = await routingAgentDELETE({} as never, idParamsPromise(createdBody.agent.id))
    expect(deleted.status).toBe(200)
  })

  it('the toggle sibling endpoint is gated the same way (same resource, same vulnerability class)', async () => {
    const { POST: toggle } = await import('@/app/api/admin/routing/agents/[id]/toggle/route')
    mockGetSession.mockResolvedValue(agentA)
    const res = await toggle({} as never, idParamsPromise('ra-b'))
    expect(res.status).toBe(403)
    expect(routingRows.find(r => r.id === 'ra-b')?.active).toBe(true)
  })
})

// ── Fix 1 — GET /api/admin/routing (routing overview dashboard) ────────────

describe('Fix 1 — GET /api/admin/routing requires settings_integrations', () => {
  it('ordinary staff with no settings_integrations get 403', async () => {
    mockGetSession.mockResolvedValue(agentA)
    const res = await routingOverviewGET()
    expect(res.status).toBe(403)
  })

  it('a settings_integrations holder (NOT super_admin) still gets the full roster', async () => {
    mockGetSession.mockResolvedValue(opsWithIntegrations)
    const res = await routingOverviewGET()
    expect(res.status).toBe(200)
    const body = await res.json() as { agents: Array<{ email: string }> }
    expect(body.agents.map(a => a.email)).toEqual(
      expect.arrayContaining(['agenta@walztravels.com', 'agentb@walztravels.com']),
    )
  })
})

// ── Fix 2 — GET /api/admin/inbox-mapping ────────────────────────────────────

describe('Fix 2 — GET /api/admin/inbox-mapping requires settings_integrations', () => {
  it('ordinary staff with only inbox_view get 403 (was previously enough)', async () => {
    mockGetSession.mockResolvedValue(agentA)
    const res = await inboxMappingGET()
    expect(res.status).toBe(403)
  })

  it('a settings_integrations holder still gets the mapping list', async () => {
    mockGetSession.mockResolvedValue(opsWithIntegrations)
    const res = await inboxMappingGET()
    expect(res.status).toBe(200)
    const body = await res.json() as { mappings: Array<{ email: string }> }
    expect(body.mappings.length).toBeGreaterThan(0)
  })
})

// ── Fix 3 — GET /api/admin/routing/aircall-users ────────────────────────────

describe('Fix 3 — GET /api/admin/routing/aircall-users requires inbox_view or inbox_assign', () => {
  it('a session with neither permission gets 403', async () => {
    mockGetSession.mockResolvedValue(noPerms)
    const res = await aircallUsersGET()
    expect(res.status).toBe(403)
  })

  it('a session holding just inbox_view still gets 200', async () => {
    mockGetSession.mockResolvedValue(agentA)
    const res = await aircallUsersGET()
    expect(res.status).toBe(200)
  })
})

// ── Fix 4 — explicitPage legacy passthrough fails closed on bad payload ────

describe('Fix 4 — conversations explicitPage branch fails closed for non-viewAll on a malformed payload', () => {
  function malformedPageFetchMock() {
    return jest.fn(async (input: unknown) => {
      const url = String(input)
      if (url.includes('/conversations?')) {
        // Simulates an unexpected/malformed upstream shape: payload is not
        // an array at all.
        return { ok: true, json: async () => ({ meta: { weird: true }, payload: 'not-an-array' }) } as unknown as Response
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
    })
  }

  it('non-viewAll session gets a safe empty payload, never the raw malformed object', async () => {
    global.fetch = malformedPageFetchMock() as unknown as typeof fetch
    mockGetSession.mockResolvedValue(agentA)
    const res = await conversationsListGET(urlReq('http://localhost/api/admin/conversations?status=open&page=1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { meta?: unknown; payload?: unknown }
    expect(body.payload).toEqual([])
    expect(body.meta).toEqual({ weird: true })
  })

  it('viewAll session keeps the existing legacy passthrough unchanged (raw shape returned as-is)', async () => {
    global.fetch = malformedPageFetchMock() as unknown as typeof fetch
    mockGetSession.mockResolvedValue(manager)
    const res = await conversationsListGET(urlReq('http://localhost/api/admin/conversations?status=open&page=1'))
    expect(res.status).toBe(200)
    const body = await res.json() as { meta?: unknown; payload?: unknown }
    expect(body.payload).toBe('not-an-array')
  })
})
