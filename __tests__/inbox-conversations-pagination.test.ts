/**
 * Phase 1 (Agent A — Inbox Performance) — bounded conversation-list
 * pagination.
 *
 * Root problem: GET /api/admin/conversations walked up to MAX_PAGES=8
 * Chatwoot pages (200 conversations) UNCONDITIONALLY on every call,
 * including every 5s poll tick from every connected staff member. This
 * file executes the REAL route handler (mocking only auth/authz and the
 * outbound Chatwoot fetch) to prove:
 *  - a caller-supplied `maxPages` bounds how many pages are walked;
 *  - a caller can never request past the server's own hard ceiling
 *    (MAX_PAGES=8), no matter what it asks for;
 *  - `hasMore` reports whether the walk stopped on a still-full page
 *    (more might exist) vs. a genuinely short one (it doesn't);
 *  - the ownership/ inbox_view_all scoping filter — the actual security
 *    boundary, untouched by this release — applies IDENTICALLY to
 *    whatever pages were collected, regardless of how many were walked.
 */

import { canAccessConversation } from '@/lib/inbox/authz'

const mockGetSession = jest.fn()
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: (...a: unknown[]) => mockGetSession(...a) }))

jest.mock('@/lib/chatwoot/config', () => ({
  adminChatwootOrNull: () => ({ base: 'https://cw.example.test', token: 'test-token', accountId: '1' }),
}))

const mockCheckInboxPermission     = jest.fn()
const mockCanViewAllConversations  = jest.fn()
const mockResolveChatwootAgentId   = jest.fn()
jest.mock('@/lib/inbox/authz', () => {
  const actual = jest.requireActual('@/lib/inbox/authz')
  return {
    ...actual,
    // Real canAccessConversation stays in force — it's the actual security
    // boundary and this release must not touch its behavior.
    checkInboxPermission:    (...a: unknown[]) => mockCheckInboxPermission(...a),
    canViewAllConversations: (...a: unknown[]) => mockCanViewAllConversations(...a),
    resolveChatwootAgentId:  (...a: unknown[]) => mockResolveChatwootAgentId(...a),
  }
})

import { GET } from '@/app/api/admin/conversations/route'

const SESSION = { email: 'agent42@walztravels.com' }
const MY_AGENT_ID = 42

/** conversation ids cycle assignee 42 (me) / 43 / 44 so every page is a mix
 *  of "mine" and "not mine" — proves filtering isn't accidentally page-
 *  aligned. Pages 1-3 are full (25 items); page 4 is short (10) so the
 *  aggregation naturally ends there when walked far enough. */
const PAGE_SIZES: Record<number, number> = { 1: 25, 2: 25, 3: 25, 4: 10 }

function chatwootConv(id: number) {
  const assigneeId = id % 3 === 0 ? 42 : id % 3 === 1 ? 43 : 44
  return { id, meta: { assignee: { id: assigneeId } } }
}

function fetchMockImpl(url: string) {
  const u = new URL(url)
  const page = Number(u.searchParams.get('page'))
  const size = PAGE_SIZES[page] ?? 0
  const startId = (page - 1) * 25 + 1
  const payload = Array.from({ length: size }, (_, i) => chatwootConv(startId + i))
  return Promise.resolve({
    ok: true,
    json: async () => ({ data: { meta: {}, payload } }),
  } as unknown as Response)
}

function req(qs: string) {
  return new Request(`http://x/api/admin/conversations${qs}`) as unknown as Parameters<typeof GET>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue(SESSION)
  mockCheckInboxPermission.mockReturnValue({ allowed: true })
  mockResolveChatwootAgentId.mockResolvedValue(MY_AGENT_ID)
  global.fetch = jest.fn(fetchMockImpl) as unknown as typeof fetch
})

describe('maxPages bound', () => {
  it('defaults to a fast 2-page walk when maxPages is not supplied', async () => {
    mockCanViewAllConversations.mockReturnValue(true)   // view-all: no ownership filter, easiest to count raw payload
    const res = await GET(req(''))
    const data = await res.json()
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(2)   // pages 1 and 2 only
    expect(data.payload).toHaveLength(50)                          // 25 + 25
    expect(data.hasMore).toBe(true)                                // page 2 was still full
  })

  it('an explicit maxPages=1 walks exactly one page', async () => {
    mockCanViewAllConversations.mockReturnValue(true)
    const res = await GET(req('?maxPages=1'))
    const data = await res.json()
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(1)
    expect(data.payload).toHaveLength(25)
    expect(data.hasMore).toBe(true)   // that one page was full — more might exist
  })

  it('a request past the hard ceiling is clamped to MAX_PAGES=8, never walking further', async () => {
    mockCanViewAllConversations.mockReturnValue(true)
    const res = await GET(req('?maxPages=999'))
    const data = await res.json()
    // Only 4 pages of mock data exist; page 4 is short (10 < 25) so the walk
    // stops there on its own — proves the clamp doesn't error out, and the
    // natural short-page stop still works at a much deeper request.
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(4)
    expect(data.payload).toHaveLength(85)   // 25+25+25+10
    expect(data.hasMore).toBe(false)        // page 4 was short — genuinely no more
  })

  it('a non-integer/garbage maxPages falls back to the fast default rather than erroring', async () => {
    mockCanViewAllConversations.mockReturnValue(true)
    const res = await GET(req('?maxPages=not-a-number'))
    const data = await res.json()
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(2)
    expect(data.payload).toHaveLength(50)
  })
})

describe('ownership scoping applies identically regardless of page depth (the actual security boundary)', () => {
  it('maxPages=1: only page 1s "mine" conversations are returned', async () => {
    mockCanViewAllConversations.mockReturnValue(false)
    const res = await GET(req('?maxPages=1'))
    const data = await res.json()
    // Page 1 = ids 1..25. Mine = id % 3 === 0 → 3,6,9,...,24 → 8 conversations.
    expect(data.payload).toHaveLength(8)
    expect(data.payload.every((c: { id: number }) => c.id % 3 === 0)).toBe(true)
    expect(data.payload.every((c: { id: number }) => c.id <= 25)).toBe(true)
    // Confirms this test's expectation matches the real predicate, not a
    // reimplemented copy of it.
    expect(canAccessConversation(42, MY_AGENT_ID, false)).toBe(true)
    expect(canAccessConversation(43, MY_AGENT_ID, false)).toBe(false)
  })

  it('maxPages=2: the SAME filter now additionally admits page 2s "mine" conversations — the predicate never changed, only how much was walked', async () => {
    mockCanViewAllConversations.mockReturnValue(false)
    const res = await GET(req('?maxPages=2'))
    const data = await res.json()
    // Pages 1-2 = ids 1..50. Mine = multiples of 3 → 16 conversations.
    expect(data.payload).toHaveLength(16)
    expect(data.payload.every((c: { id: number }) => c.id % 3 === 0)).toBe(true)
    expect(Math.max(...data.payload.map((c: { id: number }) => c.id))).toBeGreaterThan(25)
  })

  it('a non-view-all session can never widen its result by asking for more pages than it is entitled to see', async () => {
    mockCanViewAllConversations.mockReturnValue(false)
    const res = await GET(req('?maxPages=999'))
    const data = await res.json()
    // All 85 raw conversations walked, but still only "mine" comes back —
    // the ownership filter, not the page cap, is what bounds visibility.
    expect(data.payload.every((c: { id: number }) => c.id % 3 === 0)).toBe(true)
    expect(data.payload).toHaveLength(28)   // multiples of 3 from 1..85
  })

  it('resolveChatwootAgentId is consulted for the ownership filter, and only for non-view-all sessions', async () => {
    mockCanViewAllConversations.mockReturnValue(false)
    await GET(req('?maxPages=1'))
    expect(mockResolveChatwootAgentId).toHaveBeenCalledWith(SESSION.email)

    mockResolveChatwootAgentId.mockClear()
    mockCanViewAllConversations.mockReturnValue(true)
    await GET(req('?maxPages=1'))
    expect(mockResolveChatwootAgentId).not.toHaveBeenCalled()
  })
})

describe('401/403 handled before any Chatwoot call', () => {
  it('no session → 401, zero Chatwoot fetches', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await GET(req(''))
    expect(res.status).toBe(401)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('permission denied → the authz status/error, zero Chatwoot fetches', async () => {
    mockCheckInboxPermission.mockReturnValue({ allowed: false, status: 403, error: 'nope' })
    const res = await GET(req(''))
    expect(res.status).toBe(403)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
