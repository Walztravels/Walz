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

describe('P1.1 fix: non-viewAll sessions use wantCount continuation-scan, never maxPages (the actual security boundary + the completeness fix)', () => {
  it('maxPages is IGNORED entirely for non-viewAll sessions — the old bug: it used to cap how much was walked BEFORE the ownership filter ran, so a staff member whose conversations sat past that cap saw nothing', async () => {
    mockCanViewAllConversations.mockReturnValue(false)
    // maxPages=1 must NOT limit this to page 1's data — the server ignores
    // maxPages for non-viewAll entirely and uses the wantCount default (25).
    const res = await GET(req('?maxPages=1'))
    const data = await res.json()
    expect(Math.max(...data.payload.map((c: { id: number }) => c.id))).toBeGreaterThan(25)
    expect(data.payload.every((c: { id: number }) => c.id % 3 === 0)).toBe(true)
    expect(canAccessConversation(42, MY_AGENT_ID, false)).toBe(true)
    expect(canAccessConversation(43, MY_AGENT_ID, false)).toBe(false)
  })

  it('wantCount=8: stops after exactly page 1, since page 1 alone already contains 8 "mine" matches (ids 3..24) and hasMore=true — page 1 was full, more might exist', async () => {
    mockCanViewAllConversations.mockReturnValue(false)
    const res = await GET(req('?wantCount=8'))
    const data = await res.json()
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(1)
    expect(data.payload).toHaveLength(8)
    expect(data.payload.every((c: { id: number }) => c.id % 3 === 0 && c.id <= 25)).toBe(true)
    expect(data.hasMore).toBe(true)
  })

  it('wantCount=16: continues into page 2 to find the remaining 8 matches, stopping there — proves the continuation actually walks forward instead of giving up on a shallow window', async () => {
    mockCanViewAllConversations.mockReturnValue(false)
    const res = await GET(req('?wantCount=16'))
    const data = await res.json()
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(2)
    expect(data.payload).toHaveLength(16)
    expect(data.payload.every((c: { id: number }) => c.id % 3 === 0)).toBe(true)
    expect(Math.max(...data.payload.map((c: { id: number }) => c.id))).toBeGreaterThan(25)
    expect(data.hasMore).toBe(true)
  })

  it('a large wantCount still only ever returns "mine" conversations, bounded by genuine upstream exhaustion (page 4 is short) — never anyone else\'s data, no matter how far it had to scan', async () => {
    mockCanViewAllConversations.mockReturnValue(false)
    const res = await GET(req('?wantCount=999'))   // clamped to MAX_WANT_COUNT, still exhausts naturally first
    const data = await res.json()
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(4)   // all 4 mock pages, page 4 short stops it
    expect(data.payload.every((c: { id: number }) => c.id % 3 === 0)).toBe(true)
    expect(data.payload).toHaveLength(28)   // every multiple of 3 in ids 1..85 (8 + 8 + 9 + 3 across the 4 pages)
    expect(data.hasMore).toBe(false)   // genuinely exhausted — the false-empty/false-more bug this fix closes
  })

  it('resolveChatwootAgentId is consulted for the ownership filter, and only for non-view-all sessions', async () => {
    mockCanViewAllConversations.mockReturnValue(false)
    await GET(req('?wantCount=8'))
    expect(mockResolveChatwootAgentId).toHaveBeenCalledWith(SESSION.email)

    mockResolveChatwootAgentId.mockClear()
    mockCanViewAllConversations.mockReturnValue(true)
    await GET(req('?maxPages=1'))
    expect(mockResolveChatwootAgentId).not.toHaveBeenCalled()
  })
})

describe('P1.1 regression: the exact production bug — an agent with zero matches in the shallow window but real matches further back', () => {
  // A dedicated dataset: pages 1-2 contain ZERO conversations assigned to
  // MY_AGENT_ID (the old DEFAULT_LOADED_PAGES=2 window) — every one belongs
  // to a different agent. Page 3 (full) and page 4 (short) DO contain the
  // staff member's real assigned conversations. This is Oluchi Uko's exact
  // production scenario: "No conversations assigned to you" was rendered
  // even though real assigned conversations existed on later pages.
  const SPARSE_PAGE_SIZES: Record<number, number> = { 1: 25, 2: 25, 3: 25, 4: 5 }
  function sparseConv(id: number) {
    // Pages 1-2 (ids 1-50): never mine. Pages 3-4 (ids 51-80): mine every 3rd id.
    const assigneeId = id <= 50 ? 99 : (id % 3 === 0 ? MY_AGENT_ID : 98)
    return { id, meta: { assignee: { id: assigneeId } } }
  }
  function sparseFetchMockImpl(url: string) {
    const u = new URL(url)
    const page = Number(u.searchParams.get('page'))
    const size = SPARSE_PAGE_SIZES[page] ?? 0
    const startId = (page - 1) * 25 + 1
    const payload = Array.from({ length: size }, (_, i) => sparseConv(startId + i))
    return Promise.resolve({ ok: true, json: async () => ({ data: { meta: {}, payload } }) } as unknown as Response)
  }

  beforeEach(() => {
    mockCanViewAllConversations.mockReturnValue(false)
    global.fetch = jest.fn(sparseFetchMockImpl) as unknown as typeof fetch
  })

  it('Mine automatically discovers the agent\'s real conversations on pages 3-4 even though pages 1-2 (the old shallow default window) contain none — this must NOT render as empty', async () => {
    const res = await GET(req(''))   // no wantCount → DEFAULT_WANT_COUNT=25
    const data = await res.json()
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(4)   // had to walk past the old 2-page default to find anything
    expect(data.payload.length).toBeGreaterThan(0)   // THE regression: this must never be empty
    expect(data.payload.every((c: { id: number }) => c.id > 50)).toBe(true)   // all genuinely from pages 3-4
    // ids 51..80, mine = multiples of 3 in that range: 51,54,...,78 → but only up to id 80 (page4 short=5 → ids 76-80) → 51..78 step 3 = 10 matches
    expect(data.payload).toHaveLength(10)
    expect(data.hasMore).toBe(false)   // page 4 was short — genuinely exhausted, correctly reported
  })

  it('Agent B (a different agent id) never receives Agent A\'s conversations from the same sparse dataset', async () => {
    mockResolveChatwootAgentId.mockResolvedValue(98)   // "Agent B" in this dataset
    const res = await GET(req(''))
    const data = await res.json()
    expect(data.payload.every((c: { id: number }) => c.id > 50 && c.id % 3 !== 0)).toBe(true)
    expect(data.payload.some((c: { id: number }) => c.id % 3 === 0)).toBe(false)
  })
})

describe('P1.1 fix: hasMore never survives past the hard ceiling (the dead-end this closes)', () => {
  // Every page up to and including MAX_PAGES(8) is full AND contains
  // exactly one "mine" match — the scan can never reach a large wantCount
  // and never hits a genuinely short page either. The OLD bug would leave
  // hasMore=true forever (an unbounded "Load more" that only ever re-scans
  // the same already-exhausted range); the fix must report hasMore=false
  // once the ceiling itself is reached, not just once Chatwoot runs dry.
  function ceilingConv(id: number, page: number) {
    const assigneeId = id === (page - 1) * 25 + 1 ? MY_AGENT_ID : 97   // exactly 1 mine match per page
    return { id, meta: { assignee: { id: assigneeId } } }
  }
  function fullEveryPageMockImpl(url: string) {
    const u = new URL(url)
    const page = Number(u.searchParams.get('page'))
    if (page > 8) return Promise.resolve({ ok: true, json: async () => ({ data: { meta: {}, payload: [] } }) } as unknown as Response)
    const startId = (page - 1) * 25 + 1
    const payload = Array.from({ length: 25 }, (_, i) => ceilingConv(startId + i, page))
    return Promise.resolve({ ok: true, json: async () => ({ data: { meta: {}, payload } }) } as unknown as Response)
  }

  beforeEach(() => {
    mockCanViewAllConversations.mockReturnValue(false)
    global.fetch = jest.fn(fullEveryPageMockImpl) as unknown as typeof fetch
  })

  it('wantCount=200 (clamped to the same ceiling) never finds enough — only 8 mine matches exist across all 8 allowed pages — and hasMore is correctly false, not stuck true', async () => {
    const res = await GET(req('?wantCount=200'))
    const data = await res.json()
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(8)   // walked exactly the ceiling, never past it
    expect(data.payload).toHaveLength(8)   // one match per page × 8 pages
    expect(data.hasMore).toBe(false)   // THE fix: no dead-end "Load more" once the ceiling is reached
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
