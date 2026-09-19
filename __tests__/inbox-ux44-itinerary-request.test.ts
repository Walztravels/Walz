/**
 * INBOX UX-4.4 — Itinerary Request (Client Action Centre).
 *
 * Reuses the existing client-intake-to-itinerary pipeline (TripRequest,
 * its public page/API, and the existing admin conversion bridge) end to
 * end. Deliberately bypasses the existing admin mint route
 * (POST /api/admin/trip-requests) because it unconditionally fires an
 * invite email with no way to opt out — that would break the Client
 * Action Centre's Generate-never-sends discipline. This suite proves the
 * hard identity invariant (unchanged from every other Action Centre
 * action), the three-way existing-request/itinerary/ambiguous decision
 * tree, and the send-never-auto discipline in the new drawer.
 */

import fs from 'fs'
import path from 'path'

const mockPrisma = {
  tripRequest: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  itinerary: { findMany: jest.fn() },
  staffMember: { findMany: jest.fn() },
}
const mockResolve = jest.fn()
const mockEnsurePortalAccount = jest.fn()

// Named AND default export mocked — lib/action-centre/itinerary-request.ts
// imports the default, while the pre-existing public route
// app/api/trip-request/[token]/route.ts (touched by Fix 3) imports the
// named `{ prisma }` — both point at the same mock object.
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }))
jest.mock('@/lib/inbox/client-context', () => ({
  resolveClientActionContext: (...a: unknown[]) => mockResolve(...a),
}))
jest.mock('@/lib/portal-account', () => ({
  ensurePortalAccount: (...a: unknown[]) => mockEnsurePortalAccount(...a),
}))

import {
  createItineraryRequest, listRecentItineraryRequests,
} from '@/lib/action-centre/itinerary-request'
import { GET as tripRequestGET, POST as tripRequestPOST } from '@/app/api/trip-request/[token]/route'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const routeSrc = read('app/api/admin/inbox/conversations/[id]/itinerary-request/route.ts')
const serviceSrc = read('lib/action-centre/itinerary-request.ts')
const drawerSrc = read('app/admin/inbox/components/ItineraryRequestDrawer.tsx')
const clientInfoSrc = read('app/admin/inbox/components/ClientInfo.tsx')
const pageSrc = read('app/admin/inbox/page.tsx')
const migrationSrc = read('prisma/migrations/inbox_ux44_itinerary_request_conversation_columns.sql')

const SESSION = { email: 'staff@walztravels.com', role: 'staff', name: 'Staff' } as never

const BASE_CTX = {
  ok: true,
  context: {
    resolution: 'VERIFIED',
    contact: { name: 'Ama Mensah', email: 'ama@example.com', phone: '+233554000000' },
    user: null, clientAccount: null, prismaLead: null,
    application: null, link: null,
  },
}

const EXISTING_ROW = {
  id: 'tr-existing', referenceNumber: 'WALZ-REQ-ABC123', status: 'pending', token: 'tok_abc',
  expiresAt: new Date('2026-10-02T00:00:00Z'), submittedAt: null, createdAt: new Date('2026-09-18T10:00:00Z'),
  conversationId: 318,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockResolve.mockResolvedValue(BASE_CTX)
  mockPrisma.tripRequest.findFirst.mockResolvedValue(null)     // no request yet for THIS conversation
  mockPrisma.tripRequest.findMany.mockResolvedValue([])        // no client-wide TripRequest match
  mockPrisma.itinerary.findMany.mockResolvedValue([])          // no client-wide Itinerary match
  mockPrisma.tripRequest.findUnique.mockResolvedValue(null)    // referenceNumber uniqueness check
  mockPrisma.tripRequest.create.mockResolvedValue({
    id: 'tr-new', referenceNumber: 'WALZ-REQ-NEW123', status: 'pending', token: 'tok_new123',
    expiresAt: new Date('2026-10-02T00:00:00Z'), submittedAt: null, createdAt: new Date('2026-09-18T12:00:00Z'),
  })
  mockPrisma.tripRequest.update.mockResolvedValue({
    id: 'tr-existing', referenceNumber: 'WALZ-REQ-ABC123', status: 'pending', token: 'tok_abc',
    expiresAt: new Date('2026-10-02T00:00:00Z'), submittedAt: null, createdAt: new Date('2026-09-18T10:00:00Z'),
  })
  mockPrisma.staffMember.findMany.mockResolvedValue([])
  mockEnsurePortalAccount.mockResolvedValue({ userId: null })
})

function call(overrides: Record<string, unknown> = {}) {
  return createItineraryRequest({ session: SESSION, conversationId: 318, ...overrides })
}

// ── Hard identity invariant ──────────────────────────────────────────────────

describe('createItineraryRequest — hard identity invariant', () => {
  it('VERIFIED → allowed', async () => {
    const res = await call()
    expect(res.ok).toBe(true)
  })

  it('LINKED → allowed (LINKED is authoritative)', async () => {
    mockResolve.mockResolvedValue({ ok: true, context: { ...BASE_CTX.context, resolution: 'LINKED' } })
    const res = await call()
    expect(res.ok).toBe(true)
  })

  it.each(['HEURISTIC', 'UNRESOLVED'] as const)('%s → rejected, nothing persisted', async resolution => {
    mockResolve.mockResolvedValue({ ok: true, context: { ...BASE_CTX.context, resolution } })
    const res = await call()
    expect(res).toMatchObject({ ok: false, code: 'CLIENT_IDENTITY_REQUIRED' })
    expect(mockPrisma.tripRequest.create).not.toHaveBeenCalled()
    expect(mockPrisma.tripRequest.update).not.toHaveBeenCalled()
  })

  it('resolver denial (401/403) → rejected before any write', async () => {
    mockResolve.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' })
    const res = await call()
    expect(res).toMatchObject({ ok: false, code: 'CLIENT_IDENTITY_REQUIRED' })
    expect(mockPrisma.tripRequest.create).not.toHaveBeenCalled()
  })

  it('missing server-resolved email fails closed via the shared profile-completeness gate — never falls back to a browser value', async () => {
    mockResolve.mockResolvedValue({
      ok: true, context: { ...BASE_CTX.context, contact: { name: null, email: null, phone: null } },
    })
    const res = await call()
    // Identity (VERIFIED/LINKED) is already satisfied here — this is a
    // PROFILE COMPLETENESS failure, not an identity failure, and Itinerary
    // Request's own requirement is email-only (never widened to name/phone).
    expect(res).toMatchObject({ ok: false, code: 'CLIENT_PROFILE_INCOMPLETE', missingFields: ['email'] })
    expect(mockPrisma.tripRequest.create).not.toHaveBeenCalled()
  })
})

// ── Conversation-scoped duplicate guard ──────────────────────────────────────

describe('conversation already has a request', () => {
  it('rejects with REQUEST_ALREADY_EXISTS and the existing DTO, no create', async () => {
    mockPrisma.tripRequest.findFirst.mockResolvedValue(EXISTING_ROW)
    const res = await call()
    expect(res).toMatchObject({
      ok: false, code: 'REQUEST_ALREADY_EXISTS',
      existing: { id: 'tr-existing', referenceNumber: 'WALZ-REQ-ABC123', status: 'pending' },
    })
    expect(mockPrisma.tripRequest.create).not.toHaveBeenCalled()
    // client-wide dedup never even runs once the conversation-scoped check hits
    expect(mockPrisma.tripRequest.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.itinerary.findMany).not.toHaveBeenCalled()
  })

  it('the conversation-scoped lookup excludes converted requests (status: { not: \'converted\' })', async () => {
    await call()
    const where = mockPrisma.tripRequest.findFirst.mock.calls[0][0].where
    expect(where).toMatchObject({ conversationId: 318, status: { not: 'converted' } })
  })

  it.each(['pending', 'submitted', 'viewed'] as const)(
    'QA Bug A regression: a still-open (%s) TripRequest on this conversation still blocks a new one',
    async (status) => {
      mockPrisma.tripRequest.findFirst.mockResolvedValue({ ...EXISTING_ROW, status })
      const res = await call()
      expect(res).toMatchObject({ ok: false, code: 'REQUEST_ALREADY_EXISTS' })
      expect(mockPrisma.tripRequest.create).not.toHaveBeenCalled()
    },
  )

  it('QA Bug A fix: a conversation whose only TripRequest is already `converted` is NOT blocked — falls through to client-wide logic and can create a brand-new request', async () => {
    // Real DB behaviour: status: { not: 'converted' } means findFirst
    // itself would return null for a converted-only conversation.
    mockPrisma.tripRequest.findFirst.mockResolvedValue(null)
    const res = await call()
    expect(res).toMatchObject({ ok: true, data: { id: 'tr-new' } })
    expect(mockPrisma.tripRequest.create).toHaveBeenCalledTimes(1)
  })
})

// ── Race guard (Fix 4 — security review MEDIUM) ─────────────────────────────

describe('createItineraryRequest — race guard against concurrent double-submit', () => {
  it('a TripRequest created moments ago for THIS conversation blocks a racing second create, mirroring visa-form.ts\'s recentLink re-check', async () => {
    const recent = {
      id: 'tr-race', referenceNumber: 'WALZ-REQ-RACE01', status: 'pending', token: 'tok_race',
      conversationId: 318, expiresAt: null, submittedAt: null, createdAt: new Date(),
    }
    mockPrisma.tripRequest.findFirst
      .mockResolvedValueOnce(null)   // (1) conversation-scoped check — nothing yet
      .mockResolvedValueOnce(recent) // (2) immediate pre-create re-check — a racing request just landed
    const res = await call()
    expect(res).toMatchObject({ ok: false, code: 'REQUEST_ALREADY_EXISTS', existing: { id: 'tr-race' } })
    expect(mockPrisma.tripRequest.create).not.toHaveBeenCalled()
  })

  it('no recent race match → proceeds to create normally', async () => {
    mockPrisma.tripRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    const res = await call()
    expect(res).toMatchObject({ ok: true, data: { id: 'tr-new' } })
    expect(mockPrisma.tripRequest.create).toHaveBeenCalledTimes(1)
  })

  it('the pre-create re-check window is scoped to the last ~10 seconds', () => {
    expect(serviceSrc).toContain('createdAt: { gte: new Date(Date.now() - 10_000) }')
  })
})

// ── Three-way existing-request/itinerary/ambiguous decision tree ───────────

describe('client-wide duplicate prevention', () => {
  it('zero matches → proceeds to create a brand-new request', async () => {
    const res = await call()
    expect(res).toMatchObject({ ok: true, data: { id: 'tr-new' } })
    expect(mockPrisma.tripRequest.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.tripRequest.update).not.toHaveBeenCalled()
  })

  it('exactly one open TripRequest elsewhere → links THIS conversation to it, no duplicate created', async () => {
    mockPrisma.tripRequest.findMany.mockResolvedValue([
      { id: 'tr-other', referenceNumber: 'WALZ-REQ-OLD999', status: 'submitted', token: 'tok_old', conversationId: 900, expiresAt: null, submittedAt: new Date('2026-09-10T00:00:00Z'), createdAt: new Date('2026-09-01T00:00:00Z') },
    ])
    const res = await call()
    expect(res).toMatchObject({ ok: true, data: { id: 'tr-existing' } })
    expect(mockPrisma.tripRequest.create).not.toHaveBeenCalled()
    const updateCall = mockPrisma.tripRequest.update.mock.calls[0][0]
    expect(updateCall.where).toEqual({ id: 'tr-other' })
    expect(updateCall.data).toMatchObject({ conversationId: 318, source: 'inbox_action_centre' })
  })

  it('exactly one existing Itinerary → ITINERARY_ALREADY_EXISTS, no duplicate created', async () => {
    mockPrisma.itinerary.findMany.mockResolvedValue([
      { id: 'itin-1', referenceNumber: 'WALZ-XYZ999' },
    ])
    const res = await call()
    expect(res).toMatchObject({ ok: false, code: 'ITINERARY_ALREADY_EXISTS', itineraryRef: 'WALZ-XYZ999' })
    expect(mockPrisma.tripRequest.create).not.toHaveBeenCalled()
    expect(mockPrisma.tripRequest.update).not.toHaveBeenCalled()
  })

  it('more than one match (two TripRequests) → AMBIGUOUS_REQUEST, nothing created', async () => {
    mockPrisma.tripRequest.findMany.mockResolvedValue([
      { id: 'tr-a', referenceNumber: 'WALZ-REQ-A', status: 'pending', token: 't1', conversationId: null, expiresAt: null, submittedAt: null, createdAt: new Date() },
      { id: 'tr-b', referenceNumber: 'WALZ-REQ-B', status: 'submitted', token: 't2', conversationId: null, expiresAt: null, submittedAt: null, createdAt: new Date() },
    ])
    const res = await call()
    expect(res).toMatchObject({ ok: false, code: 'AMBIGUOUS_REQUEST' })
    expect(mockPrisma.tripRequest.create).not.toHaveBeenCalled()
    expect(mockPrisma.tripRequest.update).not.toHaveBeenCalled()
  })

  it('more than one match (two Itineraries) → AMBIGUOUS_REQUEST, nothing created', async () => {
    mockPrisma.itinerary.findMany.mockResolvedValue([
      { id: 'itin-1', referenceNumber: 'WALZ-A' },
      { id: 'itin-2', referenceNumber: 'WALZ-B' },
    ])
    const res = await call()
    expect(res).toMatchObject({ ok: false, code: 'AMBIGUOUS_REQUEST' })
    expect(mockPrisma.tripRequest.create).not.toHaveBeenCalled()
  })

  it('more than one match (mixed: one TripRequest + one Itinerary) → AMBIGUOUS_REQUEST, never guesses', async () => {
    mockPrisma.tripRequest.findMany.mockResolvedValue([
      { id: 'tr-a', referenceNumber: 'WALZ-REQ-A', status: 'pending', token: 't1', conversationId: null, expiresAt: null, submittedAt: null, createdAt: new Date() },
    ])
    mockPrisma.itinerary.findMany.mockResolvedValue([
      { id: 'itin-1', referenceNumber: 'WALZ-A' },
    ])
    const res = await call()
    expect(res).toMatchObject({ ok: false, code: 'AMBIGUOUS_REQUEST' })
    expect(mockPrisma.tripRequest.create).not.toHaveBeenCalled()
    expect(mockPrisma.tripRequest.update).not.toHaveBeenCalled()
  })

  it('match keys: userId (when linked) OR normalized email — never clientAccountId (TripRequest has no such column)', async () => {
    mockResolve.mockResolvedValue({ ok: true, context: { ...BASE_CTX.context, user: { id: 'user-1' } } })
    await call()
    const where = mockPrisma.tripRequest.findMany.mock.calls[0][0].where
    expect(where.OR).toEqual(expect.arrayContaining([
      { userId: 'user-1' },
      { email: { equals: 'ama@example.com', mode: 'insensitive' } },
    ]))
    expect(where.status).toEqual({ not: 'converted' })
  })

  it('Itinerary match keys: clientAccountId (when linked) OR normalized clientEmail', async () => {
    mockResolve.mockResolvedValue({ ok: true, context: { ...BASE_CTX.context, clientAccount: { id: 'acct-1' } } })
    await call()
    const where = mockPrisma.itinerary.findMany.mock.calls[0][0].where
    expect(where.OR).toEqual(expect.arrayContaining([
      { clientAccountId: 'acct-1' },
      { clientEmail: { equals: 'ama@example.com', mode: 'insensitive' } },
    ]))
  })

  // ── QA Bug B fix: client-wide Itinerary check must exclude terminal
  // status. Confirmed vocabulary (see the comment above findExistingForClient
  // in lib/action-centre/itinerary-request.ts): draft/proposal/approved/
  // revision_sent/revision_accepted/live/archived — 'archived' is the only
  // real terminal/closed state in use; there is no completed/cancelled/
  // delivered value anywhere in the codebase.
  it('QA Bug B fix: the Itinerary lookup excludes archived itineraries (status: { not: \'archived\' })', async () => {
    await call()
    const where = mockPrisma.itinerary.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ status: { not: 'archived' } })
  })

  it('QA Bug B fix: a client whose only Itinerary is archived is NOT blocked — a brand-new request can be created', async () => {
    // Real DB behaviour: status: { not: 'archived' } means findMany itself
    // would return zero rows for a client with only an archived itinerary.
    mockPrisma.itinerary.findMany.mockResolvedValue([])
    const res = await call()
    expect(res).toMatchObject({ ok: true, data: { id: 'tr-new' } })
    expect(mockPrisma.tripRequest.create).toHaveBeenCalledTimes(1)
  })

  it('QA Bug B regression: a client with an active/in-progress Itinerary (e.g. \'proposal\') is still correctly blocked', async () => {
    mockPrisma.itinerary.findMany.mockResolvedValue([
      { id: 'itin-1', referenceNumber: 'WALZ-XYZ999' },
    ])
    const res = await call()
    expect(res).toMatchObject({ ok: false, code: 'ITINERARY_ALREADY_EXISTS', itineraryRef: 'WALZ-XYZ999' })
    expect(mockPrisma.tripRequest.create).not.toHaveBeenCalled()
  })
})

// ── Server-resolved-contact-only, input validation, token/expiry ───────────

describe('createItineraryRequest — creation specifics', () => {
  it('persists using SERVER-resolved contact fields only — the input type carries no name/email at all', async () => {
    await call({ destination: 'Dubai' })
    const data = mockPrisma.tripRequest.create.mock.calls[0][0].data
    expect(data.email).toBe('ama@example.com')
    expect(data.firstName).toBe('Ama')
    expect(data.lastName).toBe('Mensah')
    expect(data.destination).toBe('Dubai')
    expect(data.source).toBe('inbox_action_centre')
    expect(data.conversationId).toBe(318)
    expect(data.status).toBe('pending')
  })

  it('every pre-fill field is optional — a bare call with no extra input still creates a request', async () => {
    const res = await call()
    expect(res.ok).toBe(true)
    const data = mockPrisma.tripRequest.create.mock.calls[0][0].data
    expect(data.destination).toBeNull()
    expect(data.departureDate).toBeNull()
    expect(data.returnDate).toBeNull()
  })

  it('rejects a malformed departureDate without creating anything', async () => {
    const res = await call({ departureDate: 'not-a-date' })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
    expect(mockPrisma.tripRequest.create).not.toHaveBeenCalled()
  })

  it('rejects an out-of-range numberOfTravellers without creating anything', async () => {
    const res = await call({ numberOfTravellers: 0 })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
    expect(mockPrisma.tripRequest.create).not.toHaveBeenCalled()
  })

  it('generates the token via crypto.randomBytes(32).toString(\'hex\') — the same convention as the existing admin mint route', () => {
    expect(serviceSrc).toContain("crypto.randomBytes(32).toString('hex')")
  })

  it('sets a 14-day expiresAt on the newly created request', async () => {
    await call()
    const data = mockPrisma.tripRequest.create.mock.calls[0][0].data
    expect(data.expiresAt).toBeInstanceOf(Date)
    const days = (data.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    expect(days).toBeGreaterThan(13.9)
    expect(days).toBeLessThan(14.1)
  })

  it('the service NEVER calls the existing invite-email admin route or Resend directly', () => {
    expect(serviceSrc).not.toContain('getResend')
    expect(serviceSrc).not.toMatch(/fetch\(['"`].*trip-requests/)
    expect(serviceSrc).not.toContain('buildInviteEmail')
  })
})

// ── listRecentItineraryRequests ──────────────────────────────────────────────

describe('listRecentItineraryRequests', () => {
  it('never throws on a store failure — degrades to an empty list', async () => {
    mockPrisma.tripRequest.findMany.mockRejectedValue(new Error('db down'))
    const actions = await listRecentItineraryRequests(318)
    expect(actions).toEqual([])
  })

  it('scoped strictly to the given conversationId — never another client’s data', async () => {
    mockPrisma.tripRequest.findMany.mockResolvedValue([])
    await listRecentItineraryRequests(318)
    expect(mockPrisma.tripRequest.findMany.mock.calls[0][0].where).toEqual({ conversationId: 318 })
  })

  it('maps rows to a safe DTO including a rebuildable client link', async () => {
    mockPrisma.tripRequest.findMany.mockResolvedValue([EXISTING_ROW])
    const actions = await listRecentItineraryRequests(318)
    expect(actions).toEqual([{
      id: 'tr-existing', referenceNumber: 'WALZ-REQ-ABC123', status: 'pending',
      link: expect.stringContaining('/trip-request/tok_abc'),
      expiresAt: EXISTING_ROW.expiresAt.toISOString(),
      submittedAt: null,
      createdAt: EXISTING_ROW.createdAt.toISOString(),
    }])
  })
})

// ── Route: action dispatch, authz, IDOR (source pins) ───────────────────────

describe('itinerary-request route — dispatch (source pins)', () => {
  it('full auth chain before any mutation: session -> inbox_view -> conversation access -> inbox_assign -> rate limit -> service', () => {
    const sIdx = routeSrc.indexOf('getAdminSession()')
    const vIdx = routeSrc.indexOf("checkInboxPermission(session, 'inbox_view')")
    const aIdx = routeSrc.indexOf('checkConversationAccess(session, params.id)')
    const assignIdx = routeSrc.indexOf("checkInboxPermission(session, 'inbox_assign')")
    const rlIdx = routeSrc.indexOf('rateLimit({ key: `itinerary-request:')
    const svcIdx = routeSrc.indexOf('await createItineraryRequest(')
    expect(sIdx).toBeGreaterThan(-1)
    expect(sIdx).toBeLessThan(vIdx)
    expect(vIdx).toBeLessThan(aIdx)
    expect(aIdx).toBeLessThan(assignIdx)
    expect(assignIdx).toBeLessThan(rlIdx)
    expect(rlIdx).toBeLessThan(svcIdx)
  })

  it('no action discriminator — a bare POST is sufficient (mirrors Request Payment, not the multi-action Visa Form route)', () => {
    expect(routeSrc).not.toContain("body.action")
    expect(routeSrc).not.toContain("action === 'create")
  })

  it('error codes map to sensible HTTP statuses', () => {
    expect(routeSrc).toContain("result.code === 'CLIENT_IDENTITY_REQUIRED' ? 403")
    expect(routeSrc).toContain("result.code === 'REQUEST_ALREADY_EXISTS' || result.code === 'AMBIGUOUS_REQUEST' || result.code === 'ITINERARY_ALREADY_EXISTS' ? 409")
    expect(routeSrc).toContain("result.code === 'PERSIST_FAILED' ? 502")
  })

  it('GET is read-only — no persistence call anywhere in the GET handler', () => {
    const getFn = routeSrc.slice(routeSrc.indexOf('export async function GET'), routeSrc.indexOf('export async function POST'))
    expect(getFn).toContain('listRecentItineraryRequests')
    expect(getFn).not.toContain('createItineraryRequest')
  })
})

// ── Fix 3 (security MEDIUM): expiresAt enforcement on the PRE-EXISTING
// public redemption route, app/api/trip-request/[token]/route.ts ──────────

describe('public trip-request route — expiresAt enforcement (Fix 3)', () => {
  const FUTURE = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
  const PAST = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)

  function baseRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'tr-1', token: 'tok-1', referenceNumber: 'WALZ-REQ-XYZ', status: 'pending',
      formOpenedAt: null, sentBy: null, firstName: null, lastName: null,
      email: 'client@example.com', phone: null, ...overrides,
    }
  }
  const params = Promise.resolve({ token: 'tok-1' })
  function fakeReq(body: Record<string, unknown> = {}) {
    return {
      headers: { get: () => '' },
      json: async () => body,
    } as never
  }

  it('GET: an expired token (past expiresAt) is rejected — same shape/status as the existing not-found case', async () => {
    mockPrisma.tripRequest.findUnique.mockResolvedValue(baseRow({ expiresAt: PAST }))
    const res = await tripRequestGET({} as never, { params })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ error: 'Invalid or expired link' })
    expect(mockPrisma.tripRequest.update).not.toHaveBeenCalled()
  })

  it('POST: an expired token (past expiresAt) is rejected before any write', async () => {
    mockPrisma.tripRequest.findUnique.mockResolvedValue(baseRow({ expiresAt: PAST }))
    const res = await tripRequestPOST(fakeReq({ email: 'client@example.com' }), { params })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/expired/i)
    expect(mockPrisma.tripRequest.update).not.toHaveBeenCalled()
  })

  it('GET: a null expiresAt (every pre-existing row, created before this column existed) is completely unaffected', async () => {
    mockPrisma.tripRequest.findUnique.mockResolvedValue(baseRow({ expiresAt: null }))
    const res = await tripRequestGET({} as never, { params })
    expect(res.status).toBe(200)
  })

  it('POST: a null expiresAt still submits successfully exactly as before', async () => {
    mockPrisma.tripRequest.findUnique.mockResolvedValue(baseRow({ expiresAt: null }))
    mockPrisma.tripRequest.update.mockResolvedValue({ id: 'tr-1', referenceNumber: 'WALZ-REQ-XYZ' })
    const res = await tripRequestPOST(fakeReq({ email: 'client@example.com', firstName: 'Ama' }), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ success: true, referenceNumber: 'WALZ-REQ-XYZ' })
  })

  it('GET/POST: a non-expired token (future expiresAt) still works exactly as before', async () => {
    mockPrisma.tripRequest.findUnique.mockResolvedValue(baseRow({ expiresAt: FUTURE }))
    const getRes = await tripRequestGET({} as never, { params })
    expect(getRes.status).toBe(200)

    mockPrisma.tripRequest.update.mockResolvedValue({ id: 'tr-1', referenceNumber: 'WALZ-REQ-XYZ' })
    const postRes = await tripRequestPOST(fakeReq({ email: 'client@example.com' }), { params })
    expect(postRes.status).toBe(200)
  })
})

// ── Protected systems — hard boundary ────────────────────────────────────────

describe('protected systems: convert route, public trip-request pages, and generators are never touched', () => {
  it('no reference to any protected system in the new files', () => {
    const all = serviceSrc + routeSrc + drawerSrc
    expect(all).not.toMatch(/generate-letter|letter-generator|ticket-generator|dummy-ticket/i)
    expect(all).not.toMatch(/sla-escalation|routing-escalation/i)
  })

  it('the convert route itself was not modified by this feature (still the single, existing conversion path)', () => {
    const convertSrc = read('app/api/admin/trip-requests/[id]/convert/route.ts')
    expect(convertSrc).not.toContain('inbox_action_centre')
    expect(convertSrc).not.toContain('itinerary-request')
  })
})

// ── Drawer: send-never-auto, a11y, identity gate (source pins) ─────────────

describe('ItineraryRequestDrawer — discipline and a11y (source pins)', () => {
  it('Generate never calls onSendMessage', () => {
    const fn = drawerSrc.slice(drawerSrc.indexOf('async function handleCreate'), drawerSrc.indexOf('function buildRequestMessage'))
    expect(fn).not.toContain('onSendMessage')
  })

  it('Insert into reply uses insertDraft and never sends; explicit Send is the only path to onSendMessage', () => {
    expect(drawerSrc).toContain('insertDraft(text)')
    const ins = drawerSrc.slice(drawerSrc.indexOf('function handleInsert'), drawerSrc.indexOf('async function handleSendToClient'))
    expect(ins).not.toContain('onSendMessage')
    expect(drawerSrc).toContain('await onSendMessage(text)')
  })

  it('a failed send never shows Sent (boolean contract from the existing path)', () => {
    expect(drawerSrc).toContain('if (ok) setSent(true)')
    expect(drawerSrc).toContain('The message could not be sent. Try again.')
  })

  it('Fix 5: the existing-request view computes and renders expiresAt (Expires in N days / Expired), client-side from the DTO', () => {
    expect(drawerSrc).toContain('function expiryLabel(')
    expect(drawerSrc).toContain('expiryLabel(existing.expiresAt)')
    expect(drawerSrc).toContain('Expires in')
    expect(drawerSrc).toContain("text: 'Expired', expired: true")
  })

  it('a11y: dialog + Esc + Tab trap (:disabled-aware) + focus restore + safe-area + motion-safe', () => {
    expect(drawerSrc).toContain('role="dialog"')
    expect(drawerSrc).toContain("e.key === 'Escape'")
    expect(drawerSrc).toContain("!el.matches(':disabled')")
    expect(drawerSrc).toContain('restoreRef.current?.focus()')
    expect(drawerSrc).toContain('safe-area-inset-bottom')
    expect(drawerSrc).toContain('motion-safe:transition-transform')
  })

  it('stale-response guard on context load (conversation-switch safety)', () => {
    expect(drawerSrc).toContain('loadSeqRef.current')
  })

  it('identity gate mirrors the server; drawer never shows a heuristic identity as usable', () => {
    expect(drawerSrc).toContain("ctx?.resolution === 'VERIFIED' || ctx?.resolution === 'LINKED'")
    expect(drawerSrc).toContain('Client identity required')
  })

  it('all interactive elements meet the 44px touch-target convention', () => {
    expect(drawerSrc).not.toMatch(/min-h-\[(?:2\d|3\d)px\]/)
  })

  it('never builds a full itinerary planner in the drawer — only links out to the existing admin surface', () => {
    expect(drawerSrc).toContain('/admin/trip-requests')
    expect(drawerSrc).not.toMatch(/itinerary-planner.*<input|<select.*itinerary-planner/i)
  })
})

// ── Wiring: force-close on conversation/screen change, both ClientInfo sites ─

describe('page wiring: itinerary request drawer force-closed on conversation change and screen change', () => {
  it('applyConvSelection closes the itinerary request drawer', () => {
    const fn = pageSrc.slice(pageSrc.indexOf('function applyConvSelection'), pageSrc.indexOf('function doSelectConv'))
    expect(fn).toContain('setItineraryRequestOpen(false)')
  })

  it('the screen-change effect closes it alongside payment/quote/visa/identity/copilot', () => {
    const fn = pageSrc.slice(pageSrc.indexOf('prevScreenRef.current'), pageSrc.indexOf('}, [screens.screen])'))
    expect(fn).toContain('setItineraryRequestOpen(false)')
  })

  it('both rail and overlay ClientInfo wire onOpenItineraryRequest', () => {
    expect(pageSrc.match(/onOpenItineraryRequest=/g)?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('ClientInfo Quick Actions: Itinerary Request gated identically to the other three actions', () => {
  it('a fourth live button exists, disabled below VERIFIED/LINKED; the roadmap placeholder is fully retired', () => {
    expect(clientInfoSrc).toContain('Itinerary Request')
    expect(clientInfoSrc).toContain('onOpenItineraryRequest')
    expect(clientInfoSrc).not.toContain('coming with the next release')
  })
})

// ── Migration + schema ────────────────────────────────────────────────────────

describe('migration + schema', () => {
  it('additive nullable columns only, on the EXISTING TripRequest table — no new persistence system', () => {
    expect(migrationSrc).toContain('ALTER TABLE "TripRequest"')
    expect(migrationSrc).toContain('ADD COLUMN IF NOT EXISTS "conversationId"')
    expect(migrationSrc).toContain('ADD COLUMN IF NOT EXISTS "expiresAt"')
    expect(migrationSrc).not.toMatch(/CREATE TABLE|\bDROP\b|\bDELETE\b|\bUPDATE\b/i)
    expect(migrationSrc).toContain("'inbox_ux44' AS migration")
  })

  it('Prisma model gained the columns (SQL-editor-managed)', () => {
    const schema = read('prisma/schema.prisma')
    const model = schema.slice(schema.indexOf('model TripRequest {'), schema.indexOf('model MarketingBrandMemory'))
    expect(model).toContain('conversationId Int?')
    expect(model).toContain('expiresAt      DateTime? @db.Timestamptz')
    expect(model).toContain('NEVER prisma db push')
  })
})
