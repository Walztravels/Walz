/**
 * Client Action Centre / Inbox V1, Phase 2/3 — Agent C, Proposal/Commercial
 * Lifecycle. Quote → Itinerary conversion bridge.
 *
 * Covers the pure mapper (lib/action-centre/quote-to-itinerary.ts) — shape
 * correctness, the destination-fallback ladder, and minor→major price-unit
 * conversion — and the convert route (creates an Itinerary, writes back
 * itineraryId, is idempotent on a second call, respects the same
 * permission check as sibling quote routes, 404s on an unknown quote id).
 */

import fs from 'fs'
import path from 'path'
import { buildItineraryDraftFromQuote, type QuoteForConversion, type QuoteItemForConversion, type QuoteFlightOptionForConversion, type QuoteHotelOptionForConversion, type QuoteMediaForConversion } from '@/lib/action-centre/quote-to-itinerary'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── Fixtures ─────────────────────────────────────────────────────────────

function baseQuote(overrides: Partial<QuoteForConversion> = {}): QuoteForConversion {
  return {
    id: 'q1',
    reference: 'WT-Q-20260919-0001',
    title: 'Dubai Getaway',
    clientName: 'Ama Mensah',
    clientEmail: 'ama@example.com',
    clientPhone: '+233554000000',
    currency: 'GBP',
    totalMinor: BigInt(150000),
    subtotalMinor: BigInt(140000),
    markupMinor: BigInt(10000),
    serviceChargeMinor: BigInt(0),
    discountMinor: BigInt(0),
    depositMinor: BigInt(50000),
    depositCurrency: null,
    conversationId: 318,
    ...overrides,
  }
}

const NO_ITEMS: QuoteItemForConversion[] = []
const NO_FLIGHTS: QuoteFlightOptionForConversion[] = []
const NO_HOTELS: QuoteHotelOptionForConversion[] = []
const NO_MEDIA: QuoteMediaForConversion[] = []

const HOTEL: QuoteHotelOptionForConversion = {
  id: 'ho1',
  hotelName: 'Atlantis The Palm',
  city: 'Dubai',
  country: 'UAE',
  checkIn: new Date('2026-11-01T14:00:00.000Z'),
  checkOut: new Date('2026-11-08T11:00:00.000Z'),
  nights: 7,
  adults: 2,
  children: 1,
  roomType: 'Ocean View Suite',
  mealPlan: 'Breakfast',
  isRecommended: true,
  sortOrder: 0,
  sellingPriceMinor: BigInt(80000),
  currency: 'GBP',
}

const FLIGHT: QuoteFlightOptionForConversion = {
  airline: 'Emirates',
  airlineLogoUrl: 'https://cdn.example.com/ek.png',
  cabinClass: 'Business',
  isRecommended: true,
  sortOrder: 0,
  sellingPriceMinor: BigInt(60000),
  currency: 'GBP',
  segments: [
    {
      segmentOrder: 0,
      originCode: 'LHR',
      originCity: 'London',
      destinationCode: 'DXB',
      destinationCity: 'Dubai',
      departureAt: new Date('2026-11-01T10:00:00.000Z'),
      arrivalAt: new Date('2026-11-01T20:30:00.000Z'),
      flightNumber: 'EK002',
      stops: 0,
    },
    {
      segmentOrder: 1,
      originCode: 'DXB',
      originCity: 'Dubai',
      destinationCode: 'LHR',
      destinationCity: 'London',
      departureAt: new Date('2026-11-08T14:00:00.000Z'),
      arrivalAt: new Date('2026-11-08T18:00:00.000Z'),
      flightNumber: 'EK001',
      stops: 0,
    },
  ],
}

// ── Destination fallback ladder ──────────────────────────────────────────

describe('buildItineraryDraftFromQuote — destination fallback', () => {
  it('uses the first hotel option city + country when a hotel is present', () => {
    const draft = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, [FLIGHT], [HOTEL], NO_MEDIA)
    expect(draft.destination).toBe('Dubai, UAE')
  })

  it('falls back to the first flight option first segment arrival city when no hotel is present', () => {
    const draft = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, [FLIGHT], NO_HOTELS, NO_MEDIA)
    expect(draft.destination).toBe('Dubai')
  })

  it('falls back to the destination CODE when the segment has no destinationCity', () => {
    const flightNoCity: QuoteFlightOptionForConversion = {
      ...FLIGHT,
      segments: [{ ...FLIGHT.segments[0], destinationCity: null }],
    }
    const draft = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, [flightNoCity], NO_HOTELS, NO_MEDIA)
    expect(draft.destination).toBe('DXB')
  })

  it('falls back to the explicit placeholder when there is no hotel and no flight at all', () => {
    const draft = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, NO_FLIGHTS, NO_HOTELS, NO_MEDIA)
    expect(draft.destination).toBe('Destination TBC')
  })

  it('a hotel with city but no country still resolves (partial location)', () => {
    const hotelNoCountry = { ...HOTEL, country: null }
    const draft = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, [FLIGHT], [hotelNoCountry], NO_MEDIA)
    expect(draft.destination).toBe('Dubai')
  })
})

// ── Price-unit conversion (minor → major via lib/currency.ts's minorToDecimal) ──

describe('buildItineraryDraftFromQuote — price-unit conversion', () => {
  it('converts Quote.totalMinor (pence) to totalPrice (pounds) using the currency exponent', () => {
    const draft = buildItineraryDraftFromQuote(baseQuote({ totalMinor: BigInt(150000) }), NO_ITEMS, NO_FLIGHTS, NO_HOTELS, NO_MEDIA)
    expect(draft.totalPrice).toBe(1500)
  })

  it('converts depositMinor using depositCurrency when set, falling back to the quote currency', () => {
    const draft1 = buildItineraryDraftFromQuote(
      baseQuote({ depositMinor: BigInt(50000), depositCurrency: null, currency: 'GBP' }),
      NO_ITEMS, NO_FLIGHTS, NO_HOTELS, NO_MEDIA,
    )
    expect(draft1.deposit).toBe(500)

    const draft2 = buildItineraryDraftFromQuote(
      baseQuote({ depositMinor: BigInt(50000), depositCurrency: 'USD', currency: 'GBP' }),
      NO_ITEMS, NO_FLIGHTS, NO_HOTELS, NO_MEDIA,
    )
    expect(draft2.deposit).toBe(500) // USD is also a 2-decimal currency — same conversion, different currency tag
  })

  it('null depositMinor produces a null deposit, never 0', () => {
    const draft = buildItineraryDraftFromQuote(baseQuote({ depositMinor: null }), NO_ITEMS, NO_FLIGHTS, NO_HOTELS, NO_MEDIA)
    expect(draft.deposit).toBeNull()
  })

  it('zero totalMinor produces a null totalPrice, never a misleading 0', () => {
    const draft = buildItineraryDraftFromQuote(baseQuote({ totalMinor: BigInt(0) }), NO_ITEMS, NO_FLIGHTS, NO_HOTELS, NO_MEDIA)
    expect(draft.totalPrice).toBeNull()
  })

  it('flight option selling price is attached only to the FIRST segment (no double count in componentPrices sums)', () => {
    const draft = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, [FLIGHT], NO_HOTELS, NO_MEDIA)
    const flights = JSON.parse(draft.flights) as Array<{ cost?: number }>
    expect(flights).toHaveLength(2)
    expect(flights[0].cost).toBe(600) // 60000 minor / 100
    expect(flights[1].cost).toBeUndefined()
  })

  it('hotel option selling price converts correctly', () => {
    const draft = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, NO_FLIGHTS, [HOTEL], NO_MEDIA)
    const hotels = JSON.parse(draft.hotels) as Array<{ cost?: number }>
    expect(hotels[0].cost).toBe(800) // 80000 minor / 100
  })

  it('priceBreakdown converts every non-zero line and always includes Total; omits zero-value lines', () => {
    const draft = buildItineraryDraftFromQuote(
      baseQuote({ subtotalMinor: BigInt(140000), markupMinor: BigInt(10000), serviceChargeMinor: BigInt(0), discountMinor: BigInt(5000), totalMinor: BigInt(145000) }),
      NO_ITEMS, NO_FLIGHTS, NO_HOTELS, NO_MEDIA,
    )
    const rows = JSON.parse(draft.priceBreakdown) as Array<{ item: string; cost: number }>
    expect(rows.map(r => r.item)).toEqual(['Subtotal', 'Markup', 'Discount', 'Total'])
    expect(rows.find(r => r.item === 'Subtotal')?.cost).toBe(1400)
    expect(rows.find(r => r.item === 'Discount')?.cost).toBe(-50)
    expect(rows.find(r => r.item === 'Total')?.cost).toBe(1450)
  })
})

// ── Shape correctness ────────────────────────────────────────────────────

describe('buildItineraryDraftFromQuote — shape correctness', () => {
  it('maps flights into the exact RawFlight shape _ProposalPage.tsx/page.tsx read (from/to/fromCity/toCity/airline/flightNumber/date/departureTime/arrivalTime/class/stops/cost)', () => {
    const draft = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, [FLIGHT], NO_HOTELS, NO_MEDIA)
    const flights = JSON.parse(draft.flights)
    expect(flights[0]).toMatchObject({
      from: 'LHR', to: 'DXB', fromCity: 'London', toCity: 'Dubai',
      airline: 'Emirates', flightNumber: 'EK002', date: '2026-11-01',
      departureTime: '10:00', arrivalTime: '20:30', class: 'Business', stops: 0,
      airlineLogoUrl: 'https://cdn.example.com/ek.png',
    })
  })

  it('maps hotels into the exact RawHotel shape (name/location/checkIn/checkOut/roomType/nights/mealPlan/images/cost)', () => {
    const media: QuoteMediaForConversion[] = [
      { hotelOptionId: 'ho1', flightOptionId: null, url: 'https://cdn.example.com/h1.jpg', clientVisible: true, isHero: false, sortOrder: 0 },
      { hotelOptionId: 'ho1', flightOptionId: null, url: 'https://cdn.example.com/hidden.jpg', clientVisible: false, isHero: false, sortOrder: 1 },
    ]
    const draft = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, NO_FLIGHTS, [HOTEL], media)
    const hotels = JSON.parse(draft.hotels)
    expect(hotels[0]).toMatchObject({
      name: 'Atlantis The Palm', location: 'Dubai, UAE',
      checkIn: '2026-11-01', checkOut: '2026-11-08',
      roomType: 'Ocean View Suite', nights: 7, mealPlan: 'Breakfast',
      images: ['https://cdn.example.com/h1.jpg'], // non-client-visible media excluded
    })
  })

  it('maps activity QuoteItems into tours and transfer QuoteItems into transfers, excluding non-client-visible items', () => {
    const items: QuoteItemForConversion[] = [
      { type: 'activity', title: 'Desert Safari', description: 'Evening safari', sortOrder: 0, sellingPriceMinor: BigInt(5000), currency: 'GBP', clientNote: null, clientVisible: true },
      { type: 'transfer', title: 'Airport Transfer', description: null, sortOrder: 1, sellingPriceMinor: BigInt(2000), currency: 'GBP', clientNote: null, clientVisible: true },
      { type: 'activity', title: 'Internal-only add-on', description: null, sortOrder: 2, sellingPriceMinor: BigInt(1000), currency: 'GBP', clientNote: null, clientVisible: false },
    ]
    const draft = buildItineraryDraftFromQuote(baseQuote(), items, NO_FLIGHTS, NO_HOTELS, NO_MEDIA)
    const tours = JSON.parse(draft.tours)
    const transfers = JSON.parse(draft.transfers)
    expect(tours).toHaveLength(1)
    expect(tours[0]).toMatchObject({ name: 'Desert Safari', notes: 'Evening safari', cost: 50 })
    expect(transfers).toHaveLength(1)
    expect(transfers[0]).toMatchObject({ type: 'Airport Transfer', cost: 20 })
  })

  it('numberOfTravellers derives from the first hotel option adults+children, defaulting to 1 with no hotel', () => {
    const withHotel = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, NO_FLIGHTS, [HOTEL], NO_MEDIA)
    expect(withHotel.numberOfTravellers).toBe(3)
    const withoutHotel = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, NO_FLIGHTS, NO_HOTELS, NO_MEDIA)
    expect(withoutHotel.numberOfTravellers).toBe(1)
  })

  it('startDate/endDate span the earliest and latest of all flight segment and hotel dates', () => {
    const draft = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, [FLIGHT], [HOTEL], NO_MEDIA)
    expect(draft.startDate?.toISOString()).toBe('2026-11-01T10:00:00.000Z')
    expect(draft.endDate?.toISOString()).toBe('2026-11-08T18:00:00.000Z')
  })

  it('null startDate/endDate when there is no flight and no hotel', () => {
    const draft = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, NO_FLIGHTS, NO_HOTELS, NO_MEDIA)
    expect(draft.startDate).toBeNull()
    expect(draft.endDate).toBeNull()
  })

  it('always status: draft, carries quoteId/conversationId, and a traceability note referencing the source Quote', () => {
    const draft = buildItineraryDraftFromQuote(baseQuote({ id: 'q99', reference: 'WT-Q-XYZ', conversationId: 42 }), NO_ITEMS, NO_FLIGHTS, NO_HOTELS, NO_MEDIA)
    expect(draft.status).toBe('draft')
    expect(draft.quoteId).toBe('q99')
    expect(draft.conversationId).toBe(42)
    expect(draft.notes).toContain('WT-Q-XYZ')
  })

  it('carries client fields straight through from the Quote', () => {
    const draft = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, NO_FLIGHTS, NO_HOTELS, NO_MEDIA)
    expect(draft.clientName).toBe('Ama Mensah')
    expect(draft.clientEmail).toBe('ama@example.com')
    expect(draft.clientPhone).toBe('+233554000000')
    expect(draft.title).toBe('Dubai Getaway')
    expect(draft.currency).toBe('GBP')
  })

  it('coverImage prefers a client-visible hero media item, falling back to the first client-visible item, else null', () => {
    const withHero = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, NO_FLIGHTS, NO_HOTELS, [
      { hotelOptionId: null, flightOptionId: null, url: 'https://cdn.example.com/plain.jpg', clientVisible: true, isHero: false, sortOrder: 0 },
      { hotelOptionId: null, flightOptionId: null, url: 'https://cdn.example.com/hero.jpg', clientVisible: true, isHero: true, sortOrder: 1 },
    ])
    expect(withHero.coverImage).toBe('https://cdn.example.com/hero.jpg')

    const noHero = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, NO_FLIGHTS, NO_HOTELS, [
      { hotelOptionId: null, flightOptionId: null, url: 'https://cdn.example.com/only.jpg', clientVisible: true, isHero: false, sortOrder: 0 },
    ])
    expect(noHero.coverImage).toBe('https://cdn.example.com/only.jpg')

    const none = buildItineraryDraftFromQuote(baseQuote(), NO_ITEMS, NO_FLIGHTS, NO_HOTELS, NO_MEDIA)
    expect(none.coverImage).toBeNull()
  })
})

// ── Route: creates, idempotent, authz, 404 ──────────────────────────────

const mockPrisma = {
  quote: { findUnique: jest.fn(), updateMany: jest.fn() },
  itinerary: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  quoteActivity: { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: jest.fn() }))
// Closing fix (security + QA review, 2026-09-19): the route now re-resolves
// identity via resolveClientActionContext whenever Quote.conversationId is
// set — every fixture below (baseQuote()) sets conversationId: 318, so it
// must be mocked (defaulting to VERIFIED — see beforeEach) for the existing
// happy-path tests to keep passing unmodified.
jest.mock('@/lib/inbox/client-context', () => ({ resolveClientActionContext: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { POST } from '@/app/api/admin/quotes/[id]/convert-to-itinerary/route'

const SESSION = { email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} }

function fakeReq() {
  return {} as unknown as Parameters<typeof POST>[0]
}
function ctx(id: string) {
  return { params: { id } }
}

function fullQuoteRow(overrides: Record<string, unknown> = {}) {
  return {
    ...baseQuote(),
    itineraryId: null,
    items: [],
    flightOptions: [],
    hotelOptions: [],
    media: [],
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(hasPermission as jest.Mock).mockReturnValue(true)
  ;(resolveClientActionContext as jest.Mock).mockResolvedValue({
    ok: true, context: { resolution: 'VERIFIED' },
  })
  mockPrisma.quote.findUnique.mockResolvedValue(null)
  mockPrisma.quote.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.itinerary.findUnique.mockResolvedValue(null)
  mockPrisma.itinerary.create.mockResolvedValue({ id: 'itin-1', referenceNumber: 'WALZ-ABC123' })
  mockPrisma.itinerary.delete.mockResolvedValue({})
  mockPrisma.quoteActivity.create.mockResolvedValue({})
})

describe('POST /api/admin/quotes/[id]/convert-to-itinerary — route', () => {
  it('401s with no session, before touching the database', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await POST(fakeReq(), ctx('q1'))
    expect(res.status).toBe(401)
    expect(mockPrisma.quote.findUnique).not.toHaveBeenCalled()
  })

  it('403s when the session lacks quotes.convert — the SAME permission the sibling PATCH action===\'convert\' handler requires', async () => {
    ;(hasPermission as jest.Mock).mockReturnValue(false)
    const res = await POST(fakeReq(), ctx('q1'))
    expect(res.status).toBe(403)
    expect(hasPermission).toHaveBeenCalledWith(SESSION, 'quotes.convert')
    expect(mockPrisma.quote.findUnique).not.toHaveBeenCalled()
  })

  it('the route source uses the exact same permission literal as the sibling PATCH convert action', () => {
    const routeSrc = read('app/api/admin/quotes/[id]/convert-to-itinerary/route.ts')
    const siblingSrc = read('app/api/admin/quotes/[id]/route.ts')
    expect(routeSrc).toContain("hasPermission(session, 'quotes.convert')")
    expect(siblingSrc).toContain("hasPermission(session, 'quotes.convert')")
  })

  it('404s on an unknown quote id', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(null)
    const res = await POST(fakeReq(), ctx('missing'))
    expect(res.status).toBe(404)
  })

  it('creates an Itinerary from the quote and writes itineraryId back onto the Quote', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(fullQuoteRow())
    mockPrisma.itinerary.findUnique.mockResolvedValue(null) // uniqueness probe(s) for referenceNumber
    mockPrisma.itinerary.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'itin-1', referenceNumber: data.referenceNumber,
    }))
    mockPrisma.quote.updateMany.mockResolvedValue({ count: 1 })

    const res = await POST(fakeReq(), ctx('q1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.itineraryId).toBe('itin-1')
    expect(body.referenceNumber).toMatch(/^WALZ-[A-Z0-9]{6}$/)

    expect(mockPrisma.itinerary.create).toHaveBeenCalledTimes(1)
    const created = mockPrisma.itinerary.create.mock.calls[0][0].data
    expect(created.status).toBe('draft')
    expect(created.quoteId).toBe('q1')
    expect(created.referenceNumber).toBe(body.referenceNumber)

    expect(mockPrisma.quote.updateMany).toHaveBeenCalledWith({
      where: { id: 'q1', itineraryId: null },
      data: { itineraryId: 'itin-1' },
    })
  })

  it('is idempotent: a second call on an already-converted quote returns the existing itinerary and creates nothing new', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(fullQuoteRow({ itineraryId: 'itin-1' }))
    mockPrisma.itinerary.findUnique.mockResolvedValue({ id: 'itin-1', referenceNumber: 'WALZ-ABC123' })

    const res = await POST(fakeReq(), ctx('q1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ itineraryId: 'itin-1', referenceNumber: 'WALZ-ABC123', alreadyConverted: true })
    expect(mockPrisma.itinerary.create).not.toHaveBeenCalled()
    expect(mockPrisma.quote.updateMany).not.toHaveBeenCalled()
  })

  it('race guard: if the atomic claim loses (another request converted first), the orphan draft is deleted and the winner is returned', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(fullQuoteRow())
    mockPrisma.itinerary.findUnique
      .mockResolvedValueOnce(null) // referenceNumber uniqueness probe
      .mockResolvedValueOnce({ id: 'itin-winner', referenceNumber: 'WALZ-WINNER' }) // winner lookup
    mockPrisma.itinerary.create.mockResolvedValue({ id: 'itin-loser', referenceNumber: 'WALZ-LOSER' })
    mockPrisma.quote.updateMany.mockResolvedValue({ count: 0 }) // lost the race
    mockPrisma.quote.findUnique
      .mockResolvedValueOnce(fullQuoteRow()) // first call (load quote)
      .mockResolvedValueOnce({ itineraryId: 'itin-winner' }) // winner re-check
    mockPrisma.itinerary.delete.mockResolvedValue({})

    const res = await POST(fakeReq(), ctx('q1'))
    const body = await res.json()
    expect(mockPrisma.itinerary.delete).toHaveBeenCalledWith({ where: { id: 'itin-loser' } })
    expect(body).toEqual({ itineraryId: 'itin-winner', referenceNumber: 'WALZ-WINNER', alreadyConverted: true })
  })

  it('never imports from the protected GA0-GA6 approve route or proposalHash (mentions in comments explaining WHY they are untouched are fine — only actual imports are checked); the protected files themselves stay unaware of this feature', () => {
    const routeSrc = read('app/api/admin/quotes/[id]/convert-to-itinerary/route.ts')
    expect(routeSrc).not.toMatch(/from ['"]@\/lib\/proposalHash['"]/)
    expect(routeSrc).not.toMatch(/^import.*approve\/route/m)
    const approveSrc = read('app/api/itinerary/[ref]/approve/route.ts')
    const legacyActionSrc = read('app/api/quote-proposal/[token]/action/route.ts')
    expect(approveSrc).not.toContain('convert-to-itinerary')
    expect(legacyActionSrc).not.toContain('convert-to-itinerary')
  })
})
