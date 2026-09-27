/**
 * @jest-environment jsdom
 *
 * QUOTE BUILDER V1.4 (Agent A — search UI). FlightResultCard's stops/
 * connections and multi-city presentation, rendered for real (same
 * createRoot/act pattern as itinerary-portal-flightcard.test.tsx) against
 * fixtures built to the EXACT NormalizedFlightOffer/NormalizedFlightJourney
 * shape in lib/travel-search/types.ts.
 *
 * Deterministic departure-hour math (not exercised directly here, but kept
 * consistent with the sibling filters test) — force UTC before any Date use.
 */
process.env.TZ = 'UTC'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { FlightResultCard } from '@/app/admin/inbox/components/quote-builder/desktop/cards/FlightResultCard'
import type { NormalizedFlightOffer, NormalizedFlightSegment, NormalizedFlightJourney } from '@/lib/travel-search/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let segOrder = 0
function seg(from: string, to: string, dep: string, arr: string): NormalizedFlightSegment {
  segOrder += 1
  return {
    segmentOrder: segOrder, originCode: from, originCity: null, originTerminal: null,
    destinationCode: to, destinationCity: null, destinationTerminal: null,
    departureAt: dep, arrivalAt: arr, flightNumber: `QR${segOrder}`, operatingCarrier: 'QR',
    marketingCarrier: 'QR', aircraft: null, durationMinutes: null, stops: 0, layoverMinutes: null,
  }
}

function journey(direction: NormalizedFlightJourney['direction'], segments: NormalizedFlightSegment[]): NormalizedFlightJourney {
  return { direction, segments, stops: Math.max(0, segments.length - 1), durationMinutes: null }
}

function offer(tripType: NormalizedFlightOffer['tripType'], journeys: NormalizedFlightJourney[]): NormalizedFlightOffer {
  return {
    provider: 'duffel', providerOfferId: 'off_1', searchedAt: '2026-01-01T00:00:00Z',
    airline: 'Qatar Airways', airlineCode: 'QR', tripType, cabinClass: 'ECONOMY',
    supplierCurrency: 'USD', supplierTotalAmount: 1000, supplierTotalMinor: 100000,
    offerExpiresAt: null, isRefundable: false, isChangeable: false, changeFee: null, noShowRule: null,
    fareClass: null, fareFamily: null, personalItem: null, cabinBaggage: null, checkedBaggage: null,
    checkedPieces: null, checkedWeight: null, seatIncluded: false, mealIncluded: false, seatsLeft: null,
    segments: journeys[0]?.segments ?? [],
    returnSegments: journeys[1]?.direction === 'return' ? journeys[1].segments : [],
    journeys,
  }
}

function render(o: NormalizedFlightOffer): string {
  const el = document.createElement('div')
  act(() => { createRoot(el).render(<FlightResultCard offer={o} onSelect={() => {}} />) })
  return el.innerHTML
}

describe('FlightResultCard — per-journey stops/connections from journeys[] (never the flattened segments.length - 1)', () => {
  it('one-way, non-stop journey: shows DIRECT, no OUTBOUND/RETURN/JOURNEY headers', () => {
    segOrder = 0
    const o = offer('one-way', [journey('outbound', [seg('LOS', 'DXB', '2026-12-01T09:00:00Z', '2026-12-01T13:00:00Z')])])
    const h = render(o)
    expect(h).toContain('DIRECT')
    expect(h).toContain('LOS')
    expect(h).toContain('DXB')
    for (const x of ['OUTBOUND', 'RETURN', 'JOURNEY', '1 STOP', '2 STOPS']) expect(h).not.toContain(x)
  })

  it('one-way, 1-stop journey: shows 1 STOP and the connection airport', () => {
    segOrder = 0
    const o = offer('one-way', [journey('outbound', [
      seg('LOS', 'ADD', '2026-12-01T09:00:00Z', '2026-12-01T14:00:00Z'),
      seg('ADD', 'DXB', '2026-12-01T16:00:00Z', '2026-12-01T20:00:00Z'),
    ])])
    const h = render(o)
    expect(h).toContain('1 STOP')
    expect(h).not.toContain('2 STOPS')
    // Route line shows every endpoint, including the connection airport.
    expect(h).toContain('LOS → ADD → DXB')
  })

  it('one-way, 2-stop journey: shows 2 STOPS', () => {
    segOrder = 0
    const o = offer('one-way', [journey('outbound', [
      seg('LOS', 'ADD', '2026-12-01T09:00:00Z', '2026-12-01T12:00:00Z'),
      seg('ADD', 'CAI', '2026-12-01T14:00:00Z', '2026-12-01T17:00:00Z'),
      seg('CAI', 'DXB', '2026-12-01T19:00:00Z', '2026-12-01T22:00:00Z'),
    ])])
    const h = render(o)
    expect(h).toContain('2 STOPS')
    expect(h).toContain('LOS → ADD → CAI → DXB')
  })

  it('round-trip: shows OUTBOUND and RETURN, each with its own stop label; a connecting outbound does not inflate the return', () => {
    segOrder = 0
    const out = journey('outbound', [
      seg('LOS', 'ADD', '2026-12-01T09:00:00Z', '2026-12-01T14:00:00Z'),
      seg('ADD', 'DXB', '2026-12-01T16:00:00Z', '2026-12-01T20:00:00Z'),
    ])
    const ret = journey('return', [seg('DXB', 'LOS', '2026-12-08T09:00:00Z', '2026-12-08T15:00:00Z')])
    const o = offer('round-trip', [out, ret])
    const h = render(o)
    expect(h).toContain('OUTBOUND')
    expect(h).toContain('RETURN')
    expect(h).not.toContain('MULTI-CITY')
    expect(h).not.toContain('JOURNEY 1')
    // Outbound's 1 stop must not leak onto the return line.
    const outIdx = h.indexOf('OUTBOUND')
    const retIdx = h.indexOf('RETURN')
    expect(h.slice(outIdx, retIdx)).toContain('1 STOP')
    expect(h.slice(retIdx)).toContain('DIRECT')
    expect(h.slice(retIdx)).not.toContain('1 STOP')
  })

  it('multi-city: MULTI-CITY · N JOURNEYS header, JOURNEY 1/2/3 rows, connections stay nested inside their own journey', () => {
    segOrder = 0
    const j1 = journey('outbound', [seg('LOS', 'DXB', '2026-09-27T09:00:00Z', '2026-09-27T18:00:00Z')])
    const j2 = journey('leg', [
      seg('DXB', 'IST', '2026-10-03T09:00:00Z', '2026-10-03T13:00:00Z'),
      seg('IST', 'JFK', '2026-10-03T15:00:00Z', '2026-10-03T22:00:00Z'),
    ])
    const j3 = journey('leg', [seg('JFK', 'LOS', '2026-10-10T09:00:00Z', '2026-10-10T16:00:00Z')])
    const o = offer('multi-city', [j1, j2, j3])
    const h = render(o)
    expect(h).toContain('MULTI-CITY · 3 JOURNEYS')
    expect(h).toContain('JOURNEY 1')
    expect(h).toContain('JOURNEY 2')
    expect(h).toContain('JOURNEY 3')

    const j1Idx = h.indexOf('JOURNEY 1')
    const j2Idx = h.indexOf('JOURNEY 2')
    const j3Idx = h.indexOf('JOURNEY 3')
    expect(j1Idx).toBeLessThan(j2Idx)
    expect(j2Idx).toBeLessThan(j3Idx)

    // IST (journey 2's connection) appears only within journey 2's block —
    // never hoisted before JOURNEY 2 or dangling after JOURNEY 3.
    expect(h.slice(0, j2Idx)).not.toContain('IST')
    expect(h.slice(j2Idx, j3Idx)).toContain('IST')
    expect(h.slice(j3Idx)).not.toContain('IST')

    // Exactly one price and one action for the whole multi-city offer.
    expect((h.match(/Select &amp; price|Select &.*price/g) ?? []).length).toBe(1)
  })
})
