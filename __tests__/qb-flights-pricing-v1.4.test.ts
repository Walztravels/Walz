/**
 * QUOTE BUILDER V1.4 — commercial pricing (Agent B).
 *
 * Covers, for app/api/admin/travel-search/add-to-quote/route.ts (flight
 * branch) and app/api/admin/quotes/[id]/items/[itemId]/route.ts:
 *   1. Manual selling-price mode on add — costMinor always comes from the
 *      independently revalidated Duffel offer, never the client; markupMinor
 *      is derived server-side from the verified cost + the staff-typed
 *      manual selling price.
 *   2. A forged costMinor in the request body can never reach persistence —
 *      the existing PRICE_MISMATCH revalidation guard rejects it outright,
 *      before any write, regardless of which pricing mode is requested.
 *   3. Markup-mode add is completely unchanged (regression) when
 *      `pricingMode` is omitted, matching pre-V1.4 behavior exactly.
 *   4. Duplicate-add protection — the same Duffel offer added twice to the
 *      same quote creates exactly one QuoteFlightOption/QuoteItem pair; the
 *      second call returns the existing row with `duplicate: true` and never
 *      double-counts totals.
 *   5. Multi-city journeys[] concatenation — a 3-journey offer lands all of
 *      its segments, in journey order, on ONE QuoteFlightOption (the
 *      previous segments+returnSegments-only concatenation silently
 *      truncated journey 3+).
 *   6. Direct sellingPriceMinor edit-pricing mode on an already-attached
 *      item (PATCH .../items/[itemId]) recomputes markupMinor/totals
 *      correctly, and the original markupMinor/serviceFeeMinor edit path is
 *      unchanged (regression).
 */

const mockPrisma = {
  quote:             { findUnique: jest.fn(), update: jest.fn() },
  quoteItem:         { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  quoteFlightOption: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  quoteHotelOption:  { create: jest.fn() },
  quoteActivity:     { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: () => true }))
jest.mock('@/lib/flights/duffel', () => ({ getOffer: jest.fn() }))
jest.mock('@/lib/hotelbeds', () => ({ hotelbedsRequest: jest.fn() }))
jest.mock('@/lib/fx', () => ({ getStandardRate: jest.fn() }))
jest.mock('@/lib/inbox/client-context', () => ({ resolveClientActionContext: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { getOffer } from '@/lib/flights/duffel'
import { POST } from '@/app/api/admin/travel-search/add-to-quote/route'
import { PATCH } from '@/app/api/admin/quotes/[id]/items/[itemId]/route'

const SESSION = { email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} }

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}
function itemReq(body?: Record<string, unknown>) {
  return { json: async () => body ?? {} } as unknown as Parameters<typeof PATCH>[0]
}
function ctx(id: string, itemId: string) {
  return { params: { id, itemId } }
}

function seg(order: number, from: string, to: string) {
  return {
    segmentOrder: order, originCode: from, originCity: null, originTerminal: null,
    destinationCode: to, destinationCity: null, destinationTerminal: null,
    departureAt: `2026-10-0${order + 1}T10:00:00Z`, arrivalAt: `2026-10-0${order + 1}T14:00:00Z`,
    flightNumber: `EK${order + 1}`, operatingCarrier: 'EK', marketingCarrier: 'EK', aircraft: null,
    durationMinutes: 240, stops: 0, layoverMinutes: null,
  }
}

const FLIGHT_OFFER = {
  provider: 'duffel', providerOfferId: 'off_1', searchedAt: new Date().toISOString(),
  airline: 'Emirates', airlineCode: 'EK', tripType: 'one-way', cabinClass: 'ECONOMY',
  supplierCurrency: 'GBP', supplierTotalAmount: 1000, supplierTotalMinor: 100000,
  offerExpiresAt: null, isRefundable: false, isChangeable: false, changeFee: null, noShowRule: null,
  fareClass: null, fareFamily: null, personalItem: null, cabinBaggage: null, checkedBaggage: null,
  checkedPieces: null, checkedWeight: null, seatIncluded: false, mealIncluded: false, seatsLeft: null,
  segments: [seg(0, 'LHR', 'DXB')],
  returnSegments: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'draft', currency: 'GBP', conversationId: null })
  mockPrisma.quote.update.mockResolvedValue({})
  mockPrisma.quoteItem.findMany.mockResolvedValue([])
  mockPrisma.quoteFlightOption.findFirst.mockResolvedValue(null)
  mockPrisma.quoteFlightOption.create.mockResolvedValue({ id: 'fo1', segments: [] })
  mockPrisma.quoteItem.create.mockResolvedValue({ id: 'qi1' })
  // Supplier total: 1000.00 GBP == 100000 minor units, matching FLIGHT_OFFER.
  ;(getOffer as jest.Mock).mockResolvedValue({ data: { total_amount: '1000', total_currency: 'GBP', expires_at: null } })
})

describe('V1.4 — manual selling-price mode (add-to-quote, flight)', () => {
  it('supplier 1000, client 1300 -> margin 300 persisted correctly; costMinor untouched by the manual value', async () => {
    const res = await POST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      // Client's own markup/selling figures are DELIBERATELY wrong here to
      // prove the server never trusts them in manual mode — only
      // manualSellingPriceMinor and the independently-verified cost matter.
      costMinor: 100000, markupMinor: 999999, serviceFeeMinor: 0, sellingPriceMinor: 999999,
      currency: 'GBP', pricingMode: 'manual', manualSellingPriceMinor: 130000,
    }))
    expect(res.status).toBe(200)
    const createArgs = mockPrisma.quoteFlightOption.create.mock.calls[0][0]
    expect(createArgs.data.costMinor).toBe(BigInt(100000))       // untouched — from revalidation only
    expect(createArgs.data.markupMinor).toBe(BigInt(30000))      // 130000 - 100000
    expect(createArgs.data.sellingPriceMinor).toBe(BigInt(130000))
    const itemArgs = mockPrisma.quoteItem.create.mock.calls[0][0]
    expect(itemArgs.data.costMinor).toBe(BigInt(100000))
    expect(itemArgs.data.sellingPriceMinor).toBe(BigInt(130000))
  })

  it('rejects an invalid/zero manual selling price before any write', async () => {
    const res = await POST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 100000, markupMinor: 0, serviceFeeMinor: 0, sellingPriceMinor: 0,
      currency: 'GBP', pricingMode: 'manual', manualSellingPriceMinor: 0,
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_MANUAL_PRICE')
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
  })
})

describe('V1.4 — forged cost is never persisted, in either pricing mode', () => {
  it('markup mode: a forged high costMinor mismatching the revalidated offer is rejected before any write', async () => {
    const res = await POST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 999999999, markupMinor: 5000, serviceFeeMinor: 0, sellingPriceMinor: 1004999999,
      currency: 'GBP',
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('PRICE_MISMATCH')
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
    expect(mockPrisma.quoteItem.create).not.toHaveBeenCalled()
  })

  it('manual mode: a forged low costMinor mismatching the revalidated offer is rejected before any write — manualSellingPriceMinor cannot buy past the cost check', async () => {
    const res = await POST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 1, markupMinor: 0, serviceFeeMinor: 0, sellingPriceMinor: 130000,
      currency: 'GBP', pricingMode: 'manual', manualSellingPriceMinor: 130000,
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('PRICE_MISMATCH')
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
  })
})

describe('V1.4 — markup mode is unchanged when pricingMode is absent (regression)', () => {
  it('behaves exactly as pre-V1.4: payload markup/selling figures pass straight through', async () => {
    const res = await POST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 100000, markupMinor: 5000, serviceFeeMinor: 0, sellingPriceMinor: 105000,
      currency: 'GBP',
    }))
    expect(res.status).toBe(200)
    const createArgs = mockPrisma.quoteFlightOption.create.mock.calls[0][0]
    expect(createArgs.data.costMinor).toBe(BigInt(100000))
    expect(createArgs.data.markupMinor).toBe(BigInt(5000))
    expect(createArgs.data.sellingPriceMinor).toBe(BigInt(105000))
  })
})

describe('V1.4 — duplicate-add protection (flight)', () => {
  const PAYLOAD = {
    type: 'flight' as const, quoteId: 'q1', offer: FLIGHT_OFFER,
    costMinor: 100000, markupMinor: 5000, serviceFeeMinor: 0, sellingPriceMinor: 105000, currency: 'GBP',
  }

  it('same offer added twice: one QuoteFlightOption row created; the second call returns duplicate:true and never creates a second row', async () => {
    mockPrisma.quoteFlightOption.findFirst.mockResolvedValueOnce(null)
    const res1 = await POST(req(PAYLOAD))
    expect(res1.status).toBe(200)
    expect((await res1.json()).duplicate).toBeUndefined()
    expect(mockPrisma.quoteFlightOption.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.quoteItem.create).toHaveBeenCalledTimes(1)

    mockPrisma.quoteFlightOption.findFirst.mockResolvedValueOnce({
      id: 'fo1', duffelOfferId: 'off_1', quoteId: 'q1', segments: [],
      items: [{ id: 'qi1', sellingPriceMinor: 105000, costMinor: 100000 }],
    })
    const res2 = await POST(req(PAYLOAD))
    const data2 = await res2.json()
    expect(res2.status).toBe(200)
    expect(data2.duplicate).toBe(true)
    expect(data2.item.id).toBe('qi1')
    // Never a second create — totals are not double-counted.
    expect(mockPrisma.quoteFlightOption.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.quoteItem.create).toHaveBeenCalledTimes(1)
    // Duplicate path skips the live Duffel re-check entirely (checked before
    // revalidation) — getOffer is only ever called for the FIRST attempt.
    expect((getOffer as jest.Mock)).toHaveBeenCalledTimes(1)
  })
})

describe('V1.4 — multi-city journeys[] concatenation (add-to-quote, flight)', () => {
  it('a 3-journey offer lands ALL segments, in journey order, on one QuoteFlightOption', async () => {
    const journeys = [
      { direction: 'leg', segments: [seg(0, 'LHR', 'CDG')], stops: 0, durationMinutes: 90 },
      { direction: 'leg', segments: [seg(1, 'CDG', 'FCO')], stops: 0, durationMinutes: 120 },
      { direction: 'leg', segments: [seg(2, 'FCO', 'LHR')], stops: 0, durationMinutes: 150 },
    ]
    const MULTI_CITY_OFFER = {
      ...FLIGHT_OFFER,
      tripType: 'multi-city',
      // Legacy 2-field shape only ever exposed journeys[0]/[1] — journey 3 is
      // ONLY reachable via journeys[], proving the fix actually uses it.
      segments: journeys[0].segments,
      returnSegments: journeys[1].segments,
      journeys,
    }
    const res = await POST(req({
      type: 'flight', quoteId: 'q1', offer: MULTI_CITY_OFFER,
      costMinor: 100000, markupMinor: 5000, serviceFeeMinor: 0, sellingPriceMinor: 105000, currency: 'GBP',
    }))
    expect(res.status).toBe(200)
    const createArgs = mockPrisma.quoteFlightOption.create.mock.calls[0][0]
    const createdSegs = createArgs.data.segments.create as Array<{ originCode: string; destinationCode: string }>
    expect(createdSegs).toHaveLength(3)
    expect(createdSegs.map((s) => `${s.originCode}-${s.destinationCode}`)).toEqual([
      'LHR-CDG', 'CDG-FCO', 'FCO-LHR',
    ])
  })
})

describe('V1.4 — direct sellingPriceMinor edit (items/[itemId] PATCH)', () => {
  const BASE_FLIGHT_ITEM = {
    id: 'i1', quoteId: 'q1', type: 'flight', title: 'EK123', supplierRef: 'off_1',
    flightOptionId: 'fo1', hotelOptionId: null,
    costMinor: BigInt(100000), markupMinor: BigInt(30000), serviceFeeMinor: BigInt(0),
  }
  const DRAFT_QUOTE = { id: 'q1', status: 'draft', currency: 'GBP', conversationId: null }

  beforeEach(() => {
    mockPrisma.quote.findUnique.mockResolvedValue(DRAFT_QUOTE)
    mockPrisma.quoteItem.findFirst.mockResolvedValue(BASE_FLIGHT_ITEM)
    mockPrisma.quoteFlightOption.update.mockResolvedValue({})
    mockPrisma.quoteActivity.create.mockResolvedValue({})
  })

  it('edit 1300 -> 1400 recomputes markupMinor/totals correctly via the direct-sellingPrice path; updateQuoteTotals runs once', async () => {
    mockPrisma.quoteItem.update.mockResolvedValue({
      ...BASE_FLIGHT_ITEM, markupMinor: BigInt(40000), sellingPriceMinor: BigInt(140000),
    })
    mockPrisma.quote.findUnique
      .mockResolvedValueOnce(DRAFT_QUOTE) // checkIdentityAndDraftStatus
      .mockResolvedValueOnce({ markupMinor: BigInt(0), serviceChargeMinor: BigInt(0), discountMinor: BigInt(0) }) // updateQuoteTotals
    const res = await PATCH(itemReq({ sellingPriceMinor: 140000 }), ctx('q1', 'i1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quoteItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { markupMinor: BigInt(40000), serviceFeeMinor: BigInt(0), sellingPriceMinor: BigInt(140000) },
    })
    expect(mockPrisma.quoteFlightOption.update).toHaveBeenCalledWith({
      where: { id: 'fo1' },
      data: { markupMinor: BigInt(40000), serviceFeeMinor: BigInt(0), sellingPriceMinor: BigInt(140000) },
    })
    expect(mockPrisma.quoteItem.findMany).toHaveBeenCalledTimes(1) // updateQuoteTotals ran exactly once
  })

  it('rejects a zero/negative sellingPriceMinor', async () => {
    const res = await PATCH(itemReq({ sellingPriceMinor: 0 }), ctx('q1', 'i1'))
    expect(res.status).toBe(400)
    expect(mockPrisma.quoteItem.update).not.toHaveBeenCalled()
  })

  it('the original markupMinor/serviceFeeMinor path is unchanged (regression)', async () => {
    mockPrisma.quoteItem.update.mockResolvedValue({
      ...BASE_FLIGHT_ITEM, markupMinor: BigInt(15000), sellingPriceMinor: BigInt(115000),
    })
    mockPrisma.quote.findUnique
      .mockResolvedValueOnce(DRAFT_QUOTE)
      .mockResolvedValueOnce({ markupMinor: BigInt(0), serviceChargeMinor: BigInt(0), discountMinor: BigInt(0) })
    const res = await PATCH(itemReq({ markupMinor: 15000, serviceFeeMinor: 0 }), ctx('q1', 'i1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quoteItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { markupMinor: BigInt(15000), serviceFeeMinor: BigInt(0), sellingPriceMinor: BigInt(115000) },
    })
  })
})
