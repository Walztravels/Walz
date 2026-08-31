/**
 * Release 7.3 — cross-sell event wiring tests
 *
 * Source-level checks verifying that:
 *  1. cross_sell_clicked is wired in TripRecommendations.tsx
 *  2. jade_cross_sell_eligible fires in recommendations.ts
 *  3. jade_cross_sell_offered fires in recommendations.ts
 *  4. getSmartRecommendations does not leak supplier net prices
 *  5. trip-context route imports / calls getSmartRecommendations
 *  6. RecommendationType union is unchanged (no new types)
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

const tripRecs   = readSource('components/trips/TripRecommendations.tsx')
const jadeSrc    = readSource('lib/jade/recommendations.ts')
const routeSrc   = readSource('app/api/jade/trip-context/route.ts')

// ── 1. cross_sell_clicked ─────────────────────────────────────────────────────

test('TripRecommendations fires cross_sell_clicked on CTA click', () => {
  expect(tripRecs).toContain("'cross_sell_clicked'")
})

test('TripRecommendations sends cross_sell_clicked via /api/commercial/event', () => {
  expect(tripRecs).toContain('/api/commercial/event')
  expect(tripRecs).toContain('cross_sell_clicked')
})

// ── 2. jade_cross_sell_eligible ───────────────────────────────────────────────

test('recommendations.ts fires jade_cross_sell_eligible', () => {
  expect(jadeSrc).toContain("'jade_cross_sell_eligible'")
})

test('jade_cross_sell_eligible includes candidateCount in metadata', () => {
  expect(jadeSrc).toContain('candidateCount')
})

// ── 3. jade_cross_sell_offered ────────────────────────────────────────────────

test('recommendations.ts fires jade_cross_sell_offered', () => {
  expect(jadeSrc).toContain("'jade_cross_sell_offered'")
})

test('jade_cross_sell_offered includes offeredCount in metadata', () => {
  expect(jadeSrc).toContain('offeredCount')
})

// ── 4. No supplier net price leakage ─────────────────────────────────────────

test('getSmartRecommendations output does not reference netRate', () => {
  // Ensure the word "netRate" does not appear anywhere in the recommendations module
  expect(jadeSrc).not.toMatch(/netRate/)
})

test('getSmartRecommendations output does not reference margin', () => {
  // Ensure the word "margin" does not appear anywhere in the recommendations module
  expect(jadeSrc).not.toMatch(/\bmargin\b/)
})

// ── 5. trip-context route integrates getSmartRecommendations ─────────────────

test('trip-context route imports getSmartRecommendations', () => {
  expect(routeSrc).toContain('getSmartRecommendations')
  expect(routeSrc).toContain("from '@/lib/jade/recommendations'")
})

test('trip-context route calls getSmartRecommendations', () => {
  // Verify it is called, not just imported
  const importLine = routeSrc.indexOf("from '@/lib/jade/recommendations'")
  const callLine   = routeSrc.indexOf('getSmartRecommendations(')
  expect(callLine).toBeGreaterThan(importLine)
})

// ── 6. RecommendationType union is unchanged ──────────────────────────────────

test('RecommendationType union contains exactly the five approved types', () => {
  // Extract the union from the jade recommendations source (no trailing semicolon required)
  const unionMatch = jadeSrc.match(/export type RecommendationType\s*=\s*([^\n]+)/)
  expect(unionMatch).not.toBeNull()
  const union = unionMatch![1]
  const types = union.match(/'([A-Z_]+)'/g)!.map(s => s.replace(/'/g, ''))
  expect(types.sort()).toEqual(['ACTIVITY', 'ESIM', 'FLIGHT', 'HOTEL', 'TRANSFER'])
})
