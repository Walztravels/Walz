/**
 * Closing fixes (security + QA review, 2026-09-19) applied against the full
 * b89ec069..working-tree diff (5 phases). Two independently-confirmed gaps:
 *
 *  Fix 1 — 8 new fetch() call sites (7 in CreateQuoteDrawer.tsx, 1 in
 *  app/admin/quotes/[id]/page.tsx's handleConvertToItinerary) only branched
 *  on !res.ok, with no res.status === 401 check to redirect an
 *  expired-session staff member to /admin/login — the existing pattern used
 *  everywhere else in the Inbox (lib/inbox/useClientContext.ts,
 *  app/admin/inbox/page.tsx's fetchConvs). Verified source-level below,
 *  matching this repo's established source-pin test style for these files
 *  (see __tests__/inbox-ux42b-live-search.test.ts).
 *
 *  Fix 2 — app/api/admin/travel-search/add-to-quote/route.ts and
 *  app/api/admin/quotes/[id]/convert-to-itinerary/route.ts authorized purely
 *  via a permission check, with no re-check of (a) client identity
 *  resolution for Inbox-originated quotes (Quote.conversationId set), or
 *  (b) submitted flight/hotel pricing. Both are closed here:
 *   2a. Both routes now re-resolve identity via the existing
 *       resolveClientActionContext(conversationId, session) whenever
 *       Quote.conversationId is non-null, requiring VERIFIED or LINKED —
 *       the exact HARD INVARIANT createPaymentRequest() already enforces
 *       for every other Action Centre commercial route. Skipped entirely
 *       when conversationId is null (a quote built outside the Inbox).
 *   2b. add-to-quote now re-verifies flight/hotel cost against a fresh
 *       Duffel/Hotelbeds revalidation (reusing the exact calls the sibling
 *       revalidate routes make) before persisting, rejecting on ANY
 *       mismatch. Activity/transfer have no revalidation infrastructure to
 *       reuse — that residual gap is left as-is, with a code comment
 *       documenting it (asserted below), not silently accepted.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── Fix 1 — 401 handling, source-level ──────────────────────────────────

describe('Fix 1 — session-expiry (401) handling on the 8 new fetch call sites', () => {
  // QUOTE BUILDER V1.2 step 1: router acquisition and every one of these
  // fetch call sites (search/revalidate/add-to-quote/handleCreate) were
  // mechanically extracted, unchanged, out of CreateQuoteDrawer.tsx into
  // useQuoteBuilderState.ts — same source, same 401 checks, new home. This
  // whole describe block's source-pins therefore now read hookSrc.
  const hookSrc = read('app/admin/inbox/components/quote-builder/useQuoteBuilderState.ts')
  const quotePageSrc = read('app/admin/quotes/[id]/page.tsx')

  it('useQuoteBuilderState (extracted from CreateQuoteDrawer) imports useRouter and obtains a router instance (it is a client-side hook with no prior router access)', () => {
    expect(hookSrc).toContain("import { useRouter } from 'next/navigation'")
    expect(hookSrc).toContain('const router = useRouter()')
  })

  // 8 occurrences of the `return }` variant (the original 7 call sites plus
  // handleFinalize, added in a follow-up closing pass once QA additionally
  // flagged that handleCreate/handleFinalize — CreateQuoteDrawer's two
  // pre-existing quote-persistence calls — were the same regression class
  // even though they predate this release's 8-site fix list). handleCreate
  // uses a `return null` variant (it returns `GeneratedQuote | null`),
  // checked separately below.
  it('8 fetch call sites in useQuoteBuilderState check res.status === 401 and redirect to /admin/login (`return` variant)', () => {
    const occurrences = hookSrc.split("if (res.status === 401) { router.push('/admin/login'); return }").length - 1
    expect(occurrences).toBe(8)
  })

  it('handleCreate (the `GeneratedQuote | null`-returning quote-persistence call) also checks res.status === 401', () => {
    const fnStart = hookSrc.indexOf('async function handleCreate')
    const fnEnd = hookSrc.indexOf('async function handleFinalize')
    expect(fnStart).toBeGreaterThan(-1)
    expect(fnEnd).toBeGreaterThan(fnStart)
    const fn = hookSrc.slice(fnStart, fnEnd)
    expect(fn).toContain("if (res.status === 401) { router.push('/admin/login'); return null }")
    const idx401 = fn.indexOf('res.status === 401')
    const idxOk = fn.indexOf('!res.ok')
    expect(idxOk).toBeGreaterThan(-1)
    expect(idx401).toBeLessThan(idxOk)
  })

  const DRAWER_CALL_SITES: Array<{ needle: string; label: string }> = [
    { needle: "fetch('/api/admin/travel-search/flights'", label: 'live flight search' },
    { needle: "fetch('/api/admin/travel-search/hotels'", label: 'live hotel search' },
    { needle: 'fetch(`/api/admin/travel-search/activities?', label: 'live activity search' },
    { needle: "fetch('/api/admin/travel-search/transfers'", label: 'live transfer search' },
    { needle: "fetch('/api/admin/travel-search/flights/revalidate'", label: 'flight revalidate' },
    { needle: "fetch('/api/admin/travel-search/hotels/revalidate'", label: 'hotel revalidate' },
    { needle: "fetch('/api/admin/travel-search/add-to-quote'", label: 'add-to-quote attach' },
  ]

  for (const { needle, label } of DRAWER_CALL_SITES) {
    it(`${label} fetch is followed by the 401 check before its !res.ok branch`, () => {
      const fetchIdx = hookSrc.indexOf(needle)
      expect(fetchIdx).toBeGreaterThan(-1)
      const next401Idx = hookSrc.indexOf('res.status === 401', fetchIdx)
      const nextOkIdx = hookSrc.indexOf('!res.ok', fetchIdx)
      expect(next401Idx).toBeGreaterThan(-1)
      expect(nextOkIdx).toBeGreaterThan(-1)
      expect(next401Idx).toBeLessThan(nextOkIdx)
    })
  }

  it('quotes/[id]/page.tsx already has a router, and handleConvertToItinerary now checks r.status === 401 before its !r.ok branch', () => {
    expect(quotePageSrc).toContain("import { useParams, useRouter } from 'next/navigation'")
    const fnStart = quotePageSrc.indexOf('async function handleConvertToItinerary')
    const fnEnd = quotePageSrc.indexOf('async function handleDelete')
    expect(fnStart).toBeGreaterThan(-1)
    expect(fnEnd).toBeGreaterThan(fnStart)
    const fn = quotePageSrc.slice(fnStart, fnEnd)
    expect(fn).toContain("if (r.status === 401) { router.push('/admin/login'); return }")
    const idx401 = fn.indexOf('r.status === 401')
    const idxOk = fn.indexOf('!r.ok')
    expect(idxOk).toBeGreaterThan(-1)
    expect(idx401).toBeLessThan(idxOk)
  })
})

// ── Fix 2 — server-side re-verification ─────────────────────────────────

const mockPrisma = {
  quote: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  quoteItem: { create: jest.fn(), findMany: jest.fn() },
  quoteFlightOption: { create: jest.fn() },
  quoteHotelOption: { create: jest.fn() },
  itinerary: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  quoteActivity: { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: jest.fn() }))
jest.mock('@/lib/inbox/client-context', () => ({ resolveClientActionContext: jest.fn() }))
jest.mock('@/lib/flights/duffel', () => ({ getOffer: jest.fn() }))
jest.mock('@/lib/hotelbeds', () => ({ hotelbedsRequest: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { getOffer } from '@/lib/flights/duffel'
import { hotelbedsRequest } from '@/lib/hotelbeds'
import { POST as addToQuotePOST } from '@/app/api/admin/travel-search/add-to-quote/route'
import { POST as convertPOST } from '@/app/api/admin/quotes/[id]/convert-to-itinerary/route'

const SESSION = { email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} }

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof addToQuotePOST>[0]
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
  ;(hasPermission as jest.Mock).mockReturnValue(true)
  mockPrisma.quoteItem.findMany.mockResolvedValue([])
  mockPrisma.quote.update.mockResolvedValue({})
  mockPrisma.quoteFlightOption.create.mockResolvedValue({ id: 'fo1', segments: [] })
  mockPrisma.quoteHotelOption.create.mockResolvedValue({ id: 'ho1' })
  mockPrisma.quoteItem.create.mockResolvedValue({ id: 'qi1' })
  ;(getOffer as jest.Mock).mockResolvedValue({ data: { total_amount: '500', total_currency: 'GBP', expires_at: null } })
  ;(hotelbedsRequest as jest.Mock).mockResolvedValue({ hotel: { rooms: [{ rates: [{ rateKey: 'rk1', net: '400' }] }] } })
})

describe('Fix 2b — add-to-quote price verification (flight/hotel only)', () => {
  beforeEach(() => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'draft', currency: 'GBP', conversationId: null })
  })

  it('flight: attaches when the freshly revalidated total matches costMinor exactly', async () => {
    const res = await addToQuotePOST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 2500, serviceFeeMinor: 0, sellingPriceMinor: 52500, currency: 'GBP',
    }))
    expect(res.status).toBe(200)
    expect(getOffer).toHaveBeenCalledWith('off_1')
    expect(mockPrisma.quoteFlightOption.create).toHaveBeenCalled()
  })

  it('flight: rejects (400, PRICE_MISMATCH) when the revalidated total differs from client-submitted costMinor', async () => {
    ;(getOffer as jest.Mock).mockResolvedValue({ data: { total_amount: '550', total_currency: 'GBP', expires_at: null } }) // 55000, client sent 50000
    const res = await addToQuotePOST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 2500, serviceFeeMinor: 0, sellingPriceMinor: 52500, currency: 'GBP',
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('PRICE_MISMATCH')
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
    expect(mockPrisma.quoteItem.create).not.toHaveBeenCalled()
  })

  it('flight: rejects (400, PRICE_MISMATCH) when the revalidated amount matches numerically but the supplier currency differs (closing re-check finding)', async () => {
    // Same 50000 minor units as the client submitted, but priced by the
    // supplier in EUR while the quote/payload both claim GBP — a magnitude-
    // only check would wrongly accept this.
    ;(getOffer as jest.Mock).mockResolvedValue({ data: { total_amount: '500', total_currency: 'EUR', expires_at: null } })
    const res = await addToQuotePOST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 2500, serviceFeeMinor: 0, sellingPriceMinor: 52500, currency: 'GBP',
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('PRICE_MISMATCH')
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
  })

  it('flight: rejects (400) when the offer no longer exists on revalidation', async () => {
    ;(getOffer as jest.Mock).mockRejectedValue(new Error('404 not_found'))
    const res = await addToQuotePOST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 2500, serviceFeeMinor: 0, sellingPriceMinor: 52500, currency: 'GBP',
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('PRICE_REVALIDATION_FAILED')
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
  })

  it('hotel: attaches when the freshly revalidated net cost matches costMinor exactly', async () => {
    const res = await addToQuotePOST(req({
      type: 'hotel', quoteId: 'q1', offer: HOTEL_OFFER, selectedRateKey: 'rk1',
      costMinor: 40000, markupMinor: 7200, serviceFeeMinor: 0, sellingPriceMinor: 47200, currency: 'GBP',
    }))
    expect(res.status).toBe(200)
    expect(hotelbedsRequest).toHaveBeenCalled()
    expect(mockPrisma.quoteHotelOption.create).toHaveBeenCalled()
  })

  // Behavior change (deliberate, not a weakening — see the
  // HOTEL_PRICE_TOLERANCE_PERCENT comment in the route): Hotelbeds
  // "RECHECK" rates are dynamically re-priced on every /checkrates call by
  // design, and this route makes an independent second /checkrates call
  // beyond the client's own revalidate-step call — so ANY drift, including
  // a single-minor-unit jitter, used to false-positive reject an entirely
  // legitimate, unmodified staff selection. A tolerance band now absorbs
  // small drift; large drift is no longer a flat rejection either — it
  // returns a structured "price changed, please accept" response instead
  // (covered by the two new tests below). This test now covers a drift
  // that exceeds the 1% band, asserting the NEW structured-response shape.
  it('hotel: returns PRICE_CHANGED_REQUIRES_ACCEPTANCE (409) with the fresh price when the revalidated net cost exceeds the tolerance band', async () => {
    ;(hotelbedsRequest as jest.Mock).mockResolvedValue({ hotel: { rooms: [{ rates: [{ rateKey: 'rk1', net: '450' }] }] } }) // 45000 vs 40000 — 12.5% drift, well past 1%
    const res = await addToQuotePOST(req({
      type: 'hotel', quoteId: 'q1', offer: HOTEL_OFFER, selectedRateKey: 'rk1',
      costMinor: 40000, markupMinor: 7200, serviceFeeMinor: 0, sellingPriceMinor: 47200, currency: 'GBP',
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('PRICE_CHANGED_REQUIRES_ACCEPTANCE')
    expect(body.newNetMinor).toBe(45000)
    expect(body.newMarkupMinor).toBe(7200) // absolute markup preserved unchanged (no % field on the payload)
    expect(body.newServiceFeeMinor).toBe(0)
    expect(body.newSellingPriceMinor).toBe(52200) // 45000 + 7200 + 0
    expect(body.currency).toBe('GBP')
    expect(mockPrisma.quoteHotelOption.create).not.toHaveBeenCalled()
    expect(mockPrisma.quoteItem.create).not.toHaveBeenCalled()
  })

  it('hotel: attaches using the FRESH revalidated net cost (not the stale client-submitted one) when drift is within the 1% tolerance band', async () => {
    // Client submitted 40000; live rate has ticked up to 40200 (0.5% drift,
    // the kind of single-checkrates-call jitter RECHECK rates produce) —
    // within the ~1% (400 minor-unit) band, so this must proceed, but the
    // PERSISTED cost/selling price must be the fresh 40200-based figures,
    // never the stale client-submitted 40000/47200.
    ;(hotelbedsRequest as jest.Mock).mockResolvedValue({ hotel: { rooms: [{ rates: [{ rateKey: 'rk1', net: '402' }] }] } })
    const res = await addToQuotePOST(req({
      type: 'hotel', quoteId: 'q1', offer: HOTEL_OFFER, selectedRateKey: 'rk1',
      costMinor: 40000, markupMinor: 7200, serviceFeeMinor: 0, sellingPriceMinor: 47200, currency: 'GBP',
    }))
    expect(res.status).toBe(200)
    expect(mockPrisma.quoteHotelOption.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          costMinor: BigInt(40200),
          markupMinor: BigInt(7200),
          sellingPriceMinor: BigInt(47400), // 40200 + 7200 + 0, NOT the stale 47200
        }),
      }),
    )
    expect(mockPrisma.quoteItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          costMinor: BigInt(40200),
          sellingPriceMinor: BigInt(47400),
        }),
      }),
    )
  })

  it('hotel: rejects (400, PRICE_MISMATCH) when the revalidated net cost matches numerically but the supplier currency differs (closing re-check finding)', async () => {
    ;(hotelbedsRequest as jest.Mock).mockResolvedValue({
      hotel: { rooms: [{ rates: [{ rateKey: 'rk1', net: '400', currency: 'USD' }] }] },
    })
    const res = await addToQuotePOST(req({
      type: 'hotel', quoteId: 'q1', offer: HOTEL_OFFER, selectedRateKey: 'rk1',
      costMinor: 40000, markupMinor: 7200, serviceFeeMinor: 0, sellingPriceMinor: 47200, currency: 'GBP',
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('PRICE_MISMATCH')
    expect(mockPrisma.quoteHotelOption.create).not.toHaveBeenCalled()
  })

  it('hotel: rejects (400) when the rate key is no longer offered on revalidation', async () => {
    ;(hotelbedsRequest as jest.Mock).mockResolvedValue({ hotel: { rooms: [{ rates: [] }] } })
    const res = await addToQuotePOST(req({
      type: 'hotel', quoteId: 'q1', offer: HOTEL_OFFER, selectedRateKey: 'rk1',
      costMinor: 40000, markupMinor: 7200, serviceFeeMinor: 0, sellingPriceMinor: 47200, currency: 'GBP',
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('PRICE_REVALIDATION_FAILED')
    expect(mockPrisma.quoteHotelOption.create).not.toHaveBeenCalled()
  })

  it('activity: no revalidation infrastructure exists — client-submitted costMinor is trusted as-is (documented residual gap, not a silent oversight)', async () => {
    const res = await addToQuotePOST(req({
      type: 'activity', quoteId: 'q1', offer: ACTIVITY_OFFER,
      costMinor: 5000, markupMinor: 1000, serviceFeeMinor: 0, sellingPriceMinor: 6000, currency: 'GBP',
    }))
    expect(res.status).toBe(200)
    expect(getOffer).not.toHaveBeenCalled()
    expect(hotelbedsRequest).not.toHaveBeenCalled()
  })

  it('the residual activity/transfer pricing gap is documented in a code comment, not silently accepted', () => {
    const routeSrc = read('app/api/admin/travel-search/add-to-quote/route.ts')
    const branchIdx = routeSrc.indexOf("payload.type === 'activity' || payload.type === 'transfer'")
    expect(branchIdx).toBeGreaterThan(-1)
    const nearby = routeSrc.slice(branchIdx, branchIdx + 800)
    expect(nearby).toMatch(/KNOWN, SCOPED RESIDUAL GAP/)
  })
})

describe('Fix 2a — add-to-quote identity re-check', () => {
  it('skips the identity check entirely when Quote.conversationId is null (a quote built outside the Inbox)', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'draft', currency: 'GBP', conversationId: null })
    const res = await addToQuotePOST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 2500, serviceFeeMinor: 0, sellingPriceMinor: 52500, currency: 'GBP',
    }))
    expect(res.status).toBe(200)
    expect(resolveClientActionContext).not.toHaveBeenCalled()
  })

  it('rejects (403, CLIENT_IDENTITY_REQUIRED) when the conversation resolves to HEURISTIC identity', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'draft', currency: 'GBP', conversationId: 318 })
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'HEURISTIC' } })
    const res = await addToQuotePOST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 2500, serviceFeeMinor: 0, sellingPriceMinor: 52500, currency: 'GBP',
    }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('CLIENT_IDENTITY_REQUIRED')
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
    expect(getOffer).not.toHaveBeenCalled() // identity gate short-circuits before price verification
  })

  it('rejects (403, CLIENT_IDENTITY_REQUIRED) when the conversation resolves to UNRESOLVED identity', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'draft', currency: 'GBP', conversationId: 318 })
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'UNRESOLVED' } })
    const res = await addToQuotePOST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 2500, serviceFeeMinor: 0, sellingPriceMinor: 52500, currency: 'GBP',
    }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('CLIENT_IDENTITY_REQUIRED')
  })

  it('propagates a failed resolution (e.g. conversation access denied) as CLIENT_IDENTITY_REQUIRED at the resolver\'s own status', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'draft', currency: 'GBP', conversationId: 318 })
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: false, status: 403, error: 'Conversation access denied.' })
    const res = await addToQuotePOST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 2500, serviceFeeMinor: 0, sellingPriceMinor: 52500, currency: 'GBP',
    }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('CLIENT_IDENTITY_REQUIRED')
  })

  it('allows attach when the conversation resolves to VERIFIED identity', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'draft', currency: 'GBP', conversationId: 318 })
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'VERIFIED' } })
    const res = await addToQuotePOST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 2500, serviceFeeMinor: 0, sellingPriceMinor: 52500, currency: 'GBP',
    }))
    expect(res.status).toBe(200)
  })

  it('allows attach when the conversation resolves to LINKED identity', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'draft', currency: 'GBP', conversationId: 318 })
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'LINKED' } })
    const res = await addToQuotePOST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 2500, serviceFeeMinor: 0, sellingPriceMinor: 52500, currency: 'GBP',
    }))
    expect(res.status).toBe(200)
  })
})

describe('Fix 2a — convert-to-itinerary identity re-check', () => {
  function fullQuoteRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'q1', reference: 'WT-Q-20260919-0001', title: 'Dubai Getaway',
      clientName: 'Ama Mensah', clientEmail: 'ama@example.com', clientPhone: null,
      currency: 'GBP',
      totalMinor: BigInt(150000), subtotalMinor: BigInt(140000), markupMinor: BigInt(10000),
      serviceChargeMinor: BigInt(0), discountMinor: BigInt(0),
      depositMinor: null, depositCurrency: null,
      itineraryId: null, items: [], flightOptions: [], hotelOptions: [], media: [],
      conversationId: null,
      ...overrides,
    }
  }
  function fakeReq() { return {} as unknown as Parameters<typeof convertPOST>[0] }
  function ctx(id: string) { return { params: { id } } }

  beforeEach(() => {
    mockPrisma.quote.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.itinerary.findUnique.mockResolvedValue(null)
    mockPrisma.itinerary.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'itin-1', referenceNumber: data.referenceNumber,
    }))
    mockPrisma.quoteActivity.create.mockResolvedValue({})
  })

  it('skips the identity check entirely when Quote.conversationId is null (a quote built outside the Inbox)', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(fullQuoteRow({ conversationId: null }))
    const res = await convertPOST(fakeReq(), ctx('q1'))
    expect(res.status).toBe(200)
    expect(resolveClientActionContext).not.toHaveBeenCalled()
    expect(mockPrisma.itinerary.create).toHaveBeenCalled()
  })

  it('rejects (403, CLIENT_IDENTITY_REQUIRED) when the conversation resolves to UNRESOLVED identity, before creating any Itinerary', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(fullQuoteRow({ conversationId: 42 }))
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'UNRESOLVED' } })
    const res = await convertPOST(fakeReq(), ctx('q1'))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('CLIENT_IDENTITY_REQUIRED')
    expect(mockPrisma.itinerary.create).not.toHaveBeenCalled()
    expect(mockPrisma.quote.updateMany).not.toHaveBeenCalled()
  })

  it('rejects (403, CLIENT_IDENTITY_REQUIRED) when the conversation resolves to HEURISTIC identity', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(fullQuoteRow({ conversationId: 42 }))
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'HEURISTIC' } })
    const res = await convertPOST(fakeReq(), ctx('q1'))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('CLIENT_IDENTITY_REQUIRED')
  })

  it('allows conversion when the conversation resolves to VERIFIED identity', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(fullQuoteRow({ conversationId: 42 }))
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'VERIFIED' } })
    const res = await convertPOST(fakeReq(), ctx('q1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.itinerary.create).toHaveBeenCalled()
  })

  it('allows conversion when the conversation resolves to LINKED identity', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(fullQuoteRow({ conversationId: 42 }))
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'LINKED' } })
    const res = await convertPOST(fakeReq(), ctx('q1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.itinerary.create).toHaveBeenCalled()
  })
})
