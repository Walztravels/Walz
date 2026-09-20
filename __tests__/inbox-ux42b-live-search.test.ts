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
import { Prisma } from '@prisma/client'

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
// V1.3 — the route now independently converts a supplier-currency amount
// into the quote's own currency (server-authoritative FX) instead of
// hard-rejecting any mismatch outright. Mocked so these tests never make a
// real external exchangerate-api.com call.
jest.mock('@/lib/fx', () => ({ getStandardRate: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { getOffer } from '@/lib/flights/duffel'
import { hotelbedsRequest } from '@/lib/hotelbeds'
import { getStandardRate } from '@/lib/fx'
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

  it('flight: a payload claiming USD when the live Duffel offer is actually GBP is still rejected before any write — PRICE_MISMATCH, not a currency-conversion case (the CLAIM about the supplier currency is false, so this is a data-integrity rejection, unrelated to whether GBP legitimately differs from the quote\'s own currency)', async () => {
    const res = await POST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 2500, serviceFeeMinor: 0, sellingPriceMinor: 52500, currency: 'USD',
    }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.code).toBe('PRICE_MISMATCH')
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
    expect(mockPrisma.quoteItem.create).not.toHaveBeenCalled()
  })

  // V1.3 — a genuinely different supplier currency (EUR hotel, GBP quote,
  // both truthfully verified/claimed) is no longer rejected outright: the
  // route independently converts it server-side. This replaces the old
  // "hard reject any mismatch" test with a positive assertion that real
  // conversion (not relabeling) took place.
  it('hotel: a genuinely different, truthfully-claimed supplier currency (EUR item, GBP quote) is converted server-side, never relabeled', async () => {
    ;(getStandardRate as jest.Mock).mockResolvedValue({
      baseCurrency: 'EUR', quoteCurrency: 'GBP',
      rawRate: new Prisma.Decimal('0.85'),
      rateSource: 'STANDARD_MARKET', provider: 'exchangerate-api', fetchedAt: new Date('2026-09-19T12:00:00.000Z'),
    })
    const res = await POST(req({
      type: 'hotel', quoteId: 'q1', offer: HOTEL_OFFER, selectedRateKey: 'rk1',
      costMinor: 40000, markupMinor: 7200, serviceFeeMinor: 0, sellingPriceMinor: 47200, currency: 'EUR',
    }))
    expect(res.status).toBe(200)
    expect(getStandardRate).toHaveBeenCalledWith('EUR', 'GBP', expect.any(Number))
    expect(mockPrisma.quoteHotelOption.create).toHaveBeenCalled()
    const createArgs = mockPrisma.quoteHotelOption.create.mock.calls[0][0]
    // 400.00 EUR net * 0.85 = 340.00 GBP -> 34000 minor units. Never the
    // original 40000 relabeled as GBP.
    expect(createArgs.data.costMinor).toBe(BigInt(34000))
    expect(createArgs.data.currency).toBe('GBP')
    expect(createArgs.data.supplierCostMinor).toBe(BigInt(40000))
    expect(createArgs.data.supplierCurrency).toBe('EUR')
    expect(createArgs.data.fxRate).toBe('0.85')
  })

  it('hotel: when the FX conversion fails (provider unavailable), the request is rejected before any write — never a fabricated 1:1 fallback', async () => {
    ;(getStandardRate as jest.Mock).mockResolvedValue(null)
    const res = await POST(req({
      type: 'hotel', quoteId: 'q1', offer: HOTEL_OFFER, selectedRateKey: 'rk1',
      costMinor: 40000, markupMinor: 7200, serviceFeeMinor: 0, sellingPriceMinor: 47200, currency: 'EUR',
    }))
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('FX_RATE_UNAVAILABLE')
    expect(mockPrisma.quoteHotelOption.create).not.toHaveBeenCalled()
    expect(mockPrisma.quoteItem.create).not.toHaveBeenCalled()
  })

  it('hotel: matching currency attaches successfully', async () => {
    const res = await POST(req({
      type: 'hotel', quoteId: 'q1', offer: HOTEL_OFFER, selectedRateKey: 'rk1',
      costMinor: 40000, markupMinor: 7200, serviceFeeMinor: 0, sellingPriceMinor: 47200, currency: 'GBP',
    }))
    expect(res.status).toBe(200)
    expect(mockPrisma.quoteHotelOption.create).toHaveBeenCalled()
  })

  // V1.3 — activity/transfer have no supplier revalidation (documented,
  // pre-existing gap, unchanged), but DO now convert a differing currency —
  // the same mechanism as flight/hotel, applied to a weaker-confidence
  // (client-submitted, unverified) input. Replaces the old hard-reject test
  // with a positive assertion that conversion actually occurred.
  it('activity: a differing currency (NGN item, GBP quote) is converted server-side — same FX mechanism as flight/hotel, applied to the unverified client-submitted cost', async () => {
    ;(getStandardRate as jest.Mock).mockResolvedValue({
      baseCurrency: 'NGN', quoteCurrency: 'GBP',
      rawRate: new Prisma.Decimal('0.0005'),
      rateSource: 'STANDARD_MARKET', provider: 'exchangerate-api', fetchedAt: new Date('2026-09-19T12:00:00.000Z'),
    })
    const res = await POST(req({
      type: 'activity', quoteId: 'q1', offer: ACTIVITY_OFFER,
      costMinor: 5000, markupMinor: 1000, serviceFeeMinor: 0, sellingPriceMinor: 6000, currency: 'NGN',
    }))
    expect(res.status).toBe(200)
    expect(getStandardRate).toHaveBeenCalledWith('NGN', 'GBP', expect.any(Number))
    expect(mockPrisma.quoteItem.create).toHaveBeenCalled()
    const createArgs = mockPrisma.quoteItem.create.mock.calls[0][0]
    // 50.00 NGN * 0.0005 = 0.025 GBP -> rounds to 0.03 -> 3 minor units.
    expect(createArgs.data.costMinor).toBe(BigInt(3))
    expect(createArgs.data.currency).toBe('GBP')
    expect(createArgs.data.supplierCostMinor).toBe(BigInt(5000))
    expect(createArgs.data.supplierCurrency).toBe('NGN')
  })

  it('activity: FX failure is rejected before any write, same as hotel/flight', async () => {
    ;(getStandardRate as jest.Mock).mockResolvedValue(null)
    const res = await POST(req({
      type: 'activity', quoteId: 'q1', offer: ACTIVITY_OFFER,
      costMinor: 5000, markupMinor: 1000, serviceFeeMinor: 0, sellingPriceMinor: 6000, currency: 'NGN',
    }))
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('FX_RATE_UNAVAILABLE')
    expect(mockPrisma.quoteItem.create).not.toHaveBeenCalled()
  })

  it('currency comparison is case-insensitive ("gbp" matches "GBP")', async () => {
    const res = await POST(req({
      type: 'flight', quoteId: 'q1', offer: FLIGHT_OFFER,
      costMinor: 50000, markupMinor: 0, serviceFeeMinor: 0, sellingPriceMinor: 50000, currency: 'gbp',
    }))
    expect(res.status).toBe(200)
  })

  // V1.3 — the old blanket "payload.currency !== quote.currency ->
  // CURRENCY_MISMATCH" check (a single pre-branch gate) no longer exists —
  // it has been replaced by per-branch server-authoritative FX conversion,
  // confirmed behaviorally above. The equivalent invariant worth pinning
  // now is that every branch's FX-failure check ("FX_RATE_UNAVAILABLE" /
  // "FX_RATE_IMPLAUSIBLE") is still checked and returned BEFORE that
  // branch's own .create() calls — i.e. a failed conversion can never
  // reach a database write, exactly the same "guard before create"
  // property the old test pinned, applied to the new mechanism.
  it('FX failure codes are checked (and returned) before that branch\'s own .create() calls — source pin, checked per branch', () => {
    const routeSrc = fs.readFileSync(
      path.join(process.cwd(), 'app/api/admin/travel-search/add-to-quote/route.ts'), 'utf8',
    )
    expect(routeSrc).not.toContain('CURRENCY_MISMATCH')
    expect((routeSrc.match(/converted\.code/g) ?? []).length).toBe(3) // flight, hotel, activity/transfer branches

    const branchBounds: [string, string | null][] = [
      ["payload.type === 'flight'", "payload.type === 'hotel'"],
      ["payload.type === 'hotel'", "payload.type === 'activity'"],
      ["payload.type === 'activity'", null],
    ]
    for (const [startNeedle, endNeedle] of branchBounds) {
      const start = routeSrc.indexOf(startNeedle)
      const end = endNeedle ? routeSrc.indexOf(endNeedle) : routeSrc.length
      expect(start).toBeGreaterThan(-1)
      const branchSrc = routeSrc.slice(start, end)
      const guardIdx = branchSrc.indexOf('converted.code')
      const firstCreateIdx = branchSrc.indexOf('.create(')
      expect(guardIdx).toBeGreaterThan(-1)
      expect(firstCreateIdx).toBeGreaterThan(-1)
      expect(guardIdx).toBeLessThan(firstCreateIdx)
    }
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
  // QUOTE BUILDER V1.2 step 1: live-search/attach business logic was
  // mechanically extracted, unchanged, out of CreateQuoteDrawer.tsx into
  // this hook. Assertions below that target that logic read hookSrc.
  // QUOTE BUILDER V1.2 step 2/3: the JSX that used to render directly in
  // CreateQuoteDrawer.tsx (which now renders no workspace JSX of its own —
  // see CreateQuoteDrawer.tsx's own header comment) moved into the
  // desktop/tablet/mobile workspace trees; assertions on that JSX below
  // read the specific tree file(s) it now lives in instead.
  const hookSrc = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/inbox/components/quote-builder/useQuoteBuilderState.ts'), 'utf8',
  )
  // QUOTE BUILDER V1.2: the Visa/Walz-service preset buttons and the
  // Select & Price pricing breakdown JSX moved out of CreateQuoteDrawer.tsx
  // into the desktop/mobile ManualItemPanel.tsx and SelectPricePanel.tsx
  // trees respectively (tablet reuses the mobile SelectPricePanel
  // unmodified — see tablet/TabletWorkspace.tsx's own comment).
  const readSrc = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
  const desktopManualItemSrc = readSrc('app/admin/inbox/components/quote-builder/desktop/panels/ManualItemPanel.tsx')
  const mobileManualItemSrc = readSrc('app/admin/inbox/components/quote-builder/mobile/panels/ManualItemPanel.tsx')
  const desktopSelectPriceSrc = readSrc('app/admin/inbox/components/quote-builder/desktop/SelectPricePanel.tsx')
  const mobileSelectPriceSrc = readSrc('app/admin/inbox/components/quote-builder/mobile/SelectPricePanel.tsx')

  it('search calls go through the existing /api/admin/travel-search/* routes only — no new supplier client code', () => {
    expect(hookSrc).toContain("fetch('/api/admin/travel-search/flights'")
    expect(hookSrc).toContain("fetch('/api/admin/travel-search/hotels'")
    expect(hookSrc).toContain("fetch(`/api/admin/travel-search/activities?")
    expect(hookSrc).toContain("fetch('/api/admin/travel-search/transfers'")
    expect(hookSrc).toContain("fetch('/api/admin/travel-search/add-to-quote'")
    expect(hookSrc).not.toMatch(/new Duffel|hotelbedsRequest\(/i)
  })

  it('flight/hotel offers require revalidateState === "ok" before confirmAddPending will attach', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('async function confirmAddPending'), hookSrc.indexOf('async function handleCreate'))
    expect(fn).toContain("(pending.type === 'flight' || pending.type === 'hotel') && pending.revalidateState !== 'ok'")
    expect(hookSrc).toContain("fetch('/api/admin/travel-search/flights/revalidate'")
    expect(hookSrc).toContain("fetch('/api/admin/travel-search/hotels/revalidate'")
  })

  it('a stale/expired offer surfaces a re-search prompt rather than silently attaching', () => {
    expect(hookSrc).toContain("revalidateState: 'stale'")
    // QUOTE BUILDER V1.2: the re-search prompt's default fallback text is
    // JSX that moved out of CreateQuoteDrawer.tsx into the Select & Price
    // panel, built independently for desktop and mobile (tablet reuses the
    // mobile one) — checked in both.
    expect(desktopSelectPriceSrc).toContain('This offer has changed. Please re-search.')
    expect(mobileSelectPriceSrc).toContain('This offer has changed. Please re-search.')
  })

  it('client-side currency guard blocks attach and never silently sums mismatched currencies', () => {
    expect(hookSrc).toContain('const pendingCurrencyMismatch = pending ? pending.offerCurrency.toUpperCase() !== currency.toUpperCase() : false')
    const fn = hookSrc.slice(hookSrc.indexOf('async function confirmAddPending'), hookSrc.indexOf('async function handleCreate'))
    expect(fn).toContain('if (pendingCurrencyMismatch)')
  })

  it('the draft quote is staged via the SAME handleCreate used by the manual "Create quote" button — no second creation path', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('async function confirmAddPending'), hookSrc.indexOf('async function handleCreate'))
    expect(fn).toContain('await handleCreate({ allowEmptyItems: true })')
    // Exactly one call site creates a quote (inside handleCreate) — the
    // live-search path reuses it rather than POSTing /api/admin/quotes again.
    const occurrences = hookSrc.split("fetch('/api/admin/quotes'").length - 1
    expect(occurrences).toBe(1)
  })

  it('manual item entry is unaffected: addItem/removeItem and the mini-form are untouched', () => {
    expect(hookSrc).toContain('function addItem()')
    expect(hookSrc).toContain('function removeItem(key: string)')
    expect(hookSrc).toContain("if (!itemTitle.trim() || !isValidAmountMajor(Number(itemPrice))) return")
  })

  it('Visa/Walz-service is wired as a manual-item preset from the existing UK_VISA_FEES source — no new pricing infra, no Visa Application duplication', () => {
    // QUOTE BUILDER V1.2: UK_VISA_FEES is imported by the two
    // ManualItemPanel.tsx trees now (desktop + mobile, tablet reuses the
    // mobile one) for the JSX preset-button price labels — no longer by
    // CreateQuoteDrawer.tsx, which renders no workspace JSX of its own
    // any more — and by useQuoteBuilderState.ts for applyVisaPreset's own
    // logic (unchanged).
    expect(desktopManualItemSrc).toContain("from '@/lib/config/visa-fees'")
    expect(mobileManualItemSrc).toContain("from '@/lib/config/visa-fees'")
    expect(hookSrc).toContain("from '@/lib/config/visa-fees'")
    expect(hookSrc).toContain('function applyVisaPreset')
    expect(hookSrc).toContain("setItemType('visa_service')")
  })

  it('pricing surfaces cost -> markup -> client price -> margin using the house pricing engine (lib/pricing/booking-price)', () => {
    // QUOTE BUILDER V1.2: this pricing breakdown moved out of
    // CreateQuoteDrawer.tsx into the dedicated Select & Price panel, built
    // independently for desktop and for mobile (tablet reuses the mobile
    // one) — checked in both so the invariant isn't narrowed to one
    // breakpoint.
    for (const src of [desktopSelectPriceSrc, mobileSelectPriceSrc]) {
      expect(src).toContain("from '@/lib/pricing/booking-price'")
      expect(src).toContain('calculateBookingPrice(')
      expect(src).toContain('Supplier / net cost')
      expect(src).toContain('Client price')
      expect(src).toContain('Margin')
    }
  })

  it('offer details (segments/rates/etc.) are preserved by passing the normalized offer straight through to add-to-quote, never re-derived', () => {
    expect(hookSrc).toContain('buildAttachPayload')
    expect(hookSrc).toMatch(/type: 'flight', offer: p\.offer as NormalizedFlightOffer/)
    expect(hookSrc).toMatch(/type: 'hotel', offer: p\.offer as NormalizedHotelOffer/)
  })
})
