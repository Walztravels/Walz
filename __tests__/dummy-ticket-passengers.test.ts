/**
 * P1 — Dummy Ticket multiple passengers. Covers the shared passenger contract,
 * the API (live + manual), Duffel/Amadeus search counts, the PDF tree and the UI
 * wiring. All suppliers are mocked: no network, no real booking, no DB.
 */
import fs from 'fs'
import path from 'path'
import React from 'react'

const mockGetSession = jest.fn()
const mockDuffelPost = jest.fn()
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: (...a: unknown[]) => mockGetSession(...a) }))
jest.mock('@/lib/rate-limit', () => ({ duffelTicketRateLimit: () => ({ allowed: true, resetAt: 0 }) }))
jest.mock('@/lib/duffel/client', () => ({ duffelPost: (...a: unknown[]) => mockDuffelPost(...a) }))
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    visaApplication: { findUnique: jest.fn(async () => null) },
    generatedTicket: { create: jest.fn(async () => ({})) },
  },
}))
jest.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'https://x/y.pdf' } }) }) },
    from: () => ({ insert: async () => ({}) }),
  }),
}))
jest.mock('@/lib/hotelbeds', () => ({ hotelbedsRequest: jest.fn() }))
jest.mock('@/lib/intelligence/case-events', () => ({ recordCaseEvent: jest.fn(async () => undefined) }))
jest.mock('@react-pdf/renderer', () => {
  const R = jest.requireActual('react')
  // Host-element stubs keep props (e.g. wrap) so the tree structure can be asserted.
  const host = (name: string) => (props: { children?: unknown }) => R.createElement(name, props, props.children)
  return {
    Document: host('Document'), Page: host('Page'), Text: host('Text'), View: host('View'), Svg: host('Svg'), Rect: () => null, Image: () => null,
    StyleSheet: { create: (x: unknown) => x },
    renderToBuffer: async () => Buffer.from('pdf'),
  }
})

import {
  normalizePassengers, buildPassengersPayload, toDuffelPassengers, countPassengers,
} from '@/lib/dummy-ticket/passengers'
import { POST } from '@/app/api/admin/intelligence/dummy-ticket/route'
import { TicketPDFDocument } from '@/components/admin/TicketPDF'
import prisma from '@/lib/db'

// The route races supplier calls against long timeouts; unref them so jest can exit.
const realSetTimeout = global.setTimeout
jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...a: unknown[]) => {
  const t = realSetTimeout(fn, ms, ...a) as unknown as { unref?: () => void }
  t.unref?.()
  return t
}) as unknown as typeof setTimeout)

const ROOT = path.join(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// ─── normalizePassengers ─────────────────────────────────────────────────────
describe('normalizePassengers', () => {
  it('legacy single-passenger request → one-element array', () => {
    const r = normalizePassengers({ clientName: '  Ada   Obi ', clientTitle: 'mrs', passportNumber: 'a123' })
    expect(r.passengers).toEqual([{ name: 'Ada Obi', type: 'Adult', title: 'MRS', passport: 'A123' }])
    expect(r.counts).toEqual({ adults: 1, children: 0, infants: 0 })
  })
  it('legacy with nothing keeps today\'s PASSENGER NAME fallback; gender default title', () => {
    expect(normalizePassengers({}).passengers[0]).toMatchObject({ name: 'PASSENGER NAME', title: 'MR', passport: '' })
    expect(normalizePassengers({ appName: 'Amy Lee', appGender: 'f', appPassport: 'p9' }).passengers[0])
      .toMatchObject({ name: 'Amy Lee', title: 'MISS', passport: 'P9' })
  })
  it('2, 4 and 9 passengers keep order, own titles and own passports', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Person ${i + 1} Surname`, title: i % 2 ? 'MRS' : 'MR', passport: `PP${i + 1}` }))
    for (const n of [2, 4, 9]) {
      const r = normalizePassengers({ passengers: mk(n) })
      expect(r.error).toBeUndefined()
      expect(r.passengers.map(p => p.name)).toEqual(mk(n).map(p => p.name))
      r.passengers.forEach((p, i) => { expect(p.title).toBe(i % 2 ? 'MRS' : 'MR'); expect(p.passport).toBe(`PP${i + 1}`) })
    }
    expect(normalizePassengers({ passengers: mk(10) }).error).toMatch(/maximum of 9/)
  })
  it('drops blank added rows, trims names, never renders a placeholder', () => {
    const r = normalizePassengers({ passengers: [{ name: 'Lead One' }, { name: '   ' }, { name: '  Bob   Two ' }, { name: '' }] })
    expect(r.passengers.map(p => p.name)).toEqual(['Lead One', 'Bob Two'])
  })
  it('extras never inherit the lead passport; lead falls back to body/app passport', () => {
    const r = normalizePassengers({
      passengers: [{ name: 'Lead' }, { name: 'Second' }, { name: 'Third', passport: 'own3' }],
      passportNumber: 'LEAD1', appPassport: 'APP',
    })
    expect(r.passengers.map(p => p.passport)).toEqual(['LEAD1', '', 'OWN3'])
    expect(normalizePassengers({ passengers: [{ name: 'L' }, { name: 'E' }], appPassport: 'app7' }).passengers.map(p => p.passport)).toEqual(['APP7', ''])
  })
  it('linked-application lead + manual extra both survive (lead name from app when row blank)', () => {
    const r = normalizePassengers({ passengers: [{ name: '', title: '' }, { name: 'Manual Extra', title: 'DR' }], appName: 'App Person', appPassport: 'ap1', appGender: 'f' })
    expect(r.passengers).toHaveLength(2)
    expect(r.passengers[0]).toMatchObject({ name: 'App Person', title: 'MISS', passport: 'AP1' })
    expect(r.passengers[1]).toMatchObject({ name: 'Manual Extra', title: 'DR', passport: '' })
  })
  it('drops a duplicate of the lead only when name AND a non-empty passport match', () => {
    const r = normalizePassengers({ passengers: [{ name: 'Lead Guy', passport: 'X1' }, { name: 'lead guy', passport: 'x1' }, { name: 'Other' }] })
    expect(r.passengers.map(p => p.name)).toEqual(['Lead Guy', 'Other'])
  })
  it('keeps twins: same name with no passport (or a different one) are all kept', () => {
    expect(normalizePassengers({ passengers: [{ name: 'Twin A' }, { name: 'Twin A' }] }).passengers).toHaveLength(2)
    expect(normalizePassengers({ passengers: [{ name: 'Twin A', passport: 'P1' }, { name: 'Twin A', passport: 'P2' }, { name: 'Twin A' }] }).passengers).toHaveLength(3)
  })
  it('whitelists titles, caps name/passport, treats non-strings as empty', () => {
    const r = normalizePassengers({
      clientTitle: 'DR',
      passengers: [
        { name: 'Lead', title: 'Emperor' },
        { name: 'x'.repeat(100), title: 'ms', passport: 'p'.repeat(40) },
        { name: { a: 1 } as unknown as string },
        { name: 'Obj Title', title: {} as unknown as string, passport: {} as unknown as string },
      ],
    })
    expect(r.passengers.map(p => p.title)).toEqual(['DR', 'MS', 'MR'])
    expect(r.passengers[1].name).toHaveLength(60)
    expect(r.passengers[1].passport).toHaveLength(20)
    expect(r.passengers).toHaveLength(3) // object name row dropped
    expect(JSON.stringify(r.passengers)).not.toContain('object Object')
    expect(r.passengers[2].passport).toBe('')
  })
  it('counts by type (lead is Adult; at least one adult)', () => {
    const r = normalizePassengers({ passengers: [{ name: 'A' }, { name: 'B', type: 'Child' }, { name: 'C', type: 'Infant' }, { name: 'D', type: 'Adult' }] })
    expect(r.counts).toEqual({ adults: 2, children: 1, infants: 1 })
    expect(countPassengers([{ type: 'Child' }])).toEqual({ adults: 1, children: 0, infants: 0 })
    expect(toDuffelPassengers(r.counts)).toEqual([{ type: 'adult' }, { type: 'adult' }, { type: 'child' }, { type: 'infant_without_seat' }])
  })
})

describe('buildPassengersPayload (UI helper)', () => {
  it('sends nothing extra without extras (legacy shape)', () => {
    expect(buildPassengersPayload({ name: 'Lead', passport: 'p' }, [])).toBeUndefined()
    expect(buildPassengersPayload({ name: 'Lead' }, [{ name: '  ', type: 'Adult', title: 'MR', passport: '' }])).toBeUndefined()
  })
  it('sends full ordered array with lead\'s own passport; blank extras filtered', () => {
    const p = buildPassengersPayload(
      { name: 'Lead', title: 'MRS', passport: 'lp1' },
      [{ name: 'Two', type: 'Child', title: 'MSTR', passport: 'p2' }, { name: '', type: 'Adult', title: 'MR', passport: '' }, { name: 'Three', title: 'DR', passport: '' }],
    )
    expect(p).toEqual([
      { name: 'Lead', type: 'Adult', title: 'MRS', passport: 'LP1' },
      { name: 'Two', type: 'Child', title: 'MSTR', passport: 'P2' },
      { name: 'Three', type: 'Adult', title: 'DR' },
    ])
  })
})

// ─── Route ───────────────────────────────────────────────────────────────────
const dSeg = (from: string, to: string, no: string, day: string) => ({
  origin: { iata_code: from, name: from, city_name: from }, destination: { iata_code: to, name: to, city_name: to },
  departing_at: `${day}T09:00:00`, arriving_at: `${day}T17:00:00`, duration: 'PT8H',
  marketing_carrier: { iata_code: 'BA', name: 'British Airways' }, marketing_carrier_flight_number: no,
  passengers: [{ baggages: [{ type: 'checked', quantity: 1 }] }],
})
const offer = () => ({
  id: 'off_1', total_amount: '500', total_currency: 'GBP', cabin_class: 'economy',
  slices: [
    { origin: { iata_code: 'LOS', name: 'LOS' }, destination: { iata_code: 'LHR', name: 'LHR' }, departing_at: '2026-12-01T09:00:00', arriving_at: '2026-12-01T17:00:00', duration: 'PT8H', segments: [dSeg('LOS', 'LHR', '75', '2026-12-01')] },
  ],
})
const reqOf = (body: Record<string, unknown>) => ({ json: async () => body }) as unknown as Parameters<typeof POST>[0]
const liveBody = (extra: Record<string, unknown> = {}) => ({ mode: 'live', originIata: 'LOS', destIata: 'LHR', departureDate: '2026-12-01', clientName: 'Lead Person', clientTitle: 'MR', passportNumber: 'lead1', ...extra })
const manualBody = (extra: Record<string, unknown> = {}) => ({ mode: 'manual', clientName: 'Lead Person', clientTitle: 'MR', passportNumber: 'lead1', fromCode: 'LOS', toCode: 'LHR', airline: 'British Airways', flightNumber: 'BA75', departureDateTime: '2026-12-01T09:00', ...extra })
const group = (n: number) => [
  { name: 'Lead Person', type: 'Adult', title: 'MR', passport: 'LEAD1' },
  ...Array.from({ length: n - 1 }, (_, i) => ({ name: `Extra${i + 2} Family`, type: 'Adult', title: 'MRS', ...(i === 0 ? { passport: 'EXTRA2PP' } : {}) })),
]

describe('route: live mode', () => {
  const OLD = { ...process.env }
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSession.mockResolvedValue({ email: 'staff@walztravels.com' })
    process.env.DUFFEL_ACCESS_TOKEN = 'test'
    delete process.env.AMADEUS_API_KEY
    mockDuffelPost.mockResolvedValue({ data: { offers: [offer()], passengers: [] } })
  })
  afterAll(() => { process.env = OLD })

  it('legacy single passenger: identical Duffel body, one passenger, unchanged fields', async () => {
    const res = await POST(reqOf(liveBody()))
    const j = await res.json()
    expect(mockDuffelPost.mock.calls[0][1]).toEqual({ data: { slices: [{ origin: 'LOS', destination: 'LHR', departure_date: '2026-12-01' }], passengers: [{ type: 'adult' }], cabin_class: 'economy' } })
    expect(j.ticketData.passengers).toHaveLength(1)
    expect(j.ticketData.passengers[0]).toMatchObject({ title: 'MR', firstName: 'LEAD', lastName: 'PERSON', passport: 'LEAD1' })
    expect(j.ticketData.client_name).toBe('Lead Person')
    expect(j.ticketData.passport_number).toBe('LEAD1')
    expect(j.search_note).toBeUndefined()
  })

  it.each([2, 4])('%i passengers: every passenger in order, own title/passport, unique e-tickets, one itinerary', async (n) => {
    const res = await POST(reqOf(liveBody({ passengers: group(n) })))
    expect(res.status).toBe(200)
    const j = await res.json()
    const pax = j.ticketData.passengers
    expect(pax).toHaveLength(n)
    expect(pax.map((p: { firstName: string }) => p.firstName)).toEqual(['LEAD', ...Array.from({ length: n - 1 }, (_, i) => `EXTRA${i + 2}`)])
    expect(pax[0]).toMatchObject({ title: 'MR', passport: 'LEAD1' })
    expect(pax[1]).toMatchObject({ title: 'MRS', passport: 'EXTRA2PP' })
    if (n > 2) expect(pax[2].passport).toBe('')
    expect(new Set(pax.map((p: { eTicketNumber: string }) => p.eTicketNumber)).size).toBe(n)
    expect(j.ticketData.client_name).toBe('Lead Person')
    expect(j.ticketData.passport_number).toBe('LEAD1')
    // one shared itinerary, single set of flight fields
    expect(j.ticketData.flight_number).toBe('BA75')
    expect(Array.isArray(j.ticketData.flight_number)).toBe(false)
    expect(mockDuffelPost.mock.calls[0][1].data.passengers).toHaveLength(n)
    expect(prisma.generatedTicket.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ clientName: 'Lead Person' }) }))
  })

  it('Duffel passenger types reflect counts', async () => {
    await POST(reqOf(liveBody({ passengers: [group(3)[0], { name: 'Kid One', type: 'Child', title: 'MSTR' }, { name: 'Baby One', type: 'Infant', title: 'MISS' }] })))
    expect(mockDuffelPost.mock.calls[0][1].data.passengers).toEqual([{ type: 'adult' }, { type: 'child' }, { type: 'infant_without_seat' }])
  })

  it('zero offers for a group → retried once with 1 adult and a search_note', async () => {
    mockDuffelPost.mockResolvedValueOnce({ data: { offers: [], passengers: [] } })
    const j = await (await POST(reqOf(liveBody({ passengers: group(4) })))).json()
    expect(mockDuffelPost).toHaveBeenCalledTimes(2)
    expect(mockDuffelPost.mock.calls[1][1].data.passengers).toEqual([{ type: 'adult' }])
    expect(j.search_note).toBe('No fare available for 4 passengers; itinerary searched for 1 adult')
    expect(j.ticketData.passengers).toHaveLength(4)
  })

  it('duffel error for a group → retried once too', async () => {
    mockDuffelPost.mockRejectedValueOnce(new Error('boom'))
    const j = await (await POST(reqOf(liveBody({ passengers: group(2) })))).json()
    expect(mockDuffelPost).toHaveBeenCalledTimes(2)
    expect(j.search_note).toMatch(/2 passengers/)
  })

  it('single passenger with no offers is NOT retried (404 as before)', async () => {
    mockDuffelPost.mockResolvedValue({ data: { offers: [], passengers: [] } })
    const res = await POST(reqOf(liveBody()))
    expect(res.status).toBe(404)
    expect(mockDuffelPost).toHaveBeenCalledTimes(1)
  })

  it('Amadeus fallback receives adults/children/infants', async () => {
    delete process.env.DUFFEL_ACCESS_TOKEN
    process.env.AMADEUS_API_KEY = 'k'; process.env.AMADEUS_API_SECRET = 's'
    const urls: string[] = []
    const realFetch = global.fetch
    global.fetch = jest.fn(async (u: unknown) => {
      const url = String(u); urls.push(url)
      if (url.includes('oauth2/token')) return { ok: true, json: async () => ({ access_token: 't', expires_in: 1800 }) }
      return { ok: true, json: async () => ({ data: [] }) }
    }) as unknown as typeof fetch
    try {
      await POST(reqOf(liveBody({ passengers: [group(2)[0], { name: 'Kid', type: 'Child' }, { name: 'Baby', type: 'Infant' }] })))
    } finally { global.fetch = realFetch }
    const search = urls.filter(u => u.includes('flight-offers'))
    expect(search[0]).toMatch(/adults=1/); expect(search[0]).toMatch(/children=1/); expect(search[0]).toMatch(/infants=1/)
    expect(search[1]).toMatch(/adults=1/); expect(search[1]).not.toMatch(/children=/) // single-adult retry
  })

  it('rejects more than 9 passengers with 400', async () => {
    const res = await POST(reqOf(liveBody({ passengers: group(10) })))
    expect(res.status).toBe(400)
  })
})

describe('route: manual mode', () => {
  beforeEach(() => { jest.clearAllMocks(); mockGetSession.mockResolvedValue({ email: 's@walztravels.com' }) })
  it('legacy single passenger unchanged', async () => {
    const j = await (await POST(reqOf(manualBody()))).json()
    expect(j.ticketData.passengers).toHaveLength(1)
    expect(j.ticketData.passengers[0]).toMatchObject({ title: 'MR', firstName: 'LEAD', lastName: 'PERSON', passport: 'LEAD1' })
    expect(j.ticketData.passport_number).toBe('LEAD1')
  })
  it('multi-passenger with passport isolation', async () => {
    const j = await (await POST(reqOf(manualBody({ passengers: group(3) })))).json()
    const pax = j.ticketData.passengers
    expect(pax.map((p: { passport: string }) => p.passport)).toEqual(['LEAD1', 'EXTRA2PP', ''])
    expect(pax.map((p: { title: string }) => p.title)).toEqual(['MR', 'MRS', 'MRS'])
    expect(new Set(pax.map((p: { eTicketNumber: string }) => p.eTicketNumber)).size).toBe(3)
  })
  it('legacy title default is unchanged: no gender-based MISS in manual mode', async () => {
    const { default: p } = jest.requireMock('@/lib/db') as { default: { visaApplication: { findUnique: jest.Mock } } }
    p.visaApplication.findUnique.mockResolvedValueOnce({ firstName: 'Amy', lastName: 'Lee', passportNumber: 'app1', sex: 'F' })
    const j = await (await POST(reqOf({ mode: 'manual', applicationId: 'a1', fromCode: 'LOS', toCode: 'LHR' }))).json()
    expect(j.ticketData.passengers[0]).toMatchObject({ title: 'MR', passport: 'APP1' })
  })
  it('blank extra row does not become a PASSENGER', async () => {
    const j = await (await POST(reqOf(manualBody({ passengers: [...group(2), { name: '' }] })))).json()
    expect(j.ticketData.passengers).toHaveLength(2)
  })
})

// ─── PDF ─────────────────────────────────────────────────────────────────────
function collectText(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { node.forEach(n => collectText(n, out)); return out }
  const el = node as { type: unknown; props: { children?: unknown } }
  if (typeof el.type === 'function') return collectText((el.type as (p: unknown) => unknown)(el.props), out)
  return collectText(el.props?.children, out)
}
// Text nodes joined with '|' (node boundaries); helper flat() removes the separators.
const pdfText = (data: Record<string, unknown>) =>
  collectText(React.createElement(TicketPDFDocument, { data: data as never })).join('|').replace(/\|/g, '')

const pdfPax = (n: number) => Array.from({ length: n }, (_, i) => ({
  title: i % 2 ? 'MRS' : 'MR', firstName: `FIRST${i + 1}`, lastName: `LAST${i + 1}`, cabinClass: 'ECONOMY',
  seat: `1${i}A`, eTicketNumber: `99900000000${i}`, passport: `PASS${i + 1}`,
}))
const flightData = (n: number) => ({
  ticket_type: 'flight', ticket_reference: 'WLZ-FLT-TEST', client_name: 'First1 Last1', passport_number: 'PASS1',
  from_code: 'LOS', to_code: 'LHR', from_city: 'Lagos', to_city: 'London', airline: 'Britair', flight_number: 'ZZ4242',
  departure_date: '01 Dec 2026', departure_time: '09:00', arrival_date: '01 Dec 2026', arrival_time: '17:00', duration: '8h',
  cabin_class: 'ECONOMY', seat_number: '10A', baggage_allowance: '1 x 23kg', pnr: 'ABC123', booking_reference: 'WLZ-FLT-TEST', stops: '0',
  passengers: pdfPax(n),
})
const count = (hay: string, needle: string) => hay.split(needle).length - 1

describe('TicketPDF passengers', () => {
  it.each([2, 4])('%i passengers: every name + own passport, header lists all, itinerary once', (n) => {
    const t = pdfText(flightData(n))
    for (let i = 1; i <= n; i++) {
      expect(t).toContain(`FIRST${i}`)
      expect(t).toContain(`Passport: PASS${i}`)
    }
    expect(t).toContain(`Passengers (${n})`)
    expect(t).toContain('1. MR FIRST1 LAST1')
    expect(count(t, 'ZZ4242')).toBe(1)
    expect(count(t, 'Passport: PASS2')).toBe(1)
  })
  it('passport sits next to the right passenger', () => {
    const t = pdfText(flightData(3))
    const list = t.slice(t.lastIndexOf('Passengers1'))
    expect(list.indexOf('FIRST2')).toBeLessThan(list.indexOf('Passport: PASS2'))
    expect(list.indexOf('Passport: PASS2')).toBeLessThan(list.indexOf('FIRST3'))
    expect(list.indexOf('FIRST1')).toBeLessThan(list.indexOf('Passport: PASS1'))
  })
  it('single passenger renders as before (no per-passenger passport line, no multi header)', () => {
    const t = pdfText(flightData(1))
    expect(t).toContain('All Passengers')
    expect(t).not.toContain('Passengers (')
    expect(t).not.toContain('Passport: PASS1')
    expect(t).toContain('Passport No.')
    expect(count(t, 'ZZ4242')).toBe(1)
  })
  it('multi-leg layout strip no longer shows e-ticket as passport', () => {
    const leg = { flightNumber: 'ZZ1', airline: 'A', departureCode: 'LOS', departureCity: 'Lagos', departureAirport: '', departureCountry: '', departureDate: 'd', departureTime: 't', arrivalCode: 'LHR', arrivalCity: 'London', arrivalAirport: '', arrivalCountry: '', arrivalDate: 'd', arrivalTime: 't', duration: '8h', cabinClass: 'ECONOMY', baggage: '' }
    const t = pdfText({ ticket_type: 'flight', ticket_reference: 'R', outbound: [leg], inbound: [], tripType: 'one-way', pnr: 'P', passengers: pdfPax(1) })
    expect(t).toContain('Passport No.PASS1')
    expect(t).not.toMatch(/Passport No\.999/)
  })
})

// ─── PDF structure: unbreakable rows / T&C ──────────────────────────────────
type Node = { type: unknown; props: { children?: unknown; wrap?: boolean } }
function expand(node: unknown): unknown {
  if (node == null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(expand)
  const el = node as Node
  if (typeof el.type === 'function') return expand((el.type as (p: unknown) => unknown)(el.props))
  return { type: el.type, props: { ...el.props, children: expand(el.props?.children) } }
}
function findAll(node: unknown, pred: (n: Node) => boolean, out: Node[] = []): Node[] {
  if (node == null || typeof node !== 'object') return out
  if (Array.isArray(node)) { node.forEach(n => findAll(n, pred, out)); return out }
  const n = node as Node
  if (pred(n)) out.push(n)
  findAll(n.props?.children, pred, out)
  return out
}
const textOf = (n: unknown) => collectText(n).join('')
describe('TicketPDF page-break safety', () => {
  const tree = expand(React.createElement(TicketPDFDocument, { data: flightData(5) as never }))
  it('every passenger row and the T&C block are wrap={false}', () => {
    const rows = findAll(tree, n => n.props.wrap === false && /E-Ticket: /.test(textOf(n)) && !/Terms/.test(textOf(n)))
    // 5 rows (+ the title/first-row wrapper which also contains a row)
    expect(rows.length).toBeGreaterThanOrEqual(5)
    for (let i = 1; i <= 5; i++) {
      const own = findAll(tree, n => n.props.wrap === false && textOf(n).includes(`Passport: PASS${i}`))
      expect(own.length).toBeGreaterThan(0)
    }
    const terms = findAll(tree, n => n.props.wrap === false && textOf(n).includes('Terms') && textOf(n).includes('7. By proceeding'))
    expect(terms.length).toBeGreaterThan(0)
  })
})

// ─── UI + hold source assertions ─────────────────────────────────────────────
describe('doc-auth page wiring', () => {
  const page = read('app/admin/intelligence/doc-auth/page.tsx')
  it('resetOutput no longer clears passenger inputs', () => {
    const body = page.slice(page.indexOf('const resetOutput'), page.indexOf('const generate'))
    expect(body).not.toMatch(/setPassengers/)
  })
  it('live and manual payloads use ONE helper', () => {
    expect(page).toContain('buildPassengersPayload(')
    expect(page.match(/passengers: paxPayload/g)).toHaveLength(2)
    expect(page).not.toMatch(/\[\{ name: clientName, type: 'Adult', title: clientTitle \}, \.\.\.passengers\]/)
  })
  it('extras have a passport input', () => {
    expect(page).toContain("{ ...x, passport: e.target.value }")
  })
  it('visa-link handlers never touch the extras state; lead auto-fill still sets name/passport', () => {
    const start = page.indexOf('const handleAppSelect')
    const sel = page.slice(start, page.indexOf('useEffect(() => {\n    if (activeCase', start))
    expect(sel).not.toMatch(/setPassengers/)
    expect(sel).toContain('setClientName(name)')
    const onChange = page.slice(page.indexOf('onChange={(id) => { setAppId(id)'), page.indexOf('onSelect={handleAppSelect}'))
    expect(onChange).toContain('setClientName(\'\')')
    expect(onChange).not.toMatch(/setPassengers/)
    const autofill = page.slice(page.indexOf('// ── Autofill: fetch full app'), page.indexOf('// ── Immediate partial autofill'))
    expect(autofill).toContain('setPassportNo(app.passportNumber)')
    expect(autofill).not.toMatch(/setPassengers/)
  })
})

describe('Duffel hold (documented current state)', () => {
  it('server has NO holdPnr handling — a future implementation must cover ALL passengers', () => {
    const route = read('app/api/admin/intelligence/dummy-ticket/route.ts')
    expect(route).not.toMatch(/holdPnr|hold_pnr|hold_order_id|\/air\/orders/)
    expect(route).toContain('toDuffelPassengers(counts)')
  })
})

// ─── Latency budget (fake timers, mocked slow suppliers) ─────────────────────
describe('route: group-search time budget', () => {
  const run = async (firstPassMs: number) => {
    jest.useFakeTimers()
    mockGetSession.mockResolvedValue({ email: 's@walztravels.com' })
    process.env.DUFFEL_ACCESS_TOKEN = 'test'
    delete process.env.AMADEUS_API_KEY
    mockDuffelPost.mockReset()
    let call = 0
    mockDuffelPost.mockImplementation(() => {
      call++
      // first call fails after firstPassMs; any retry hangs forever (slow supplier)
      return call === 1
        ? new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), firstPassMs))
        : new Promise(() => undefined)
    })
    const start = Date.now()
    let doneAt = -1
    const p = POST(reqOf(liveBody({ passengers: group(4) }))).then(async r => { doneAt = Date.now() - start; return r })
    await jest.advanceTimersByTimeAsync(90000)
    const res = await p
    return { res, elapsed: doneAt, calls: call }
  }
  afterEach(() => jest.useRealTimers())
  jest.setTimeout(20000)

  it('slow first pass (>=20s): no retry, 404 + search_note, well under budget', async () => {
    const { res, elapsed, calls } = await run(21000)
    expect(res.status).toBe(404)
    expect((await res.json()).search_note).toMatch(/4 passengers/)
    expect(calls).toBe(1)
    expect(elapsed).toBeLessThan(55000)
  })
  it('fast first pass then hanging retry: retry is capped, total < 55s', async () => {
    const { res, elapsed, calls } = await run(5000)
    expect(res.status).toBe(404)
    expect(calls).toBe(2)
    expect(elapsed).toBeLessThanOrEqual(5000 + 15000 + 50)
    expect(elapsed).toBeLessThan(55000)
    expect((await res.json()).search_note).toMatch(/4 passengers/)
  })
})
