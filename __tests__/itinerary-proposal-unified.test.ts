/**
 * Unified flight/hotel bookings on the client proposal, PDF, margin and mirror-sync.
 * Invariants: ONE card + ONE price per booking; no supplier data ever client-side.
 */
import React from 'react'
import {
  buildProposalFlight, buildProposalHotel, buildPortalFlight, buildPortalHotel, buildEmailFlightRows, buildVoucherFlightExtras, buildPdfFlight, buildBlobMarginRows, buildFlightMirrorRow,
} from '@/lib/itinerary/client-booking-dto'
import { sumClientTotals } from '@/lib/itinerary/unified-booking'
import { ItineraryPDF } from '@/lib/pdf/ItineraryPDF'

const seg = (from: string, to: string, no: string, date = '2026-12-01') => ({
  from, to, fromCity: from + ' City', airline: 'Qatar Airways', iataCode: 'QR', flightNumber: no,
  departureAt: `${date}T09:15:00`, arrivalAt: `${date}T17:40:00`, date, time: '09:15', arrivalTime: '17:40',
  cabin: 'Economy', baggage: '1 x 23kg',
})
const jr = (index: number, direction: 'outbound' | 'return' | 'leg', segs: ReturnType<typeof seg>[]) =>
  ({ index, direction, segments: segs, stops: segs.length - 1 })

const SECRETS = ['SUPPLIER_SECRET_ID', 'off_SECRET', 'pas_SECRET', 'RATEKEY_SECRET', 'HOTELCODE_SECRET', 'MARKUP_SECRET']
const unified = (over: Record<string, unknown> = {}) => ({
  id: 'b1', bookingKind: 'unified-flight', tripType: 'return',
  from: 'LHR', to: 'DOH', airline: 'Qatar Airways', iataCode: 'QR', flightNumber: 'QR1408',
  date: '2026-12-01', time: '09:15', arrivalTime: '17:40', class: 'Economy', pnr: 'ABC123',
  cost: 2353, supplierCost: 2241, status: 'Pending', notes: 'INTERNAL NOTE', supplierId: 'SUPPLIER_SECRET_ID',
  journeys: [jr(0, 'outbound', [seg('LHR', 'DOH', 'QR1408')]), jr(1, 'return', [seg('DOH', 'LHR', 'QR1407', '2026-12-10')])],
  pricing: { currency: 'GBP', supplierTotal: 2241, taxes: 99, markupPercent: 5, markupAmount: 112, clientTotal: 2353, source: 'MARKUP_SECRET' },
  offer: { provider: 'duffel', providerOfferId: 'off_SECRET', searchedAt: 'x', supplierCurrency: 'GBP', supplierTotal: 2241, refs: { passengerId: 'pas_SECRET' } },
  addedFrom: 'research',
  ...over,
})
const hotel = () => ({
  id: 'h1', bookingKind: 'research-hotel', name: 'Grand Hotel', location: 'Doha', checkIn: '2026-12-01', checkOut: '2026-12-05',
  roomType: 'Deluxe', nights: 4, cost: 900, supplierCost: 700, status: 'Pending', notes: 'INTERNAL', image: 'https://img/x.jpg',
  supplierId: 'SUPPLIER_SECRET_ID', stars: 5,
  rate: { providerHotelCode: 'HOTELCODE_SECRET', rateKey: 'RATEKEY_SECRET', roomName: 'Deluxe Room', boardName: 'Bed & Breakfast',
    breakfastIncluded: true, isRefundable: true, cancellationPolicy: 'Free until 1 Dec', cancellationDeadline: '2026-12-01',
    occupancy: { rooms: 1, adults: 2, children: 0 } },
  pricing: { currency: 'GBP', supplierTotal: 700, markupAmount: 200, clientTotal: 900, source: 'research' },
  offer: { provider: 'hotelbeds', providerOfferId: 'HOTELCODE_SECRET:RATEKEY_SECRET', searchedAt: 'x', supplierCurrency: 'GBP', supplierTotal: 700 },
  addedFrom: 'research',
})
const legacyLeg = (id: string, from: string, to: string, cost: number) => ({
  id, from, to, airline: 'BA', flightNumber: 'BA1', date: '2026-12-01', time: '10:00', arrivalTime: '12:00', class: 'Economy',
  pnr: 'PNR9', cost, supplierCost: cost - 50, stops: 0,
})

function assertNoSecrets(x: unknown) {
  const json = JSON.stringify(x)
  for (const k of ['supplierCost', 'supplierTotal', 'markup', 'taxes', 'pricing', 'offer', 'rateKey', 'supplierId', 'providerHotelCode', 'passenger', 'INTERNAL', 'iataCode', ...SECRETS]) {
    expect(json).not.toContain(k)
  }
  expect(json).not.toContain('2241')
  expect(json).not.toContain('"supplier')
}

// @react-pdf/renderer is ESM-only; stub primitives so the real ItineraryPDF tree can be walked.
jest.mock('@react-pdf/renderer', () => {
  const R = jest.requireActual('react')
  const box = (props: { children?: unknown }) => R.createElement(R.Fragment, null, props.children)
  return { Document: box, Page: box, Text: box, View: box, Image: () => null, StyleSheet: { create: (x: unknown) => x } }
})

describe('proposal DTO: unified flight', () => {
  it('return -> 2 journeys, ONE client price, no supplier data anywhere', () => {
    const dto = buildProposalFlight(unified(), { accepted: false })
    expect(dto.journeys).toHaveLength(2)
    expect(dto.journeys!.map(j => j.label)).toEqual(['OUTBOUND', 'RETURN'])
    expect(dto.journeys![1].segments[0].flightNumber).toBe('QR1407')
    expect(dto.clientPrice).toBe(2353)
    expect(dto.pnr).toBeUndefined()
    assertNoSecrets(dto)
    // price appears once (no per-segment price)
    expect(JSON.stringify(dto).match(/2353/g)).toHaveLength(1)
  })
  it('PNR only after acceptance', () => {
    expect(buildProposalFlight(unified(), { accepted: true }).pnr).toBe('ABC123')
  })
  it('connecting return + multi-city keep every segment and one price', () => {
    const conn = unified({
      journeys: [jr(0, 'outbound', [seg('LHR', 'IST', 'TK1'), seg('IST', 'LOS', 'TK2')]), jr(1, 'return', [seg('LOS', 'IST', 'TK3'), seg('IST', 'LHR', 'TK4')])],
    })
    const c = buildProposalFlight(conn, { accepted: false })
    expect(c.journeys!.map(j => j.segments.length)).toEqual([2, 2])
    expect(c.journeys![0].stops).toBe(1)
    expect(c.to).toBe('LOS')
    expect(c.clientPrice).toBe(2353)
    const multi = unified({
      tripType: 'multi-city',
      journeys: [jr(0, 'leg', [seg('LHR', 'DOH', 'A1')]), jr(1, 'leg', [seg('DOH', 'JFK', 'A2')]), jr(2, 'leg', [seg('JFK', 'LHR', 'A3')])],
    })
    const m = buildProposalFlight(multi, { accepted: false })
    expect(m.journeys!.map(j => j.label)).toEqual(['LEG 1', 'LEG 2', 'LEG 3'])
    expect(m.routeLabel).toBe('LHR → DOH → JFK → LHR')
    expect(m.clientPrice).toBe(2353)
    assertNoSecrets(m)
  })
  it('legacy row maps exactly as before', () => {
    const d = buildProposalFlight(legacyLeg('l1', 'LHR', 'DOH', 800), { accepted: false })
    expect(d.journeys).toBeUndefined()
    expect(d).toMatchObject({ from: 'LHR', to: 'DOH', departureTime: '10:00', clientPrice: 800, stops: 0 })
    expect(d.pnr).toBeUndefined()
    assertNoSecrets(d)
  })
})

describe('proposal DTO: research hotel', () => {
  it('exposes client-appropriate terms and one price; no supplier fields', () => {
    const d = buildProposalHotel(hotel())
    expect(d).toMatchObject({ name: 'Grand Hotel', roomType: 'Deluxe', mealPlan: 'Bed & Breakfast', isRefundable: true, clientPrice: 900, images: ['https://img/x.jpg'] })
    expect(d.guests).toEqual({ rooms: 1, adults: 2, children: 0 })
    assertNoSecrets(d)
  })
})

describe('totals count a unified booking once', () => {
  it('unified return = single price; legacy 2-row return still sums both', () => {
    expect(sumClientTotals([unified()])).toBe(2353)
    expect(sumClientTotals([legacyLeg('a', 'LHR', 'DOH', 800), legacyLeg('b', 'DOH', 'LHR', 750)])).toBe(1550)
    expect(sumClientTotals([unified(), legacyLeg('a', 'X', 'Y', 100), hotel()])).toBe(2353 + 100 + 900)
  })
})

describe('string costs (Jade) stay tolerated', () => {
  it('legacy string cost is still priced and summed; unified string cost too', () => {
    const l = { ...legacyLeg('s', 'A', 'B', 0), cost: '500' as unknown as number }
    expect(buildProposalFlight(l, { accepted: false }).clientPrice).toBe(500)
    expect(buildPdfFlight(l, { accepted: false }).cost).toBe(500)
    expect(sumClientTotals([l, legacyLeg('t', 'B', 'A', 100)])).toBe(600)
    expect(buildProposalFlight(unified({ cost: '2353' }), { accepted: false }).clientPrice).toBe(2353)
    expect(buildProposalHotel({ ...hotel(), cost: '900' }).clientPrice).toBe(900)
    expect(buildProposalFlight({ ...l, cost: 'abc' }, { accepted: false }).clientPrice).toBeUndefined()
  })
})

describe('portal / email / voucher', () => {
  it('portal DTO: both journeys, no price, no PNR, no supplier fields', () => {
    const d = buildPortalFlight(unified())
    expect(d.journeys).toHaveLength(2)
    expect(d.clientPrice).toBeUndefined()
    expect(d.pnr).toBeUndefined()
    assertNoSecrets(d)
    assertNoSecrets(buildPortalHotel(hotel()))
    expect(buildPortalHotel(hotel()).clientPrice).toBeUndefined()
    expect(buildPortalFlight(legacyLeg('l', 'A', 'B', 5))).toMatchObject({ from: 'A', to: 'B', departureTime: '10:00' })
  })
  it('email: unified return lists both legs, no price/supplier; legacy row as before', () => {
    const fd = (d?: string) => d ?? ''
    const html = buildEmailFlightRows(unified(), fd)
    for (const x of ['OUTBOUND', 'RETURN', 'QR1408', 'QR1407', 'LHR → DOH', 'DOH → LHR']) expect(html).toContain(x)
    assertNoSecrets(html)
    expect(html).not.toContain('2353')
    expect(buildEmailFlightRows(legacyLeg('l', 'A', 'B', 5), fd)).toContain('A → B')
  })
  it('voucher: unified adds all journeys; legacy adds nothing', () => {
    const v = buildVoucherFlightExtras(unified())
    expect(v.journeys).toHaveLength(2)
    assertNoSecrets(v)
    expect(buildVoucherFlightExtras(legacyLeg('l', 'A', 'B', 5))).toEqual({})
  })
})

// ── PDF ──────────────────────────────────────────────────────────────────────
function texts(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { node.forEach(n => texts(n, out)); return out }
  const el = node as React.ReactElement<{ children?: unknown }>
  if (typeof el.type === 'function') return texts((el.type as (p: unknown) => unknown)(el.props), out)
  return texts(el.props?.children, out)
}
const pdfProps = (flights: unknown[]) => ({
  referenceNumber: 'R1', title: 'T', currency: 'GBP', numberOfTravellers: 1, days: [], hotels: [], flights,
}) as unknown as Parameters<typeof ItineraryPDF>[0]

describe('PDF', () => {
  it('unified return: both legs in one card, price once, no supplier data', () => {
    const f = buildPdfFlight(unified(), { accepted: false })
    assertNoSecrets(f)
    const t = texts(ItineraryPDF(pdfProps([f]))).join('|')
    expect(t).toContain('OUTBOUND')
    expect(t).toContain('RETURN')
    expect(t).toContain('QR1408')
    expect(t).toContain('QR1407')
    expect(t.match(/2,353/g)).toHaveLength(1)
    expect(t).not.toContain('2241')
    expect(t).not.toContain('2,241')
  })
  it('legacy 2-row return renders each row with its own price', () => {
    const fl = [legacyLeg('a', 'LHR', 'DOH', 800), legacyLeg('b', 'DOH', 'LHR', 750)].map(l => buildPdfFlight(l, { accepted: false }))
    const t = texts(ItineraryPDF(pdfProps(fl))).join('|')
    expect(t).toContain('800')
    expect(t).toContain('750')
    expect(t).not.toContain('OUTBOUND')
  })
})

// ── Margin (JSON fallback) ───────────────────────────────────────────────────
describe('margin rows', () => {
  it('unified return counts cost and supplierCost once', () => {
    const rows = buildBlobMarginRows([{ category: 'flight', items: [unified()], descKey: 'airline' }])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ category: 'flight', client_price: 2353, supplier_cost: 2241 })
    expect(rows[0].description).toContain('LHR ⇄ DOH')
    const margin = rows.reduce((s, r) => s + (r.client_price ?? 0) - (r.supplier_cost ?? 0), 0)
    expect(margin).toBe(112)
  })
  it('legacy rows unchanged (one row each, airline description)', () => {
    const rows = buildBlobMarginRows([{ category: 'flight', items: [legacyLeg('a', 'A', 'B', 800), legacyLeg('b', 'B', 'A', 750)], descKey: 'airline' }])
    expect(rows.map(r => [r.description, r.client_price, r.supplier_cost])).toEqual([['BA', 800, 750], ['BA', 750, 700]])
  })
})

// ── Mirror rows ──────────────────────────────────────────────────────────────
describe('itinerary_flights mirror', () => {
  it('unified = ONE row keyed by row id, route from/to, cost once', () => {
    const rows = [unified()].map((f, i) => buildFlightMirrorRow('it1', f, i))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ external_id: 'b1', from: 'LHR', to: 'DOH', client_price: 2353, supplier_cost: 2241 })
  })
  it('multi-city mirror row spans first origin to final destination', () => {
    const r = buildFlightMirrorRow('it1', unified({ tripType: 'multi-city', journeys: [jr(0, 'leg', [seg('LHR', 'DOH', 'A')]), jr(1, 'leg', [seg('DOH', 'JFK', 'B')])] }), 0)
    expect(r).toMatchObject({ from: 'LHR', to: 'JFK' })
  })
  it('legacy row mapped as before', () => {
    expect(buildFlightMirrorRow('it1', legacyLeg('a', 'LHR', 'DOH', 800), 0)).toMatchObject({ external_id: 'a', from: 'LHR', to: 'DOH', client_price: 800, supplier_cost: 750 })
  })
})

// ── Route wiring (mocked prisma/supabase) ────────────────────────────────────
const mockItin: { current: Record<string, unknown> } = { current: {} }
const upserts: Array<{ table: string; rows: unknown[] }> = []
jest.mock('@/lib/db', () => ({ prisma: { itinerary: { findUnique: jest.fn(async () => mockItin.current) } } }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn(async () => ({ id: 'a' })) }))
jest.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      upsert: async (rows: unknown[]) => { upserts.push({ table, rows }); return { error: null } },
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
    }),
  }),
}))

describe('admin routes', () => {
  beforeEach(() => { upserts.length = 0 })
  const itinRow = (flights: unknown[]) => ({ id: 'it1', flights: JSON.stringify(flights), days: '[]', hotels: JSON.stringify([hotel()]), transfers: '[]', tours: '[]', trains: '[]', ferries: '[]' })

  it('margin GET (blob fallback): unified counted once alongside hotel', async () => {
    mockItin.current = itinRow([unified()])
    const { GET } = await import('@/app/api/admin/itineraries/[id]/margin/route')
    const res = await GET({} as never, { params: Promise.resolve({ id: 'it1' }) })
    const body = await res.json()
    expect(body.source).toBe('blobs')
    const flights = body.rows.filter((r: { category: string }) => r.category === 'flight')
    expect(flights).toHaveLength(1)
    expect(flights[0]).toMatchObject({ client_price: 2353, supplier_cost: 2241 })
  })
  it('sync POST: one mirror row for a unified booking; legacy legs stay separate', async () => {
    mockItin.current = itinRow([unified(), legacyLeg('l1', 'A', 'B', 10), legacyLeg('l2', 'B', 'A', 20)])
    const { POST } = await import('@/app/api/admin/itineraries/[id]/sync/route')
    await POST({} as never, { params: Promise.resolve({ id: 'it1' }) })
    const fl = upserts.find(u => u.table === 'itinerary_flights')!
    expect(fl.rows).toHaveLength(3)
    expect((fl.rows as Array<{ external_id: string }>).map(r => r.external_id)).toEqual(['b1', 'l1', 'l2'])
  })
})
