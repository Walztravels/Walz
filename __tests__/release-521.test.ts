// __tests__/release-521.test.ts
// Release 5.2.1 — Live Search Result Normalization + FX Regression Patch Tests
//
// Tests verify:
//   A. assignBadges — correct CHEAPEST / FASTEST / LUXURY logic
//   B. Grounding contract RULE 2/3 strengthened prohibitions
//   C. Flight grouping + FX boundary injected into execSearchFlights output

import { assignBadges } from '@/lib/flights/duffel'
import { buildGroundingContract, EMPTY_COMMERCIAL_FACTS } from '@/lib/jade/commercial-grounding'
import type { FlightItinerary } from '@/lib/flights/types'
import fs from 'fs'
import path from 'path'

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8')
}

// ── Minimal FlightItinerary stub ──────────────────────────────────────────────

function makeItinerary(overrides: Partial<FlightItinerary> & { total: number; durationMins: number }): FlightItinerary {
  return {
    id:            overrides.id ?? 'offer_x',
    segments:      overrides.segments ?? [],
    stops:         overrides.stops ?? 0,
    totalDuration: overrides.durationMins,
    layovers:      [],
    price: {
      total:     overrides.total,
      base:      overrides.total,
      taxes:     0,
      currency:  'GBP',
      perPerson: overrides.total,
    },
    fareType:   overrides.fareType   ?? 'standard',
    refundable: false,
    changeable: false,
    baggageInfo: { cabin: '1× carry-on', checked: 'Not included', included: false },
    badge:      overrides.badge,
    badgeLabel: overrides.badgeLabel,
  }
}

// ── A. assignBadges ────────────────────────────────────────────────────────────

describe('A1 — assignBadges: cheapest badge assigned to lowest price', () => {
  it('marks the cheapest offer as CHEAPEST', () => {
    const results = assignBadges([
      makeItinerary({ id: 'a', total: 800, durationMins: 420 }),
      makeItinerary({ id: 'b', total: 1100, durationMins: 390 }),
      makeItinerary({ id: 'c', total: 950,  durationMins: 410 }),
    ])
    const cheapest = results.find(r => r.id === 'a')
    expect(cheapest?.badge).toBe('cheapest')
    expect(cheapest?.badgeLabel).toBe('Cheapest')
  })
})

describe('A2 — assignBadges: cheapest badge assigned only once', () => {
  it('only the first cheapest gets the badge when prices tie', () => {
    const results = assignBadges([
      makeItinerary({ id: 'a', total: 800, durationMins: 420 }),
      makeItinerary({ id: 'b', total: 800, durationMins: 410 }),
    ])
    const badged = results.filter(r => r.badge === 'cheapest')
    expect(badged).toHaveLength(1)
  })
})

describe('A3 — assignBadges: fastest badge assigned when uniquely held', () => {
  it('marks the uniquely-fastest offer as FASTEST', () => {
    const results = assignBadges([
      makeItinerary({ id: 'a', total: 800, durationMins: 420 }),
      makeItinerary({ id: 'b', total: 900, durationMins: 360 }),  // unique fastest
      makeItinerary({ id: 'c', total: 950, durationMins: 400 }),
    ])
    const fastest = results.find(r => r.id === 'b')
    expect(fastest?.badge).toBe('fastest')
    expect(fastest?.badgeLabel).toBe('Fastest')
  })
})

describe('A4 — assignBadges: fastest badge NOT assigned on duration tie', () => {
  it('omits FASTEST when two results share the minimum duration', () => {
    const results = assignBadges([
      makeItinerary({ id: 'a', total: 800, durationMins: 360 }),
      makeItinerary({ id: 'b', total: 900, durationMins: 360 }),  // tie — no FASTEST
      makeItinerary({ id: 'c', total: 950, durationMins: 420 }),
    ])
    const fastestBadged = results.filter(r => r.badge === 'fastest')
    expect(fastestBadged).toHaveLength(0)
  })
})

describe('A5 — assignBadges: luxury badge at ≥2.5× cheapest with business cabin', () => {
  it('marks a business-class result at 2.5× cheapest as luxury', () => {
    const results = assignBadges([
      makeItinerary({ id: 'eco', total: 800,  durationMins: 420, fareType: 'standard' }),
      makeItinerary({ id: 'biz', total: 2000, durationMins: 420, fareType: 'business' }),
    ])
    const luxury = results.find(r => r.id === 'biz')
    expect(luxury?.badge).toBe('luxury')
    expect(luxury?.badgeLabel).toBe('Business Class')
  })

  it('does NOT mark economy results as luxury even at high price', () => {
    const results = assignBadges([
      makeItinerary({ id: 'eco',    total: 800,  durationMins: 420, fareType: 'standard' }),
      makeItinerary({ id: 'pricey', total: 2001, durationMins: 420, fareType: 'standard' }),
    ])
    const pricey = results.find(r => r.id === 'pricey')
    expect(pricey?.badge).not.toBe('luxury')
  })
})

describe('A6 — assignBadges: RECOMMENDED badge never assigned', () => {
  it('does not assign recommended to any result', () => {
    const results = assignBadges([
      makeItinerary({ id: 'a', total: 800,  durationMins: 420 }),
      makeItinerary({ id: 'b', total: 950,  durationMins: 390 }),
      makeItinerary({ id: 'c', total: 1100, durationMins: 410 }),
    ])
    const recommended = results.filter(r => r.badge === 'recommended')
    expect(recommended).toHaveLength(0)
  })
})

// ── B. Grounding contract RULE 2/3 strengthened ───────────────────────────────

describe('B7 — Grounding contract: FX_CONVERSION_ALLOWED=false flag present', () => {
  it('contract contains the FX_CONVERSION_ALLOWED=false flag', () => {
    const contract = buildGroundingContract(EMPTY_COMMERCIAL_FACTS)
    expect(contract).toContain('FX_CONVERSION_ALLOWED=false')
  })

  it('contract states the flag applies by default, not just when a tool returns it', () => {
    const contract = buildGroundingContract(EMPTY_COMMERCIAL_FACTS)
    expect(contract).toContain('FX_CONVERSION_ALLOWED=false by default')
  })
})

describe('B8 — Grounding contract: approximate CAD notation explicitly prohibited', () => {
  it('contract prohibits "~CAD X" pattern', () => {
    const contract = buildGroundingContract(EMPTY_COMMERCIAL_FACTS)
    expect(contract).toContain('"~CAD X"')
  })

  it('contract prohibits "approximately CAD X" and "about CAD X" patterns', () => {
    const contract = buildGroundingContract(EMPTY_COMMERCIAL_FACTS)
    expect(contract).toContain('"approximately CAD X"')
    expect(contract).toContain('"about CAD X"')
  })
})

describe('B9 — Grounding contract RULE 3: cross-currency budget language prohibited', () => {
  it('contract prohibits "leaves you X remaining"', () => {
    const contract = buildGroundingContract(EMPTY_COMMERCIAL_FACTS)
    expect(contract).toContain('"leaves you X remaining"')
  })

  it('contract prohibits "you\'ve spent X%" cross-currency comparison', () => {
    const contract = buildGroundingContract(EMPTY_COMMERCIAL_FACTS)
    expect(contract).toContain("you've spent X%")
  })

  it('contract provides the correct multi-currency budget display template', () => {
    const contract = buildGroundingContract(EMPTY_COMMERCIAL_FACTS)
    expect(contract).toContain('Your trip so far:')
    expect(contract).toContain("I'll keep GBP and CAD separate")
  })
})

// ── C. Flight grouping + FX boundary (source-level) ──────────────────────────

describe('C10 — execSearchFlights: flight grouping by physical itinerary', () => {
  it('search-tools.ts contains the segment-based grouping key', () => {
    const source = readSource('lib/jade/search-tools.ts')
    expect(source).toContain('flightNumber')
    expect(source).toContain('departureTime')
    expect(source).toContain('groupBest')
  })

  it('search-tools.ts keeps the cheapest offer per physical flight group', () => {
    const source = readSource('lib/jade/search-tools.ts')
    expect(source).toContain('flight.price.total < existing.price.total')
  })
})

describe('C11 — execSearchFlights: FX boundary injected into tool result', () => {
  it('search-tools.ts injects fx_boundary into the flight search result', () => {
    const source = readSource('lib/jade/search-tools.ts')
    expect(source).toContain('fx_boundary')
    expect(source).toContain('FX_CONVERSION_ALLOWED: false')
  })

  it('search-tools.ts fx_boundary note contains DO_NOT_CONVERT instruction', () => {
    const source = readSource('lib/jade/search-tools.ts')
    expect(source).toContain('DO_NOT_CONVERT')
  })
})

describe('C12 — duffel.ts: assignBadges returns empty result unchanged', () => {
  it('returns empty array immediately when given no results', () => {
    const result = assignBadges([])
    expect(result).toEqual([])
  })

  it('single result gets cheapest badge and no fastest (only 1 item)', () => {
    const result = assignBadges([
      makeItinerary({ id: 'only', total: 500, durationMins: 300 }),
    ])
    // Single result is cheapest; fastest is also that result but it's uniquely held
    const r = result[0]
    // Cheapest takes priority over fastest in the current ordering
    expect(r.badge).toBe('cheapest')
    expect(r.badgeLabel).toBe('Cheapest')
  })
})
