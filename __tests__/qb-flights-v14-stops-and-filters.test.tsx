/**
 * @jest-environment jsdom
 *
 * QUOTE BUILDER V1.4 (Agent A — search UI):
 *  1. The STOPS search-form control (desktop + mobile FlightPanel.tsx) —
 *     renders, defaults to 'any', and each button updates state.flStops via
 *     the exact values the route's STOPS_MAP expects ('any' | 'direct' |
 *     'max-1-stop' | 'max-2-stops').
 *  2. The client-side RESULT filters (Stops / Airline / Departure) that
 *     narrow the already-returned flightResults array in-memory.
 *
 * Real rendering throughout (createRoot/act, same pattern as
 * itinerary-portal-flightcard.test.tsx) — FlightPanel's prop surface is a
 * big QuoteBuilderState object, so the fixture below only fills the fields
 * FlightPanel.tsx (and, transitively, MultiCityMobileCards.tsx for the
 * multi-city branch) actually reads; every field is a plain value or a
 * jest.fn(), cast to QuoteBuilderState since implementing the full ~80-key
 * hook return shape here would test nothing extra.
 *
 * Departure-bucket fixtures deliberately avoid hardcoded 'Z'-suffixed ISO
 * strings: the app buckets by `new Date(iso).getHours()` (LOCAL hour), so a
 * fixed UTC string would only land in the intended bucket under whatever
 * timezone happens to run the test. `localHourIso` instead builds each
 * Date from local components (year, month, day, hour), which always
 * round-trips back through `.getHours()` to the same hour regardless of
 * the runtime's timezone.
 */

import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { FlightPanel as DesktopFlightPanel } from '@/app/admin/inbox/components/quote-builder/desktop/panels/FlightPanel'
import { FlightPanel as MobileFlightPanel } from '@/app/admin/inbox/components/quote-builder/mobile/panels/FlightPanel'
import type { QuoteBuilderState, FlLeg } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
import type { NormalizedFlightOffer, NormalizedFlightSegment, NormalizedFlightJourney } from '@/lib/travel-search/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function emptyLeg(): FlLeg { return { from: '', fromCode: '', to: '', toCode: '', depart: '', fromSug: [], toSug: [] } }

function makeState(overrides: Record<string, unknown> = {}): QuoteBuilderState {
  return {
    flTrip: 'one-way', setFlTrip: jest.fn(),
    flFromQuery: '', flFrom: '', flFromSug: [],
    flToQuery: '', flTo: '', flToSug: [],
    flDepart: '', setFlDepart: jest.fn(),
    flReturn: '', setFlReturn: jest.fn(),
    flCabin: 'economy', setFlCabin: jest.fn(),
    flStops: 'any', setFlStops: jest.fn(),
    flAdults: 1, setFlAdults: jest.fn(),
    onFlFromChange: jest.fn(), onFlToChange: jest.fn(),
    selectFlFrom: jest.fn(), selectFlTo: jest.fn(),
    mcLegs: [emptyLeg(), emptyLeg()],
    updateMcLeg: jest.fn(), addMcLeg: jest.fn(), removeMcLeg: jest.fn(),
    onMcFromChange: jest.fn(), onMcToChange: jest.fn(), selectMcFrom: jest.fn(), selectMcTo: jest.fn(),
    flightResults: [],
    searchFlightsLive: jest.fn(async () => {}),
    liveSearching: false, liveError: null,
    openPending: jest.fn(),
    ...overrides,
  } as unknown as QuoteBuilderState
}

let root: Root | null = null
let container: HTMLDivElement | null = null
function renderInto(node: React.ReactElement): HTMLDivElement {
  container = document.createElement('div')
  act(() => { root = createRoot(container!); root.render(node) })
  return container
}
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null; container = null
})

function findButtonByText(el: HTMLElement, text: string): HTMLButtonElement {
  const btn = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.trim() === text)
  if (!btn) throw new Error(`button "${text}" not found`)
  return btn as HTMLButtonElement
}
function click(btn: HTMLButtonElement) {
  act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}
function setSelect(el: HTMLElement, id: string, value: string) {
  const select = el.querySelector(`#${id}`) as HTMLSelectElement
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
  act(() => { setter.call(select, value); select.dispatchEvent(new Event('change', { bubbles: true })) })
}
// Scoped to the results list only — the Airline filter's own <select>
// legitimately lists every distinct airline regardless of the current
// filter selection, so asserting against the whole panel's textContent
// would see those <option> labels too. The results <ul> is the only <ul>
// FlightPanel renders.
function resultsText(el: HTMLElement): string {
  return el.querySelector('ul')?.textContent ?? ''
}

describe('STOPS search-form control — desktop FlightPanel', () => {
  it('renders all four options and defaults to Any', () => {
    const el = renderInto(<DesktopFlightPanel state={makeState()} />)
    for (const label of ['Any', 'Direct', 'Max 1 Stop', 'Max 2 Stops']) findButtonByText(el, label)
    expect(findButtonByText(el, 'Any').getAttribute('aria-pressed')).toBe('true')
    expect(findButtonByText(el, 'Direct').getAttribute('aria-pressed')).toBe('false')
  })

  it.each([
    ['Direct', 'direct'],
    ['Max 1 Stop', 'max-1-stop'],
    ['Max 2 Stops', 'max-2-stops'],
  ])('selecting "%s" calls setFlStops("%s")', (label, value) => {
    const setFlStops = jest.fn()
    const el = renderInto(<DesktopFlightPanel state={makeState({ setFlStops })} />)
    click(findButtonByText(el, label))
    expect(setFlStops).toHaveBeenCalledWith(value)
  })
})

describe('STOPS search-form control — mobile FlightPanel', () => {
  const mobileProps = { screen: 'search' as const, onSearched: jest.fn(), onEditSearch: jest.fn() }

  it('renders all four options and defaults to Any', () => {
    const el = renderInto(<MobileFlightPanel state={makeState()} {...mobileProps} />)
    for (const label of ['Any', 'Direct', 'Max 1 Stop', 'Max 2 Stops']) findButtonByText(el, label)
    expect(findButtonByText(el, 'Any').getAttribute('aria-pressed')).toBe('true')
  })

  it.each([
    ['Direct', 'direct'],
    ['Max 1 Stop', 'max-1-stop'],
    ['Max 2 Stops', 'max-2-stops'],
  ])('selecting "%s" calls setFlStops("%s")', (label, value) => {
    const setFlStops = jest.fn()
    const el = renderInto(<MobileFlightPanel state={makeState({ setFlStops })} {...mobileProps} />)
    click(findButtonByText(el, label))
    expect(setFlStops).toHaveBeenCalledWith(value)
  })
})

// ── Result filters ──────────────────────────────────────────────────────
let segOrder = 0
function seg(from: string, to: string, dep: string, arr: string): NormalizedFlightSegment {
  segOrder += 1
  return {
    segmentOrder: segOrder, originCode: from, originCity: null, originTerminal: null,
    destinationCode: to, destinationCity: null, destinationTerminal: null,
    departureAt: dep, arrivalAt: arr, flightNumber: `X${segOrder}`, operatingCarrier: 'X',
    marketingCarrier: 'X', aircraft: null, durationMinutes: null, stops: 0, layoverMinutes: null,
  }
}
function oneWayOffer(airline: string, segments: NormalizedFlightSegment[]): NormalizedFlightOffer {
  const j: NormalizedFlightJourney = { direction: 'outbound', segments, stops: Math.max(0, segments.length - 1), durationMinutes: null }
  return {
    provider: 'duffel', providerOfferId: `off_${airline}`, searchedAt: '2026-01-01T00:00:00Z',
    airline, airlineCode: null, tripType: 'one-way', cabinClass: 'ECONOMY',
    supplierCurrency: 'USD', supplierTotalAmount: 500, supplierTotalMinor: 50000,
    offerExpiresAt: null, isRefundable: false, isChangeable: false, changeFee: null, noShowRule: null,
    fareClass: null, fareFamily: null, personalItem: null, cabinBaggage: null, checkedBaggage: null,
    checkedPieces: null, checkedWeight: null, seatIncluded: false, mealIncluded: false, seatsLeft: null,
    segments, returnSegments: [], journeys: [j],
  }
}

// Built from LOCAL date components (never a fixed 'Z' string) so the
// resulting instant always reads back as `hour` via `new Date(iso).getHours()`
// — the exact call the app's departureBucket() makes — regardless of which
// timezone actually runs the test.
function localHourIso(hour: number, dayOffset = 0): string {
  return new Date(2026, 11, 1 + dayOffset, hour, 0, 0).toISOString()
}

// Qatar Airways: direct, departs 06:00 local (morning).
// Emirates: 1 stop, departs 14:00 local (afternoon).
// British Airways: 2 stops, departs 22:00 local (night).
function buildFilterFixtures(): NormalizedFlightOffer[] {
  segOrder = 0
  const qatar = oneWayOffer('Qatar Airways', [seg('LOS', 'DXB', localHourIso(6), localHourIso(10))])
  const emirates = oneWayOffer('Emirates', [
    seg('LOS', 'ADD', localHourIso(14), localHourIso(17)),
    seg('ADD', 'DXB', localHourIso(18), localHourIso(20)),
  ])
  const ba = oneWayOffer('British Airways', [
    seg('LOS', 'ADD', localHourIso(22), localHourIso(23)),
    seg('ADD', 'CAI', localHourIso(1, 1), localHourIso(3, 1)),
    seg('CAI', 'DXB', localHourIso(5, 1), localHourIso(7, 1)),
  ])
  return [qatar, emirates, ba]
}

describe('Result filters — desktop FlightPanel (client-side, in-memory)', () => {
  it('defaults to showing every returned offer', () => {
    const el = renderInto(<DesktopFlightPanel state={makeState({ flightResults: buildFilterFixtures() })} />)
    for (const name of ['Qatar Airways', 'Emirates', 'British Airways']) expect(el.textContent).toContain(name)
  })

  it('Stops=Direct narrows to the non-stop offer only', () => {
    const el = renderInto(<DesktopFlightPanel state={makeState({ flightResults: buildFilterFixtures() })} />)
    setSelect(el, 'dw-fl-filter-stops', 'direct')
    expect(resultsText(el)).toContain('Qatar Airways')
    expect(resultsText(el)).not.toContain('Emirates')
    expect(resultsText(el)).not.toContain('British Airways')
  })

  it('Stops=2+ narrows to the worst-journey 2-stop offer only', () => {
    const el = renderInto(<DesktopFlightPanel state={makeState({ flightResults: buildFilterFixtures() })} />)
    setSelect(el, 'dw-fl-filter-stops', '2+')
    expect(resultsText(el)).toContain('British Airways')
    expect(resultsText(el)).not.toContain('Qatar Airways')
    expect(resultsText(el)).not.toContain('Emirates')
  })

  it('Airline=Emirates narrows to that airline only', () => {
    const el = renderInto(<DesktopFlightPanel state={makeState({ flightResults: buildFilterFixtures() })} />)
    setSelect(el, 'dw-fl-filter-airline', 'Emirates')
    expect(resultsText(el)).toContain('Emirates')
    expect(resultsText(el)).not.toContain('Qatar Airways')
    expect(resultsText(el)).not.toContain('British Airways')
  })

  it('Departure=afternoon (12:00-17:00) narrows to the 14:00Z offer only', () => {
    const el = renderInto(<DesktopFlightPanel state={makeState({ flightResults: buildFilterFixtures() })} />)
    setSelect(el, 'dw-fl-filter-departure', 'afternoon')
    expect(resultsText(el)).toContain('Emirates')
    expect(resultsText(el)).not.toContain('Qatar Airways')
    expect(resultsText(el)).not.toContain('British Airways')
  })

  it('Departure=night (>=21:00) narrows to the 22:00Z offer only', () => {
    const el = renderInto(<DesktopFlightPanel state={makeState({ flightResults: buildFilterFixtures() })} />)
    setSelect(el, 'dw-fl-filter-departure', 'night')
    expect(resultsText(el)).toContain('British Airways')
    expect(resultsText(el)).not.toContain('Qatar Airways')
    expect(resultsText(el)).not.toContain('Emirates')
  })

  it('a combination that matches nothing shows the "no match" message, not a stale list', () => {
    const el = renderInto(<DesktopFlightPanel state={makeState({ flightResults: buildFilterFixtures() })} />)
    setSelect(el, 'dw-fl-filter-stops', 'direct')
    setSelect(el, 'dw-fl-filter-airline', 'Emirates')
    expect(el.textContent).toContain('No flights match the selected filters.')
  })
})
