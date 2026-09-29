/**
 * @jest-environment node
 *
 * My Walz Phase 1 — Jade contextual entry points.
 *
 * Rules under test:
 *  1. A client-supplied applicationId hint is only honoured when it belongs
 *     to the authenticated user — a foreign id silently resolves to no
 *     focusEntity (never leaks another client's application into context).
 *  2. Same for the pre-existing trip/booking/proposal hints — regression
 *     coverage so a future change can't accidentally start trusting the hint.
 *  3. The authenticated chat route requires a session and takes userId only
 *     from that session, never from the request body.
 *  4. Jade is never given a tool that can alter a Miles balance from a
 *     portal entry point.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8')

// ── DB mock covering every query buildPortalJadeContext fires ────────────────
const mockDb = {
  user:               { findUnique: jest.fn() },
  trip:               { findMany: jest.fn() },
  booking:            { findMany: jest.fn() },
  itinerary:          { findMany: jest.fn() },
  travellerProfile:   { findMany: jest.fn() },
  passportVault:      { findUnique: jest.fn() },
  portalNotification: { count: jest.fn() },
  portalDocument:     { count: jest.fn() },
  portalApplication:  { findMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockDb, prisma: mockDb }))

/* eslint-disable @typescript-eslint/no-var-requires */
const { buildPortalJadeContext } = require('@/lib/portal/portal-jade-context')

const OWNED_APPLICATION = { id: 'app_owned_1', stage: 'DOCUMENTS_PENDING', title: 'UK Visa', refNumber: 'WLZ-APP-1' }

function setUpBaseline() {
  mockDb.user.findUnique.mockResolvedValue({ name: 'Jane Doe', email: 'jane@example.com' })
  mockDb.trip.findMany.mockResolvedValue([])
  mockDb.booking.findMany.mockResolvedValue([])
  mockDb.itinerary.findMany.mockResolvedValue([])
  mockDb.travellerProfile.findMany.mockResolvedValue([])
  mockDb.passportVault.findUnique.mockResolvedValue(null)
  mockDb.portalNotification.count.mockResolvedValue(0)
  mockDb.portalDocument.count.mockResolvedValue(0)
  mockDb.portalApplication.findMany.mockResolvedValue([OWNED_APPLICATION])
}

beforeEach(() => {
  jest.clearAllMocks()
  setUpBaseline()
})

// ═════════════════════════════════════════════════════════════════════════════
describe('buildPortalJadeContext — applicationId hint ownership', () => {
  it('resolves focusEntity when the hinted application belongs to this user', async () => {
    const ctx = await buildPortalJadeContext('user_1', { applicationId: 'app_owned_1' })
    expect(ctx.focusEntity).toEqual({ type: 'application', id: 'app_owned_1', label: 'UK Visa' })
  })

  it('does NOT resolve focusEntity for an application belonging to another user (no leak)', async () => {
    // The query itself is already scoped to `where: { userId }` in the real
    // implementation — this simulates that scoping by simply not returning
    // the foreign application in the userId-scoped list.
    const ctx = await buildPortalJadeContext('user_1', { applicationId: 'someone_elses_app' })
    expect(ctx.focusEntity).toBeUndefined()
  })

  it('never throws or crashes on a bogus/malformed hint id', async () => {
    await expect(buildPortalJadeContext('user_1', { applicationId: '<script>alert(1)</script>' }))
      .resolves.not.toThrow()
  })
})

describe('buildPortalJadeContext — pre-existing trip/booking/proposal ownership (regression)', () => {
  it('trip hint only resolves for a trip already in the userId-scoped list', async () => {
    mockDb.trip.findMany.mockResolvedValue([{ id: 'trip_1', destination: 'Lagos', title: 'Trip', status: 'PLANNING', startDate: null, endDate: null, adults: 1, children: 0, infants: 0, items: [] }])
    const owned = await buildPortalJadeContext('user_1', { tripId: 'trip_1' })
    expect(owned.focusEntity?.type).toBe('trip')

    const foreign = await buildPortalJadeContext('user_1', { tripId: 'trip_owned_by_someone_else' })
    expect(foreign.focusEntity).toBeUndefined()
  })

  it('booking hint only resolves for a booking already in the userId-scoped list', async () => {
    mockDb.booking.findMany.mockResolvedValue([{ id: 'bk_1', bookingReference: 'WLZ-1', type: 'FLIGHT', status: 'CONFIRMED', paymentStatus: 'SUCCEEDED', totalAmount: 100, currency: 'GBP', flightDetails: null }])
    const owned = await buildPortalJadeContext('user_1', { bookingId: 'bk_1' })
    expect(owned.focusEntity?.type).toBe('booking')

    const foreign = await buildPortalJadeContext('user_1', { bookingId: 'someone_elses_booking' })
    expect(foreign.focusEntity).toBeUndefined()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('app/dashboard/jade/page.tsx — server-side hint parsing', () => {
  const src = readSource('app/dashboard/jade/page.tsx')

  it('requires an authenticated session before resolving any context', () => {
    expect(src).toContain('getServerSession(authOptions)')
    expect(src).toContain("redirect('/login?callbackUrl=/dashboard/jade')")
  })

  it('builds context via buildPortalJadeContext(session.user.id, hint) — never a client-supplied userId', () => {
    expect(src).toContain('buildPortalJadeContext(session.user.id, hint)')
  })

  it('parses the applicationId hint from the URL for the Visa/Application entry point', () => {
    expect(src).toContain('applicationId: searchParams.application')
  })
})

describe('app/api/jade/portal/chat/route.ts — session-authoritative, no financial tools', () => {
  const src = readSource('app/api/jade/portal/chat/route.ts')

  it('requires a valid session and returns 401 otherwise', () => {
    expect(src).toContain('getServerSession(authOptions)')
    expect(src).toMatch(/status:\s*401/)
  })

  it('takes userId only from the session, never from the request body', () => {
    expect(src).toContain('const userId = session.user.id')
    expect(src).not.toMatch(/body\.userId/)
  })

  it('context is built server-side via buildPortalJadeContext(userId, contextHint) with ownership verified inside', () => {
    expect(src).toContain('buildPortalJadeContext(userId, contextHint)')
  })
})

describe('Jade cannot alter Miles balances or fabricate bookings from a My Walz entry point', () => {
  it('portal Jade tool schemas do not expose a Miles-balance-mutating tool', () => {
    const toolsSrc = readSource('lib/portal/portal-jade-tools.ts')
    expect(toolsSrc).not.toMatch(/walzMilesTransaction\.(create|update|upsert|delete)/)
    expect(toolsSrc).not.toMatch(/walzRewardsMembership\.(create|update|upsert|delete)/)
    expect(toolsSrc).not.toMatch(/redeem/i)
  })
})
