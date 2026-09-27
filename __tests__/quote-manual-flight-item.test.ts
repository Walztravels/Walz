/**
 * QUOTE BUILDER V1.4 — Agent C (Manual Flight Entry).
 * app/api/admin/quotes/[id]/items/route.ts (POST)
 *
 * This route did not exist before this pass — see that file's own header
 * comment for the full persistence-path audit (why a NEW route, mirroring
 * add-to-quote's dual-write pattern, instead of touching
 * app/api/admin/quotes/route.ts's items[] handling).
 *
 * Coverage: auth/permission, quote-not-found/not-editable, Inbox identity
 * re-check, currency-must-match-quote gate (manual entries have no
 * supplier offer to FX-convert against), full input validation (missing
 * required fields, non-positive prices, invalid/out-of-order dates, leg
 * count vs tripType consistency, leg cap), and — the core requirement —
 * that a one-way/return/multi-city manual flight EACH produce exactly ONE
 * QuoteFlightOption + ONE QuoteItem row (never one per leg), with N
 * QuoteFlightSegment rows in leg order.
 */
const mockPrisma = {
  quote: { findUnique: jest.fn() },
  quoteFlightOption: { create: jest.fn() },
  quoteItem: { create: jest.fn(), findMany: jest.fn() },
  quoteActivity: { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: jest.fn() }))
jest.mock('@/lib/inbox/client-context', () => ({ resolveClientActionContext: jest.fn() }))
const mockUpdateQuoteTotals = jest.fn()
jest.mock('@/lib/quotes/update-totals', () => ({ updateQuoteTotals: (...a: unknown[]) => mockUpdateQuoteTotals(...a) }))

import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { POST } from '@/app/api/admin/quotes/[id]/items/route'

const SESSION = { email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} }
const DRAFT_QUOTE = { id: 'q1', status: 'draft', currency: 'GBP', conversationId: null }

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}
function ctx(id: string) {
  return { params: { id } }
}

const ONE_WAY_LEG = {
  originCode: 'LOS', destinationCode: 'DXB',
  departureAt: '2026-12-01T09:00:00', arrivalAt: '2026-12-01T18:00:00',
  flightNumber: 'QR101', stops: 0,
}
const RETURN_LEG = {
  originCode: 'DXB', destinationCode: 'LOS',
  departureAt: '2026-12-08T02:00:00', arrivalAt: '2026-12-08T09:00:00',
  flightNumber: 'QR102', stops: 0,
}
const THIRD_LEG = {
  originCode: 'LOS', destinationCode: 'LHR',
  departureAt: '2026-12-15T09:00:00', arrivalAt: '2026-12-15T15:00:00',
  flightNumber: 'QR103', stops: 1,
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    type: 'flight', sourceType: 'manual', tripType: 'one-way',
    airline: 'Qatar Airways', airlineCode: 'QR', cabinClass: 'economy',
    fareClass: 'Y', baggage: '1 x 23kg',
    costMinor: 200000, sellingPriceMinor: 235000, currency: 'GBP',
    notes: 'Booked by staff', segments: [ONE_WAY_LEG],
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(hasPermission as jest.Mock).mockReturnValue(true)
  mockPrisma.quote.findUnique.mockResolvedValue(DRAFT_QUOTE)
  mockPrisma.quoteFlightOption.create.mockResolvedValue({ id: 'fo1', segments: [] })
  mockPrisma.quoteItem.create.mockResolvedValue({ id: 'i1', title: 'Qatar Airways · LOS → DXB' })
  mockPrisma.quoteActivity.create.mockResolvedValue({})
  mockUpdateQuoteTotals.mockResolvedValue(undefined)
})

describe('Auth / permission', () => {
  it('401 when unauthenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await POST(req(basePayload()), ctx('q1'))
    expect(res.status).toBe(401)
  })

  it('403 without quotes.create (same permission add-to-quote uses for its ADD action)', async () => {
    ;(hasPermission as jest.Mock).mockReturnValue(false)
    const res = await POST(req(basePayload()), ctx('q1'))
    expect(res.status).toBe(403)
    expect(hasPermission).toHaveBeenCalledWith(SESSION, 'quotes.create')
  })
})

describe('Quote lookup / editability', () => {
  it('404s when the quote does not exist', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(null)
    const res = await POST(req(basePayload()), ctx('missing'))
    expect(res.status).toBe(404)
  })

  it.each(['converted', 'archived', 'cancelled'])('409s on a %s quote', async (status) => {
    mockPrisma.quote.findUnique.mockResolvedValue({ ...DRAFT_QUOTE, status })
    const res = await POST(req(basePayload()), ctx('q1'))
    expect(res.status).toBe(409)
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
  })
})

describe('Inbox identity re-check', () => {
  it('blocks when conversationId is set and identity is not VERIFIED/LINKED', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ ...DRAFT_QUOTE, conversationId: 42 })
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'HEURISTIC' } })
    const res = await POST(req(basePayload()), ctx('q1'))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('CLIENT_IDENTITY_REQUIRED')
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
  })

  it('allows when identity is VERIFIED', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ ...DRAFT_QUOTE, conversationId: 42 })
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'VERIFIED' } })
    const res = await POST(req(basePayload()), ctx('q1'))
    expect(res.status).toBe(200)
  })
})

describe('Currency — manual entries must match the quote currency (no FX path for an unverified manual price)', () => {
  it('rejects a currency that differs from the quote', async () => {
    const res = await POST(req(basePayload({ currency: 'USD' })), ctx('q1'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('CURRENCY_MISMATCH')
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
  })

  it('accepts (case-insensitively) a currency matching the quote', async () => {
    const res = await POST(req(basePayload({ currency: 'gbp' })), ctx('q1'))
    expect(res.status).toBe(200)
  })
})

describe('Input validation — reject with 400, never silently coerce', () => {
  it('rejects an unsupported type', async () => {
    const res = await POST(req(basePayload({ type: 'hotel' })), ctx('q1'))
    expect(res.status).toBe(400)
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
  })

  it('rejects a missing airline', async () => {
    const res = await POST(req(basePayload({ airline: '' })), ctx('q1'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_INPUT')
  })

  it('rejects an invalid cabin class', async () => {
    const res = await POST(req(basePayload({ cabinClass: 'super-cabin' })), ctx('q1'))
    expect(res.status).toBe(400)
  })

  it('rejects a negative supplier cost', async () => {
    const res = await POST(req(basePayload({ costMinor: -500 })), ctx('q1'))
    expect(res.status).toBe(400)
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
  })

  it('rejects a zero/non-positive selling price', async () => {
    const res = await POST(req(basePayload({ sellingPriceMinor: 0 })), ctx('q1'))
    expect(res.status).toBe(400)
  })

  it('rejects a non-integer minor amount', async () => {
    const res = await POST(req(basePayload({ costMinor: 199999.5 })), ctx('q1'))
    expect(res.status).toBe(400)
  })

  it('rejects an empty segments array', async () => {
    const res = await POST(req(basePayload({ segments: [] })), ctx('q1'))
    expect(res.status).toBe(400)
  })

  it('rejects a segment with an unparseable departure date', async () => {
    const res = await POST(req(basePayload({ segments: [{ ...ONE_WAY_LEG, departureAt: 'not-a-date' }] })), ctx('q1'))
    expect(res.status).toBe(400)
  })

  it('rejects a segment where arrival is not after departure', async () => {
    const res = await POST(req(basePayload({ segments: [{ ...ONE_WAY_LEG, arrivalAt: ONE_WAY_LEG.departureAt }] })), ctx('q1'))
    expect(res.status).toBe(400)
  })

  it('rejects a segment missing an origin/destination', async () => {
    const res = await POST(req(basePayload({ segments: [{ ...ONE_WAY_LEG, originCode: '' }] })), ctx('q1'))
    expect(res.status).toBe(400)
  })

  it('rejects tripType "one-way" with 2 segments (leg count must match trip type)', async () => {
    const res = await POST(req(basePayload({ tripType: 'one-way', segments: [ONE_WAY_LEG, RETURN_LEG] })), ctx('q1'))
    expect(res.status).toBe(400)
  })

  it('rejects tripType "round-trip" with only 1 segment', async () => {
    const res = await POST(req(basePayload({ tripType: 'round-trip', segments: [ONE_WAY_LEG] })), ctx('q1'))
    expect(res.status).toBe(400)
  })

  it('rejects more than the manual-flight leg cap (5)', async () => {
    const tooManyLegs = Array.from({ length: 6 }, (_, i) => ({ ...ONE_WAY_LEG, flightNumber: `QR${100 + i}` }))
    const res = await POST(req(basePayload({ tripType: 'multi-city', segments: tooManyLegs })), ctx('q1'))
    expect(res.status).toBe(400)
  })

  it('never calls prisma when validation fails', async () => {
    await POST(req(basePayload({ airline: '' })), ctx('q1'))
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
    expect(mockPrisma.quoteItem.create).not.toHaveBeenCalled()
    expect(mockUpdateQuoteTotals).not.toHaveBeenCalled()
  })
})

describe('One-way — ONE QuoteFlightOption + ONE QuoteItem + 1 segment', () => {
  it('creates exactly one option/item pair with a single segment, duffelOfferId null, sourceType manual', async () => {
    const res = await POST(req(basePayload()), ctx('q1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quoteFlightOption.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.quoteItem.create).toHaveBeenCalledTimes(1)

    const optionArgs = mockPrisma.quoteFlightOption.create.mock.calls[0][0]
    expect(optionArgs.data.duffelOfferId).toBeNull()
    expect(optionArgs.data.sourceType).toBe('manual')
    expect(optionArgs.data.quoteId).toBe('q1')
    expect(optionArgs.data.segments.create).toHaveLength(1)
    expect(optionArgs.data.segments.create[0]).toMatchObject({ originCode: 'LOS', destinationCode: 'DXB', segmentOrder: 0 })

    const itemArgs = mockPrisma.quoteItem.create.mock.calls[0][0]
    expect(itemArgs.data.flightOptionId).toBe('fo1')
    expect(itemArgs.data.type).toBe('flight')
    expect(itemArgs.data.sourceType).toBe('manual')

    expect(mockUpdateQuoteTotals).toHaveBeenCalledWith('q1')
    expect(mockPrisma.quoteActivity.create).toHaveBeenCalled()
  })

  it('trusts the staff-entered cost/selling price directly (no revalidation call of any kind)', async () => {
    await POST(req(basePayload()), ctx('q1'))
    const optionArgs = mockPrisma.quoteFlightOption.create.mock.calls[0][0]
    expect(optionArgs.data.costMinor).toBe(BigInt(200000))
    expect(optionArgs.data.sellingPriceMinor).toBe(BigInt(235000))
    expect(optionArgs.data.markupMinor).toBe(BigInt(35000)) // sellingPrice - cost, computed server-side
  })
})

describe('Return trip — ONE QuoteFlightOption/QuoteItem, 2 journeys of segments (count is 1, not 2)', () => {
  it('creates a single option/item pair carrying both outbound and return segments', async () => {
    const res = await POST(req(basePayload({ tripType: 'round-trip', segments: [ONE_WAY_LEG, RETURN_LEG] })), ctx('q1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quoteFlightOption.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.quoteItem.create).toHaveBeenCalledTimes(1)

    const optionArgs = mockPrisma.quoteFlightOption.create.mock.calls[0][0]
    expect(optionArgs.data.tripType).toBe('round-trip')
    expect(optionArgs.data.segments.create).toHaveLength(2)
    expect(optionArgs.data.segments.create.map((s: { segmentOrder: number }) => s.segmentOrder)).toEqual([0, 1])
    expect(optionArgs.data.segments.create[0].originCode).toBe('LOS')
    expect(optionArgs.data.segments.create[1].originCode).toBe('DXB')
  })
})

describe('Multi-city (3+ legs) — still ONE item, N segment groups in leg order', () => {
  it('creates a single option/item pair carrying all three legs, in order', async () => {
    const res = await POST(
      req(basePayload({ tripType: 'multi-city', segments: [ONE_WAY_LEG, RETURN_LEG, THIRD_LEG] })),
      ctx('q1'),
    )
    expect(res.status).toBe(200)
    expect(mockPrisma.quoteFlightOption.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.quoteItem.create).toHaveBeenCalledTimes(1)

    const optionArgs = mockPrisma.quoteFlightOption.create.mock.calls[0][0]
    expect(optionArgs.data.segments.create).toHaveLength(3)
    expect(optionArgs.data.segments.create.map((s: { segmentOrder: number }) => s.segmentOrder)).toEqual([0, 1, 2])
    expect(optionArgs.data.segments.create[2].flightNumber).toBe('QR103')
    expect(optionArgs.data.segments.create[2].stops).toBe(1)
  })
})

describe('Response shape', () => {
  it('returns the created flightOption and item (bigints coerced to numbers)', async () => {
    mockPrisma.quoteFlightOption.create.mockResolvedValue({ id: 'fo1', costMinor: BigInt(200000), segments: [] })
    mockPrisma.quoteItem.create.mockResolvedValue({ id: 'i1', costMinor: BigInt(200000) })
    const res = await POST(req(basePayload()), ctx('q1'))
    const data = await res.json()
    expect(data.type).toBe('flight')
    expect(data.flightOption.costMinor).toBe(200000)
    expect(data.item.id).toBe('i1')
  })
})
