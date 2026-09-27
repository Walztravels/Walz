/**
 * @jest-environment jsdom
 *
 * V1.4 ROUTE FIX — app/admin/quotes/new/page.tsx.
 *
 * This is the REAL production "New Quote" route (Admin → Quotes &
 * Proposals → New Quote) — NOT the unrelated app/admin/inbox/components/
 * quote-builder/** tree (an Inbox-conversation-scoped drawer a prior V1.4
 * effort built the equivalent UI into by mistake; production users
 * navigating the real page never see that work). This suite mounts the
 * REAL route-level component, `NewQuoteInner`, imported from the sibling
 * NewQuotePageContent.tsx (page.tsx itself is a thin Suspense-wrapped
 * shell around it — a Next.js page file may only have a default export,
 * so the actual implementation, including this named export, lives in
 * that non-page module; see its own comment on the export), for real
 * (react-dom/client + act) — the same pattern this repo already
 * uses for other route/page component tests (see
 * __tests__/itinerary-portal-flightcard.test.tsx,
 * __tests__/inbox-client-context-cache.test.tsx,
 * __tests__/qb-flights-v14-stops-and-filters.test.tsx). This repo does not
 * depend on @testing-library/react, so DOM interaction below uses the same
 * native-event-dispatch helpers those sibling tests already established
 * (see e.g. __tests__/a2p-forms-tours-concierge.test.tsx's `setInput`).
 *
 * `page.tsx`'s default export wraps NewQuoteInner in <Suspense>, which
 * exists solely to satisfy Next's useSearchParams() CSR-bailout rule for
 * the *build*; it adds nothing to test here (no fallback ever shows once
 * useSearchParams resolves synchronously, which the mock below makes it
 * do), so mounting NewQuoteInner directly is equivalent to mounting the
 * default export for every assertion in this file, without a real
 * Suspense boundary swallowing a thrown render error into a silent
 * fallback.
 */

import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { NewQuoteInner, mcLegsChronologyError } from '@/app/admin/quotes/new/NewQuotePageContent'
import type { NormalizedFlightOffer, NormalizedFlightSegment, NormalizedFlightJourney } from '@/lib/travel-search/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const pushMock = jest.fn()
const routerMock = { push: pushMock, refresh: jest.fn() }
// A STABLE mock matters (see inbox-client-context-cache.test.tsx's own
// comment) — real Next returns stable references across renders.
const searchParamsMock = { get: () => null }
jest.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => searchParamsMock,
}))

// ─── DOM helpers (matches this repo's established convention) ──────────────

let root: Root | null = null
let container: HTMLDivElement | null = null
function renderInto(node: React.ReactElement): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  act(() => { root = createRoot(container!); root!.render(node) })
  return container
}
afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null; container = null
  jest.restoreAllMocks()
})

function findButtonByText(el: HTMLElement, text: string): HTMLButtonElement {
  const btn = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.trim() === text)
  if (!btn) {
    const all = Array.from(el.querySelectorAll('button')).map(b => b.textContent?.trim()).join(' | ')
    throw new Error(`button "${text}" not found. Buttons present: ${all}`)
  }
  return btn as HTMLButtonElement
}
function findButtonByPartialText(el: HTMLElement, text: string): HTMLButtonElement {
  const btn = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes(text))
  if (!btn) throw new Error(`button containing "${text}" not found`)
  return btn as HTMLButtonElement
}
function click(btn: HTMLElement) {
  act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}
function mousedown(btn: HTMLElement) {
  act(() => { btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
}
function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function inputByPlaceholder(el: HTMLElement, placeholder: string): HTMLInputElement {
  const input = el.querySelector(`input[placeholder="${placeholder}"]`)
  if (!input) throw new Error(`input[placeholder="${placeholder}"] not found`)
  return input as HTMLInputElement
}
function labelText(el: Element): string | undefined { return el.textContent?.trim() }
function allLabelTexts(el: HTMLElement): (string | undefined)[] {
  return Array.from(el.querySelectorAll('label')).map(labelText)
}
/** Finds an AirportInput's text input by its visible label ("From"/"To"). */
function airportInputByLabel(el: HTMLElement, label: string): HTMLInputElement {
  const lbl = Array.from(el.querySelectorAll('label')).find(l => labelText(l) === label)
  if (!lbl) throw new Error(`label "${label}" not found`)
  const input = lbl.parentElement?.querySelector('input')
  if (!input) throw new Error(`input under label "${label}" not found`)
  return input as HTMLInputElement
}
/** Selects an AirportInput suggestion — the dropdown buttons use
 *  onMouseDown (not onClick), matching AirportInput's own implementation. */
function selectAirportSuggestion(el: HTMLElement, code: string) {
  const btn = Array.from(el.querySelectorAll('button')).find(b => b.querySelector('span')?.textContent?.trim() === code)
  if (!btn) {
    const all = Array.from(el.querySelectorAll('button')).map(b => b.textContent?.trim()).join(' | ')
    throw new Error(`airport suggestion "${code}" not found. Buttons: ${all}`)
  }
  mousedown(btn)
}
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
}

/** Fills Step 1 (Client Details) and advances to Step 2 (Search & Add),
 *  which defaults to the Flights tab. */
function goToSearchAndAdd(el: HTMLElement) {
  setInput(inputByPlaceholder(el, 'Full name'), 'Jane Doe')
  setInput(inputByPlaceholder(el, 'client@email.com'), 'jane@example.com')
  setInput(inputByPlaceholder(el, 'e.g. Dubai Holiday Package 2026'), 'Test Quote')
  click(findButtonByPartialText(el, 'Continue to Search'))
}

const STOPS_LABELS = ['Any', 'Direct', 'Max 1 Stop', 'Max 2 Stops']

// ─── Fixtures ────────────────────────────────────────────────────────────

let segCounter = 0
/** Every segment gets segmentOrder 0 — mirroring the REAL server
 *  normalization (app/api/admin/travel-search/flights/route.ts's
 *  journeyToNormalized resets each journey's segments to a LOCAL
 *  zero-based index). The POST body must forward this per-journey-local
 *  value UNCHANGED (all three segments here should show segmentOrder 0) —
 *  NOT renumber continuously across the flattened array (which would give
 *  [0, 1, 2]). A continuous renumbering defeats
 *  lib/action-centre/quote-to-itinerary.ts's splitSegmentsIntoLegs() "reset
 *  detected" branch (the only branch that reliably reconstructs journeys
 *  with an uneven segment count per leg), silently collapsing a genuine
 *  multi-city/round-trip option into one journey downstream. */
function seg(from: string, to: string): NormalizedFlightSegment {
  segCounter += 1
  return {
    segmentOrder: 0, originCode: from, originCity: null, originTerminal: null,
    destinationCode: to, destinationCity: null, destinationTerminal: null,
    departureAt: '2026-03-01T08:00:00', arrivalAt: '2026-03-01T10:00:00',
    flightNumber: `FX${segCounter}`, operatingCarrier: 'FX', marketingCarrier: 'FX',
    aircraft: null, durationMinutes: 120, stops: 0, layoverMinutes: null,
  }
}
/** A genuine 3-leg multi-city offer. Its legacy `segments`/`returnSegments`
 *  fields deliberately carry only journeys[0]/[1] (exactly what the real
 *  normalizer produces) — journeys[2] only exists in `journeys[]`, so this
 *  fixture only round-trips correctly through submit() if the fix reads
 *  from `journeys[]`. */
function threeJourneyOffer(): NormalizedFlightOffer {
  const j1: NormalizedFlightJourney = { direction: 'leg', segments: [seg('LOS', 'DXB')], stops: 0, durationMinutes: 120 }
  const j2: NormalizedFlightJourney = { direction: 'leg', segments: [seg('DXB', 'JFK')], stops: 0, durationMinutes: 120 }
  const j3: NormalizedFlightJourney = { direction: 'leg', segments: [seg('JFK', 'LOS')], stops: 0, durationMinutes: 120 }
  return {
    provider: 'duffel', providerOfferId: 'off_3leg', searchedAt: '2026-01-01T00:00:00Z',
    airline: 'Test Air', airlineCode: 'TA', tripType: 'multi-city', cabinClass: 'ECONOMY',
    supplierCurrency: 'GBP', supplierTotalAmount: 1000, supplierTotalMinor: 100000,
    offerExpiresAt: null, isRefundable: false, isChangeable: false, changeFee: null, noShowRule: null,
    fareClass: null, fareFamily: null, personalItem: null, cabinBaggage: null, checkedBaggage: null,
    checkedPieces: null, checkedWeight: null, seatIncluded: false, mealIncluded: false, seatsLeft: null,
    segments: j1.segments, returnSegments: j2.segments,
    journeys: [j1, j2, j3],
  }
}

type FetchCall = [string, RequestInit | undefined]
function installFetchMock(offer: NormalizedFlightOffer) {
  const calls: FetchCall[] = []
  const mock = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init])
    const u = String(url)
    if (u === '/api/admin/travel-search/flights') {
      return { ok: true, json: async () => ({ offers: [offer] }) } as Response
    }
    if (u.startsWith('/api/admin/clients/do-not-book')) {
      return { ok: true, json: async () => ({ doNotBook: false }) } as Response
    }
    if (u === '/api/admin/quotes') {
      return { ok: true, json: async () => ({ quote: { id: 'q1' } }) } as Response
    }
    return { ok: true, json: async () => ({}) } as Response
  })
  ;(globalThis as unknown as { fetch: unknown }).fetch = mock
  return { mock, calls }
}

/** Searches (round-trip, default trip type) and returns the results
 *  container after one offer has come back and its FlightCard rendered. */
async function searchAndGetCard(el: HTMLElement) {
  setInput(airportInputByLabel(el, 'From'), 'LOS')
  selectAirportSuggestion(el, 'LOS')
  setInput(airportInputByLabel(el, 'To'), 'DXB')
  selectAirportSuggestion(el, 'DXB')
  const departLabel = Array.from(el.querySelectorAll('label')).find(l => labelText(l) === 'Departure')!
  const departInput = departLabel.parentElement!.querySelector('input') as HTMLInputElement
  setInput(departInput, '2026-03-01')
  click(findButtonByText(el, 'Search Flights'))
  await flush()
}

// ─── Structural UI tests (mandatory assertions) ─────────────────────────────

describe('New Quote page (route-level) — Search & Add defaults', () => {
  it('defaults to the Flights tab and Cabin includes First', () => {
    installFetchMock(threeJourneyOffer())
    const el = renderInto(<NewQuoteInner />)
    goToSearchAndAdd(el)
    const flightsTab = findButtonByPartialText(el, 'Flights')
    expect(flightsTab.className).toContain('border-indigo-600')
    const cabinSelect = el.querySelector('select') as HTMLSelectElement
    const options = Array.from(cabinSelect.querySelectorAll('option')).map(o => o.textContent)
    expect(options.some(o => o?.includes('First'))).toBe(true)
  })
})

describe('New Quote page (route-level) — Multi-city journey rows', () => {
  it('shows LEG 1/LEG 2, an Add Leg control, no global Return field, and a Stops control', () => {
    installFetchMock(threeJourneyOffer())
    const el = renderInto(<NewQuoteInner />)
    goToSearchAndAdd(el)
    click(findButtonByText(el, 'Multi-city'))

    expect(el.textContent).toContain('LEG 1')
    expect(el.textContent).toContain('LEG 2')
    findButtonByPartialText(el, '+ Add Leg')
    expect(allLabelTexts(el)).not.toContain('Return')
    for (const label of STOPS_LABELS) findButtonByText(el, label)
  })

  it('+ Add Leg appends a 3rd removable leg, capped at 5', () => {
    installFetchMock(threeJourneyOffer())
    const el = renderInto(<NewQuoteInner />)
    goToSearchAndAdd(el)
    click(findButtonByText(el, 'Multi-city'))
    click(findButtonByPartialText(el, '+ Add Leg'))
    expect(el.textContent).toContain('LEG 3')
    expect(el.querySelectorAll('[aria-label="Remove leg 3"]').length).toBe(1)
    // Cap at 5
    click(findButtonByPartialText(el, '+ Add Leg'))
    click(findButtonByPartialText(el, '+ Add Leg'))
    expect(el.textContent).toContain('LEG 5')
    expect(() => findButtonByPartialText(el, '+ Add Leg')).toThrow()
  })
})

describe('New Quote page (route-level) — Round Trip / One Way', () => {
  it('Round Trip: the global Return field exists, Stops control still present', () => {
    installFetchMock(threeJourneyOffer())
    const el = renderInto(<NewQuoteInner />)
    goToSearchAndAdd(el)
    click(findButtonByText(el, 'Multi-city'))
    click(findButtonByText(el, 'Round Trip'))
    expect(allLabelTexts(el)).toContain('Return')
    for (const label of STOPS_LABELS) findButtonByText(el, label)
  })

  it('One Way: Return field is present but disabled (matches existing convention), Stops control still present', () => {
    installFetchMock(threeJourneyOffer())
    const el = renderInto(<NewQuoteInner />)
    goToSearchAndAdd(el)
    click(findButtonByText(el, 'One Way'))
    const returnLabel = Array.from(el.querySelectorAll('label')).find(l => labelText(l) === 'Return')
    expect(returnLabel).toBeTruthy()
    const returnInput = returnLabel!.parentElement!.querySelector('input') as HTMLInputElement
    expect(returnInput.disabled).toBe(true)
    for (const label of STOPS_LABELS) findButtonByText(el, label)
  })
})

// ─── mcLegsChronologyError (unit) ──────────────────────────────────────────

describe('mcLegsChronologyError', () => {
  it('returns null when legs are chronological', () => {
    expect(mcLegsChronologyError([{ date: '2026-01-10' }, { date: '2026-01-15' }, { date: '2026-01-20' }])).toBeNull()
  })
  it('returns null when dates are equal (same-day connections are allowed)', () => {
    expect(mcLegsChronologyError([{ date: '2026-01-10' }, { date: '2026-01-10' }])).toBeNull()
  })
  it('flags a non-chronological leg with a 1-based, human message', () => {
    const err = mcLegsChronologyError([{ date: '2026-01-15' }, { date: '2026-01-10' }])
    expect(err).toMatch(/Leg 2/)
    expect(err).toMatch(/Leg 1/)
  })
  it('ignores incomplete legs (missing date never falsely triggers it)', () => {
    expect(mcLegsChronologyError([{ date: '2026-01-15' }, { date: '' }, { date: '2026-01-10' }])).toBeNull()
  })
})

// ─── submit() segments-truncation fix (integration) ────────────────────────

describe('submit() flight cart-to-payload — segments truncation fix', () => {
  it('a 3-journey offer produces 3 journeys worth of segments in the POST body, each forwarding its own per-journey-local segmentOrder', async () => {
    const offer = threeJourneyOffer()
    const { calls } = installFetchMock(offer)
    const el = renderInto(<NewQuoteInner />)
    goToSearchAndAdd(el)
    await searchAndGetCard(el)

    expect(el.textContent).toContain('JOURNEY 1')
    expect(el.textContent).toContain('JOURNEY 2')
    expect(el.textContent).toContain('JOURNEY 3')

    // Open pricing (the only "Add to Quote" button before the overlay mounts)
    click(findButtonByText(el, 'Add to Quote'))
    const overlay = el.querySelector('.fixed.inset-0.z-50') as HTMLElement
    expect(overlay).toBeTruthy()
    click(findButtonByText(overlay, 'Add to Quote')) // default markup mode: markup/fee/tax all 0

    click(findButtonByText(el, 'Save as Draft'))
    await flush()

    const quoteCall = calls.find(([u]) => u === '/api/admin/quotes')
    expect(quoteCall).toBeTruthy()
    const body = JSON.parse(String(quoteCall![1]!.body))
    expect(body.flightOptions).toHaveLength(1)
    const segments = body.flightOptions[0].segments as { segmentOrder: number; originCode: string; destinationCode: string }[]
    expect(segments).toHaveLength(3)
    expect(segments.map(s => s.segmentOrder)).toEqual([0, 0, 0])
    expect(segments.map(s => `${s.originCode}-${s.destinationCode}`)).toEqual(['LOS-DXB', 'DXB-JFK', 'JFK-LOS'])
  })
})

// ─── PricingOverlay manual-selling-price toggle (integration) ──────────────

describe('PricingOverlay — manual selling price toggle', () => {
  it('typed value becomes selling exactly (not the markup-derived sum) when Manual Selling Price is chosen', async () => {
    const offer = threeJourneyOffer()
    const { calls } = installFetchMock(offer)
    const el = renderInto(<NewQuoteInner />)
    goToSearchAndAdd(el)
    await searchAndGetCard(el)

    click(findButtonByText(el, 'Add to Quote'))
    const overlay = el.querySelector('.fixed.inset-0.z-50') as HTMLElement
    click(findButtonByText(overlay, 'Manual Selling Price'))

    // PricingOverlay's numeric fields (Markup/Service Fee/Taxes, and now
    // Manual Selling Price) are all raw MINOR-unit direct-entry inputs —
    // an existing, unchanged convention (no `step="0.01"`, no *100
    // conversion anywhere in this overlay) distinct from ManualEntry's own
    // generic form, which IS major-unit/decimal.
    const manualLabel = Array.from(overlay.querySelectorAll('label')).find(l => labelText(l) === 'Client Selling Price')!
    const manualInput = manualLabel.parentElement!.querySelector('input') as HTMLInputElement
    setInput(manualInput, '99999')

    // Also set a Service Fee — proves selling is NOT re-derived as
    // supplierMinor + markup + fee + tax once manual mode is active.
    const feeLabel = Array.from(overlay.querySelectorAll('label')).find(l => labelText(l) === 'Service Fee')!
    const feeInput = feeLabel.parentElement!.querySelector('input') as HTMLInputElement
    setInput(feeInput, '5000') // would blow the total up if it were additive

    click(findButtonByText(overlay, 'Add to Quote'))
    click(findButtonByText(el, 'Save as Draft'))
    await flush()

    const quoteCall = calls.find(([u]) => u === '/api/admin/quotes')
    const body = JSON.parse(String(quoteCall![1]!.body))
    expect(body.flightOptions).toHaveLength(1)
    // Exactly the typed minor-unit figure — never supplierMinor + markup +
    // fee + tax (which, with a 5000 fee added on top of a 100000 supplier
    // cost, would be >= 105000).
    expect(body.flightOptions[0].sellingPriceMinor).toBe(99999)
  })
})
