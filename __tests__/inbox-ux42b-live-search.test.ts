/**
 * UX-4.2b (Phase 2 — Agent B, Quote/Supplier Integration).
 *
 * CreateQuoteDrawer gained live Flight/Hotel/Activity/Transfer search,
 * reusing the existing /api/admin/travel-search/* infrastructure end to
 * end. Two layers are tested here:
 *
 *  1. Behavioral: the add-to-quote route's new currency guard (server-side
 *     defense in depth — a Quote has one currency and the pricing engine
 *     sums blindly, so an item priced in a different currency must never
 *     attach), and that multiple items across product types can attach to
 *     the same quote.
 *  2. Source-level (matching this repo's established pattern for
 *     CreateQuoteDrawer.tsx in __tests__/inbox-ux42-create-quote.test.ts):
 *     the drawer only ever calls the existing travel-search routes, gates
 *     attach on the client-side currency check and on flight/hotel
 *     revalidation, and reuses handleCreate (not a second creation path)
 *     to stage the draft quote before the first live-search attach.
 */

import fs from 'fs'
import path from 'path'

const mockPrisma = {
  quote:            { findUnique: jest.fn(), update: jest.fn() },
  quoteItem:        { create: jest.fn(), findMany: jest.fn() },
  quoteFlightOption: { create: jest.fn() },
  quoteHotelOption:  { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: () => true }))
// Closing fix (security + QA review, 2026-09-19): the route now re-verifies
// flight/hotel cost server-side via the same Duffel/Hotelbeds calls the
// sibling revalidate routes make, instead of trusting client-submitted
// costMinor. Mocked here to return values matching each fixture's costMinor
// so the existing happy-path tests below keep passing unmodified —
// mismatch behavior itself is covered separately (see
// __tests__/inbox-ux42c-closing-fixes.test.ts).
jest.mock('@/lib/flights/duffel', () => ({ getOffer: jest.fn() }))
jest.mock('@/lib/hotelbeds', () => ({ hotelbedsRequest: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { getOffer } from '@/lib/flights/duffel'
import { hotelbedsRequest } from '@/lib/hotelbeds'
import { POST } from '@/app/api/admin/travel-search/add-to-quote/route'

const SESSION = { email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} }

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

const FLIGHT_OFFER = {
  provider: 'duffel', providerOfferId: 'off_1', searchedAt: new Date().toISOString(),
  airline: 'Emirates', airlineCode: 'EK', tripType: 'one-way', cabinClass: 'ECONOMY',
  supplierCurrency: 'GBP', supplierTotalAmount: 500, supplierTotalMinor: 50000,
  offerExpiresAt: null, isRefundable: false, isChangeable: false, changeFee: null, noShowRule: null,
  fareClass: null, fareFamily: null, personalItem: null, cabinBaggage: null, checkedBaggage: null,
  checkedPieces: null, checkedWeight: null, seatIncluded: false, mealIncluded: false, seatsLeft: null,
  segments: [{
    segmentOrder: 0, originCode: 'LHR', originCity: null, originTerminal: null,
    destinationCode: 'DXB', destinationCity: null, destinationTerminal: null,
    departureAt: '2026-10-01T10:00:00Z', arrivalAt: '2026-10-01T20:00:00Z',
    flightNumber: 'EK1', operatingCarrier: 'EK', marketingCarrier: 'EK', aircraft: null,
    durationMinutes: 420, stops: 0, layoverMinutes: null,
  }],
  returnSegments: [],
}

const HOTEL_OFFER = {
  provider: 'hotelbeds', providerHotelCode: 'HTL1',
  hotelName: 'Test Hotel', starRating: 4, destinationCode: 'DXB', destinationName: null,
  city: 'Dubai', country: 'AE', latitude: null, longitude: null,
  checkIn: '2026-10-01', checkOut: '2026-10-05', nights: 4, rooms: 1, adults: 2, children: 0,
  imageUrls: [],
  rates: [{
    rateKey: 'rk1', roomCode: null, roomName: null, boardCode: null, boardName: null,
    mealPlan: null, breakfastIncluded: false, isRefundable: true, cancellationPolicy: null,
    cancellationDeadline: null, supplierCurrency: 'GBP', supplierAmount: 400, supplierAmountMinor: 40000,
    perNightAmount: null, nights: 4,
  }],
  supplierCurrency: 'GBP', supplierMinAmount: 400, supplierMinAmountMinor: 40000,
}

const ACTIVITY_OFFER = {
  provider: 'viator', providerCode: 'A1', providerModalityCode: 'M1', providerModalityName: 'Standard',
  name: 'City Tour', description: null, imageUrl: null, duration: null, destinationCode: 'DXB',
  supplierCurrency: 'GBP', supplierAmount: 50, supplierAmountMinor: 5000,
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'draft', currency: 'GBP' })
  mockPrisma.quoteItem.findMany.mockResolvedValue([])
  mockPrisma.quote.update.mockResolvedValue({})
  mockPrisma.quoteFlightOption.create.mockResolvedValue({ id: 'fo1', segments: [] })
  mockPrisma.quoteHotelOption.create.mockResolvedValue({ id: 'ho1' })
  mockPrisma.quoteItem.create.mockResolvedValue({ id: 'qi1' })
  // Matches FLIGHT_OFFER/HOTEL_OFFER fixtures' costMinor (50000 / 40000)
  // used across the tests below.
  ;(getOffer as jest.Mock).mockResolvedValue({ data: { total_amount: '500', total_currency: 'GBP', expires_at: null } })
  ;(hotelbedsRequest as jest.Mock).mockResolvedValue({ hotel: { rooms: [{ rates: [{ rateKey: 'rk1', net: '400' }] }] } })
})

describe('add-to-quote currency guard (server-side defense in depth)', () => {
  it('flight: matching currency (GBP quote, GBP item) attaches successfully', async () => {
    const res = await POST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 2500, serviceFeeMinor: 0, sellingPriceMinor: 52500, currency: 'GBP',
    }))
    expect(res.status).toBe(200)
    expect(mockPrisma.quoteFlightOption.create).toHaveBeenCalled()
    expect(mockPrisma.quoteItem.create).toHaveBeenCalled()
  })

  it('flight: mismatched currency (USD item vs GBP quote) is rejected before any write', async () => {
    const res = await POST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 2500, serviceFeeMinor: 0, sellingPriceMinor: 52500, currency: 'USD',
    }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.code).toBe('CURRENCY_MISMATCH')
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
    expect(mockPrisma.quoteItem.create).not.toHaveBeenCalled()
  })

  it('hotel: mismatched currency (EUR item vs GBP quote) is rejected before any write', async () => {
    const res = await POST(req({
      type: 'hotel', quoteId: 'q1', offer: HOTEL_OFFER, selectedRateKey: 'rk1',
      costMinor: 40000, markupMinor: 7200, serviceFeeMinor: 0, sellingPriceMinor: 47200, currency: 'EUR',
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('CURRENCY_MISMATCH')
    expect(mockPrisma.quoteHotelOption.create).not.toHaveBeenCalled()
  })

  it('hotel: matching currency attaches successfully', async () => {
    const res = await POST(req({
      type: 'hotel', quoteId: 'q1', offer: HOTEL_OFFER, selectedRateKey: 'rk1',
      costMinor: 40000, markupMinor: 7200, serviceFeeMinor: 0, sellingPriceMinor: 47200, currency: 'GBP',
    }))
    expect(res.status).toBe(200)
    expect(mockPrisma.quoteHotelOption.create).toHaveBeenCalled()
  })

  it('activity: mismatched currency is rejected before any write', async () => {
    const res = await POST(req({
      type: 'activity', quoteId: 'q1', offer: ACTIVITY_OFFER,
      costMinor: 5000, markupMinor: 1000, serviceFeeMinor: 0, sellingPriceMinor: 6000, currency: 'NGN',
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('CURRENCY_MISMATCH')
    expect(mockPrisma.quoteItem.create).not.toHaveBeenCalled()
  })

  it('currency comparison is case-insensitive ("gbp" matches "GBP")', async () => {
    const res = await POST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 0, serviceFeeMinor: 0, sellingPriceMinor: 50000, currency: 'gbp',
    }))
    expect(res.status).toBe(200)
  })

  it('the guard is checked before any .create() call — source pin', () => {
    const routeSrc = fs.readFileSync(
      path.join(process.cwd(), 'app/api/admin/travel-search/add-to-quote/route.ts'), 'utf8',
    )
    const guardIdx = routeSrc.indexOf('CURRENCY_MISMATCH')
    const firstCreateIdx = routeSrc.indexOf('.create(')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(firstCreateIdx)
  })
})

describe('multiple items across product types attach to the same quote', () => {
  it('a flight then a hotel both attach to quote q1 without either being blocked by the other', async () => {
    const flightRes = await POST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 2500, serviceFeeMinor: 0, sellingPriceMinor: 52500, currency: 'GBP',
    }))
    const hotelRes = await POST(req({
      type: 'hotel', quoteId: 'q1', offer: HOTEL_OFFER, selectedRateKey: 'rk1',
      costMinor: 40000, markupMinor: 7200, serviceFeeMinor: 0, sellingPriceMinor: 47200, currency: 'GBP',
    }))
    expect(flightRes.status).toBe(200)
    expect(hotelRes.status).toBe(200)
    expect(mockPrisma.quoteFlightOption.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.quoteHotelOption.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.quoteItem.create).toHaveBeenCalledTimes(2)
    expect(mockPrisma.quote.update).toHaveBeenCalledTimes(2)  // totals recomputed after each attach
  })
})

describe('CreateQuoteDrawer live search & attach (source-level, matches this repo\'s pattern for this file)', () => {
  const drawerSrc = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/inbox/components/CreateQuoteDrawer.tsx'), 'utf8',
  )

  it('search calls go through the existing /api/admin/travel-search/* routes only — no new supplier client code', () => {
    expect(drawerSrc).toContain("fetch('/api/admin/travel-search/flights'")
    expect(drawerSrc).toContain("fetch('/api/admin/travel-search/hotels'")
    expect(drawerSrc).toContain("fetch(`/api/admin/travel-search/activities?")
    expect(drawerSrc).toContain("fetch('/api/admin/travel-search/transfers'")
    expect(drawerSrc).toContain("fetch('/api/admin/travel-search/add-to-quote'")
    expect(drawerSrc).not.toMatch(/new Duffel|hotelbedsRequest\(/i)
  })

  it('flight/hotel offers require revalidateState === "ok" before confirmAddPending will attach', () => {
    const fn = drawerSrc.slice(drawerSrc.indexOf('async function confirmAddPending'), drawerSrc.indexOf('async function handleCreate'))
    expect(fn).toContain("(pending.type === 'flight' || pending.type === 'hotel') && pending.revalidateState !== 'ok'")
    expect(drawerSrc).toContain("fetch('/api/admin/travel-search/flights/revalidate'")
    expect(drawerSrc).toContain("fetch('/api/admin/travel-search/hotels/revalidate'")
  })

  it('a stale/expired offer surfaces a re-search prompt rather than silently attaching', () => {
    expect(drawerSrc).toContain("revalidateState: 'stale'")
    expect(drawerSrc).toContain('This offer has changed. Please re-search.')
  })

  it('client-side currency guard blocks attach and never silently sums mismatched currencies', () => {
    expect(drawerSrc).toContain('const pendingCurrencyMismatch = pending ? pending.offerCurrency.toUpperCase() !== currency.toUpperCase() : false')
    const fn = drawerSrc.slice(drawerSrc.indexOf('async function confirmAddPending'), drawerSrc.indexOf('async function handleCreate'))
    expect(fn).toContain('if (pendingCurrencyMismatch)')
  })

  it('the draft quote is staged via the SAME handleCreate used by the manual "Create quote" button — no second creation path', () => {
    const fn = drawerSrc.slice(drawerSrc.indexOf('async function confirmAddPending'), drawerSrc.indexOf('async function handleCreate'))
    expect(fn).toContain('await handleCreate({ allowEmptyItems: true })')
    // Exactly one call site creates a quote (inside handleCreate) — the
    // live-search path reuses it rather than POSTing /api/admin/quotes again.
    const occurrences = drawerSrc.split("fetch('/api/admin/quotes'").length - 1
    expect(occurrences).toBe(1)
  })

  it('manual item entry is unaffected: addItem/removeItem and the mini-form are untouched', () => {
    expect(drawerSrc).toContain('function addItem()')
    expect(drawerSrc).toContain('function removeItem(key: string)')
    expect(drawerSrc).toContain("if (!itemTitle.trim() || !isValidAmountMajor(Number(itemPrice))) return")
  })

  it('Visa/Walz-service is wired as a manual-item preset from the existing UK_VISA_FEES source — no new pricing infra, no Visa Application duplication', () => {
    expect(drawerSrc).toContain("from '@/lib/config/visa-fees'")
    expect(drawerSrc).toContain('function applyVisaPreset')
    expect(drawerSrc).toContain("setItemType('visa_service')")
  })

  it('pricing surfaces cost -> markup -> client price -> margin using the house pricing engine (lib/pricing/booking-price)', () => {
    expect(drawerSrc).toContain("from '@/lib/pricing/booking-price'")
    expect(drawerSrc).toContain('calculateBookingPrice(')
    expect(drawerSrc).toContain('Supplier / net cost')
    expect(drawerSrc).toContain('Client price')
    expect(drawerSrc).toContain('Margin')
  })

  it('offer details (segments/rates/etc.) are preserved by passing the normalized offer straight through to add-to-quote, never re-derived', () => {
    expect(drawerSrc).toContain('buildAttachPayload')
    expect(drawerSrc).toMatch(/type: 'flight', offer: p\.offer as NormalizedFlightOffer/)
    expect(drawerSrc).toMatch(/type: 'hotel', offer: p\.offer as NormalizedHotelOffer/)
  })
})
