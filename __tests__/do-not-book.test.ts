/**
 * Do-Not-Book hard-block — API + wiring invariants.
 *
 * Covers:
 *  1. Flagged client lookup by userId and by email returns the warning data
 *  2. Unflagged client is completely unaffected (doNotBook: false)
 *  3. Pre-migration resilience: column errors degrade to "not flagged"
 *  4. Override POST writes an ActivityLog entry with WHO overrode and returns WHEN
 *  5. flaggedForReview is untouched by the new path (reads only doNotBook fields)
 *  6. Every admin booking creation flow is wired: the shared CustomerSelector
 *     (hotel/tour/transfer/activity/flight) + quotes/new + itinerary planner
 */

import fs from 'fs'
import path from 'path'

const mockFindUnique      = jest.fn()
const mockUserFindFirst   = jest.fn()
const mockStaffFindUnique = jest.fn()
const mockAuditCreate     = jest.fn().mockResolvedValue({})
const mockRiskFindMany    = jest.fn()

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    clientRiskScore: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      findMany:   (...a: unknown[]) => mockRiskFindMany(...a),
    },
    user:        { findFirst:  (...a: unknown[]) => mockUserFindFirst(...a) },
    staff:       { findUnique: (...a: unknown[]) => mockStaffFindUnique(...a) },
    activityLog: { create:     (...a: unknown[]) => mockAuditCreate(...a) },
  },
}))

let session: { email: string } | null = { email: 'contact@walztravels.com' }
jest.mock('@/lib/admin-auth', () => ({
  getAdminSession: jest.fn(async () => session),
}))

import { GET, POST } from '@/app/api/admin/clients/do-not-book/route'
import type { NextRequest } from 'next/server'

const get  = (qs: string) => GET(new Request(`http://x/api/admin/clients/do-not-book?${qs}`) as unknown as NextRequest)
const post = (body: unknown) => POST(new Request('http://x/api/admin/clients/do-not-book', {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
}) as unknown as NextRequest)

beforeEach(() => {
  session = { email: 'contact@walztravels.com' }
  mockFindUnique.mockReset()
  mockUserFindFirst.mockReset()
  mockStaffFindUnique.mockReset().mockResolvedValue({ id: 'staff_1', name: 'Walz Admin' })
  mockAuditCreate.mockClear()
})

// ── 1 & 2. Lookup ─────────────────────────────────────────────────────────────

describe('GET do-not-book status', () => {
  it('returns the flag and reason for a blocked client (by userId)', async () => {
    mockFindUnique.mockResolvedValue({ doNotBook: true, doNotBookReason: 'Repeated conduct issues toward staff' })
    const res  = await get('userId=user_ha8h86')
    const data = await res.json()
    expect(data.doNotBook).toBe(true)
    expect(data.reason).toContain('conduct issues')
  })

  it('resolves the client by email, then reads the flag', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'user_ha8h86' })
    mockFindUnique.mockResolvedValue({ doNotBook: true, doNotBookReason: 'Disputed a signed proposal' })
    const res  = await get('email=client%40example.com')
    const data = await res.json()
    expect(data.doNotBook).toBe(true)
    expect(mockFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user_ha8h86' } }))
  })

  it('an unflagged client is completely unaffected', async () => {
    mockFindUnique.mockResolvedValue({ doNotBook: false, doNotBookReason: null })
    const res  = await get('userId=user_normal')
    const data = await res.json()
    expect(data.doNotBook).toBe(false)
    expect(data.reason).toBeNull()
  })

  it('client with no risk-score row at all → not flagged', async () => {
    mockFindUnique.mockResolvedValue(null)
    const data = await (await get('userId=user_new')).json()
    expect(data.doNotBook).toBe(false)
  })

  it('unknown email → not flagged (no crash)', async () => {
    mockUserFindFirst.mockResolvedValue(null)
    const data = await (await get('email=nobody%40example.com')).json()
    expect(data.doNotBook).toBe(false)
  })

  it('missing params → 400; no session → 401', async () => {
    expect((await get('')).status).toBe(400)
    session = null
    expect((await get('userId=x')).status).toBe(401)
  })

  // 3. Pre-migration resilience
  it('column error (pre-migration DB) degrades to not-flagged instead of breaking flows', async () => {
    mockFindUnique.mockRejectedValue(new Error('column "doNotBook" does not exist'))
    const res  = await get('userId=user_any')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.doNotBook).toBe(false)
  })

  // 5. flaggedForReview untouched
  it('reads ONLY doNotBook fields — flaggedForReview is never selected or written', async () => {
    mockFindUnique.mockResolvedValue({ doNotBook: true, doNotBookReason: 'x' })
    await get('userId=user_ha8h86')
    const selectArg = mockFindUnique.mock.calls[0][0] as { select: Record<string, boolean> }
    expect(Object.keys(selectArg.select)).toEqual(['doNotBook', 'doNotBookReason'])
  })
})

// ── 4. Logged override ────────────────────────────────────────────────────────

describe('POST override acknowledgment', () => {
  it('records WHO overrode and WHEN in the ActivityLog — not a silent dismissal', async () => {
    const res  = await post({ userId: 'user_ha8h86', clientName: 'Rachel Martins', context: 'hotel booking' })
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.overriddenBy).toBe('Walz Admin (contact@walztravels.com)')
    expect(typeof data.at).toBe('string')

    expect(mockAuditCreate).toHaveBeenCalledTimes(1)
    const arg = mockAuditCreate.mock.calls[0][0] as { data: { action: string; detail: string; staffId: string | null; staffName: string } }
    expect(arg.data.action).toBe('Do Not Book Override')
    expect(arg.data.staffId).toBe('staff_1')
    expect(arg.data.staffName).toBe('Walz Admin')
    expect(arg.data.detail).toContain('Rachel Martins')
    expect(arg.data.detail).toContain('hotel booking')
  })

  it('env super-admin (no Staff row) is still identified by email in the log', async () => {
    mockStaffFindUnique.mockResolvedValue(null)
    const res  = await post({ email: 'client@example.com', context: 'quote creation' })
    const data = await res.json()
    expect(data.overriddenBy).toBe('contact@walztravels.com')
    const arg = mockAuditCreate.mock.calls[0][0] as { data: { staffName: string } }
    expect(arg.data.staffName).toBe('contact@walztravels.com')
  })

  it('requires a client identifier and a session', async () => {
    expect((await post({ context: 'x' })).status).toBe(400)
    session = null
    expect((await post({ userId: 'u' })).status).toBe(401)
    expect(mockAuditCreate).not.toHaveBeenCalled()
  })
})

// ── 6. Wiring invariants — every booking creation flow is covered ─────────────

describe('booking-flow wiring', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

  it('all five /admin/book flows use the shared CustomerSelector', () => {
    for (const flow of ['hotel', 'tour', 'transfer', 'activity', 'flight']) {
      const src = read(`app/admin/book/${flow}/page.tsx`)
      expect(src).toContain('CustomerSelector')
    }
  })

  it('CustomerSelector blocks flagged selection behind DoNotBookWarning with a logged override', () => {
    const src = read('components/admin/booking/CustomerSelector.tsx')
    expect(src).toContain('DoNotBookWarning')
    expect(src).toContain('/api/admin/clients/do-not-book')
    // selection completes ONLY via the override callback for flagged clients
    expect(src).toContain('onOverride={() => completeSelect(dnbPending)}')
    // cancel path selects nothing
    expect(src).toContain('onCancel={() => setDnbPending(null)}')
  })

  it('quotes/new checks the client email against the block before creating', () => {
    const src = read('app/admin/quotes/new/page.tsx')
    expect(src).toContain('DoNotBookWarning')
    expect(src).toContain('/api/admin/clients/do-not-book?email=')
  })

  it('itinerary planner (proposals) checks the client email before creating', () => {
    const src = read('app/admin/itinerary-planner/page.tsx')
    expect(src).toContain('DoNotBookWarning')
    expect(src).toContain('/api/admin/clients/do-not-book?email=')
  })

  it('the warning is a blocking modal, and proceeding is gated on the server-side log', () => {
    const src = read('components/admin/DoNotBookWarning.tsx')
    expect(src).toContain('This client is flagged as Do Not Book')
    // onOverride fires only after the POST succeeds
    expect(src).toMatch(/if \(!res\.ok\) \{[\s\S]*?return[\s\S]*?\}[\s\S]*?onOverride\(\)/)
  })

  it('client search surfaces the flag (banner data available at search stage)', () => {
    const src = read('app/api/admin/clients/route.ts')
    expect(src).toContain('doNotBook: true')
    expect(src).toContain('doNotBookReason')
  })

  it('flaggedForReview is never read or written by the new do-not-book path', () => {
    for (const p of [
      'app/api/admin/clients/do-not-book/route.ts',
      'components/admin/DoNotBookWarning.tsx',
      'components/admin/booking/CustomerSelector.tsx',
    ]) {
      // Field usage looks like `flaggedForReview:` (select/where/data objects)
      // or property access — prose mentions in comments are fine.
      expect(read(p)).not.toMatch(/flaggedForReview\s*:|\.flaggedForReview/)
    }
  })
})
