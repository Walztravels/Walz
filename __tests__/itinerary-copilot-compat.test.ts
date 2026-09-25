/**
 * Jade Copilot compatibility with unified flight bookings. Supplier/fx/DB/LLM
 * are all mocked: no network. Copilot Add must build the SAME unified booking
 * as Research → Add; Copilot regenerate must never drop/downgrade one.
 */
import fs from 'fs'
import path from 'path'

const hooks: { beforeWrite?: () => void } = {}
const store: { [k: string]: unknown; flights: string; hotels: string; tours: string; transfers: string; currency: string } = {
  flights: '[]', hotels: '[]', tours: '[]', transfers: '[]', currency: 'GBP',
}
const mockPrisma = {
  itinerary: {
    findUnique: jest.fn(async ({ select }: { select?: Record<string, boolean> }) => {
      const all: Record<string, unknown> = {
        id: 'it1', title: 'T', destination: 'Doha', days: '[]', startDate: null, endDate: null,
        duration: 5, numberOfTravellers: 2, tripType: 'leisure', budget: 0, ...store,
      }
      if (!select) return all
      return Object.fromEntries(Object.keys(select).map((k) => [k, all[k]]))
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, string>; data: Record<string, unknown> }) => {
      hooks.beforeWrite?.()
      for (const c of ['flights', 'hotels']) if (c in where && where[c] !== (store as Record<string, string>)[c]) return { count: 0 }
      for (const k of ['flights', 'hotels', 'tours', 'transfers', 'totalPrice', 'deposit']) if (data[k] !== undefined) (store as Record<string, unknown>)[k] = data[k]
      return { count: 1 }
    }),
    update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      for (const k of ['flights', 'hotels', 'tours', 'transfers']) if (typeof data[k] === 'string') (store as Record<string, string>)[k] = data[k] as string
      return {}
    }),
  },
  activityLog: { create: jest.fn(async () => ({})) },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: jest.fn(() => true) }))
jest.mock('@/lib/flights/duffel', () => ({ getOffer: jest.fn() }))
jest.mock('@/lib/hotelbeds', () => ({ hotelbedsRequest: jest.fn() }))
jest.mock('@/lib/fx', () => ({ getStandardRate: jest.fn() }))
jest.mock('@/lib/hotel-images', () => ({ resolveHotelImages: jest.fn(() => []) }))

import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { POST as MUTATE } from '@/app/api/jade/tools/mutate-itinerary/route'
import { POST as LIVE } from '@/app/api/admin/itineraries/[id]/copilot-live-search/route'
import { getOffer } from '@/lib/flights/duffel'
import { getStandardRate } from '@/lib/fx'
import { POST as ADD } from '@/app/api/admin/itineraries/[id]/copilot-add-item/route'
import { POST as RESEARCH_ADD } from '@/app/api/admin/itineraries/[id]/research-add/route'
import { POST as GENERATE } from '@/app/api/admin/itineraries/copilot/route'
import { mergeCopilotBookings } from '@/lib/itinerary/copilot-merge'
import { sumClientTotals, sumSupplierTotals, isUnifiedFlight } from '@/lib/itinerary/unified-booking'

const SESSION = { id: 's1', email: 'staff@walztravels.com', name: 'Staff', role: 'sales_rep', staffRole: 'sales_rep', permissions: {} }

const addCall = (body: Record<string, unknown>) => {
  const req = { json: async () => body, headers: { get: () => '' } } as unknown as Parameters<typeof ADD>[0]
  return ADD(req, { params: Promise.resolve({ id: 'it1' }) })
}
const researchCall = (body: Record<string, unknown>) => {
  const req = { json: async () => body, headers: { get: () => '' } } as unknown as Parameters<typeof RESEARCH_ADD>[0]
  return RESEARCH_ADD(req, { params: Promise.resolve({ id: 'it1' }) })
}

const seg = (o: string, d: string, no: string, dep: string, arr: string) => ({
  origin: { iata_code: o, city_name: o }, destination: { iata_code: d, city_name: d },
  departing_at: dep, arriving_at: arr, duration: 'PT7H',
  marketing_carrier: { iata_code: 'QR', name: 'Qatar Airways' }, marketing_carrier_flight_number: no,
  passengers: [{ cabin_class: 'economy', baggages: [] }],
})
const slice = (segs: ReturnType<typeof seg>[]) => ({ origin: segs[0].origin, destination: segs[segs.length - 1].destination, duration: 'PT14H', segments: segs })
const offer = (slices: ReturnType<typeof slice>[]) => ({
  id: 'off_1', total_amount: '1000.00', total_currency: 'GBP', tax_amount: '120.00',
  expires_at: '2099-01-01T00:00:00Z', passengers: [{ id: 'pas_1', type: 'adult' }], slices,
})
const OUT = () => slice([seg('LHR', 'DOH', '1', '2026-12-01T09:15:00', '2026-12-01T17:40:00')])
const BACK = () => slice([seg('DOH', 'LHR', '2', '2026-12-10T09:00:00', '2026-12-10T14:00:00')])
const flightsOut = () => JSON.parse(store.flights) as Record<string, any>[] // eslint-disable-line @typescript-eslint/no-explicit-any

beforeEach(() => {
  jest.clearAllMocks()
  hooks.beforeWrite = undefined
  ;(hasPermission as jest.Mock).mockReturnValue(true)
  Object.assign(store, { flights: '[]', hotels: '[]', tours: '[]', transfers: '[]', currency: 'GBP', totalPrice: 5000, deposit: 500 })
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(getOffer as jest.Mock).mockResolvedValue(offer([OUT()]))
  ;(getStandardRate as jest.Mock).mockResolvedValue(null)
  global.fetch = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch
})

describe('Copilot Add flight → unified booking', () => {
  it('one-way → ONE unified booking, 1 journey, one price, addedFrom copilot', async () => {
    const res = await addCall({ itemType: 'flight', item: { offerId: 'off_1' } })
    const j = await res.json()
    expect(res.status).toBe(200)
    expect(flightsOut()).toHaveLength(1)
    const b = j.item
    expect(b.bookingKind).toBe('unified-flight'); expect(b.journeys).toHaveLength(1)
    expect(b.cost).toBe(1050); expect(b.supplierCost).toBe(1000)
    expect(b.addedFrom).toBe('copilot')
    expect(mockPrisma.activityLog.create.mock.calls[0][0].data.action).toBe('ITINERARY_COPILOT_ADD')
  })

  it('return → ONE booking, TWO journeys, ONE total (cost/supplierCost once, pricing, offer id)', async () => {
    ;(getOffer as jest.Mock).mockResolvedValue(offer([OUT(), BACK()]))
    const j = await (await addCall({ itemType: 'flight', item: { offerId: 'off_1' } })).json()
    const rows = flightsOut()
    expect(rows).toHaveLength(1)
    expect(rows[0].tripType).toBe('return')
    expect(rows[0].journeys).toHaveLength(2)
    expect(sumClientTotals(rows)).toBe(1050); expect(sumSupplierTotals(rows)).toBe(1000)
    expect(rows[0].pricing.clientTotal).toBe(1050)
    expect(rows[0].offer.providerOfferId).toBe('off_1')
    expect(j.item.duffelOrderId).toBeUndefined()
  })

  it('connecting return keeps all segments', async () => {
    const o = slice([seg('LHR', 'DOH', '1', '2026-12-01T09:00:00', '2026-12-01T17:00:00'), seg('DOH', 'SYD', '3', '2026-12-01T20:00:00', '2026-12-02T14:00:00')])
    const r = slice([seg('SYD', 'DOH', '4', '2026-12-10T09:00:00', '2026-12-10T14:00:00'), seg('DOH', 'LHR', '2', '2026-12-10T16:00:00', '2026-12-10T21:00:00')])
    ;(getOffer as jest.Mock).mockResolvedValue(offer([o, r]))
    await addCall({ itemType: 'flight', item: { offerId: 'off_1' } })
    expect(flightsOut()[0].journeys.map((x: { segments: unknown[] }) => x.segments.length)).toEqual([2, 2])
  })

  it('multi-city → N journeys', async () => {
    const a = slice([seg('LHR', 'DOH', '1', '2026-12-01T09:00:00', '2026-12-01T17:00:00')])
    const b = slice([seg('DOH', 'SYD', '3', '2026-12-03T09:00:00', '2026-12-03T23:00:00')])
    const c = slice([seg('SYD', 'LHR', '5', '2026-12-10T09:00:00', '2026-12-10T23:00:00')])
    ;(getOffer as jest.Mock).mockResolvedValue(offer([a, b, c]))
    await addCall({ itemType: 'flight', item: { offerId: 'off_1' } })
    expect(flightsOut()).toHaveLength(1)
    expect(flightsOut()[0].tripType).toBe('multi-city'); expect(flightsOut()[0].journeys).toHaveLength(3)
  })

  it('missing offerId → refused, nothing written, NO legacy row, supplier not called', async () => {
    const res = await addCall({ itemType: 'flight', item: { from: 'LHR', to: 'DOH', cost: 1000, duffelOrderId: 'off_1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('OFFER_ID_REQUIRED')
    expect(store.flights).toBe('[]')
    expect(mockPrisma.itinerary.update).not.toHaveBeenCalled()
    expect(mockPrisma.itinerary.updateMany).not.toHaveBeenCalled()
    expect(getOffer).not.toHaveBeenCalled()
  })

  it('never trusts browser price/segments: supplier total wins', async () => {
    await addCall({ itemType: 'flight', item: { offerId: 'off_1', cost: 1, price: 1, segments: [] } })
    expect(flightsOut()[0].supplierCost).toBe(1000)
  })

  it('duplicate offer → 409 same as Research; allowDuplicate adds again', async () => {
    await addCall({ itemType: 'flight', item: { offerId: 'off_1' } })
    const dup = await addCall({ itemType: 'flight', item: { offerId: 'off_1' } })
    expect(dup.status).toBe(409)
    expect((await dup.json()).duplicate).toBe(true)
    expect(flightsOut()).toHaveLength(1)
    const again = await addCall({ itemType: 'flight', item: { offerId: 'off_1' }, allowDuplicate: true })
    expect(again.status).toBe(200)
    expect(flightsOut()).toHaveLength(2)
  })

  it('Copilot and Research produce the same booking shape (one implementation)', async () => {
    await addCall({ itemType: 'flight', item: { offerId: 'off_1' } })
    const c = flightsOut()[0]
    store.flights = '[]'
    await researchCall({ type: 'flight', offerId: 'off_1' })
    const r = flightsOut()[0]
    const strip = (x: Record<string, any>) => { const { id, addedAt, addedFrom, offer: o, ...rest } = x; return { rest, offer: { ...o, searchedAt: 0 } } } // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(strip(c)).toEqual(strip(r))
    expect(r.addedFrom).toBe('research')
  })

  it('research-add response shapes unchanged (errors + success)', async () => {
    const bad = await researchCall({ type: 'car' })
    expect(bad.status).toBe(400); expect(await bad.json()).toEqual({ ok: false, error: "type must be 'flight' or 'hotel'" })
    const ok = await (await researchCall({ type: 'flight', offerId: 'off_1' })).json()
    expect(Object.keys(ok).sort()).toEqual(['booking', 'flights', 'hotels', 'kind', 'ok'])
  })
})

// ── merge (pure) ────────────────────────────────────────────────────────────
const UNIFIED = () => ({
  id: 'bk_u1', bookingKind: 'unified-flight', tripType: 'return',
  journeys: [
    { index: 0, direction: 'outbound', stops: 0, segments: [{ from: 'LHR', to: 'DOH', airline: 'Qatar Airways', flightNumber: 'QR1', date: '2026-12-01', time: '09:15', arrivalTime: '17:40' }] },
    { index: 1, direction: 'return', stops: 0, segments: [{ from: 'DOH', to: 'LHR', airline: 'Qatar Airways', flightNumber: 'QR2', date: '2026-12-10', time: '09:00', arrivalTime: '14:00' }] },
  ],
  from: 'LHR', to: 'DOH', airline: 'Qatar Airways', flightNumber: 'QR1', date: '2026-12-01', cost: 1050, supplierCost: 1000,
  pricing: { currency: 'GBP', supplierTotal: 1000, clientTotal: 1050, source: 'research' },
  offer: { provider: 'duffel', providerOfferId: 'off_1', supplierTotal: 1000, supplierCurrency: 'GBP', searchedAt: 'x' },
  extraOptional: { keep: true },
})
const UHOTEL = () => ({
  id: 'bk_h1', bookingKind: 'research-hotel', name: 'Grand', rate: { rateKey: 'RK', providerHotelCode: '77' }, cost: 300, supplierCost: 250,
  offer: { provider: 'hotelbeds', providerOfferId: '77:RK' }, pricing: { clientTotal: 300 },
})

describe('mergeCopilotBookings', () => {
  it('keeps an unified flight EXACTLY when the LLM omits it', () => {
    const u = UNIFIED()
    const out = mergeCopilotBookings([u], [], 'flight')
    expect(out).toEqual([UNIFIED()])
    expect(out[0]).toBe(u)
    expect(isUnifiedFlight(out[0])).toBe(true)
  })
  it('ignores a mangled LLM row with the same id', () => {
    const out = mergeCopilotBookings([UNIFIED()], [{ id: 'bk_u1', from: 'XXX', cost: 5, journeys: [] }], 'flight')
    expect(out).toEqual([UNIFIED()])
  })
  it('drops a generated row carrying the same supplier offer id (no duplicate of a preserved booking)', () => {
    const out = mergeCopilotBookings([UNIFIED()], [{ id: 'other', duffelOrderId: 'off_1', cost: 1050 }, { id: 'x2', offer: { provider: 'duffel', providerOfferId: 'off_1' } }], 'flight')
    expect(out).toHaveLength(1)
  })
  it('documents: re-emitted legs WITHOUT id/offer id are kept as legacy rows (cost can double count; no route inference)', () => {
    const legs = [{ id: 'n1', from: 'LHR', to: 'DOH', date: '2026-12-01', cost: 500 }, { id: 'n2', from: 'DOH', to: 'LHR', date: '2026-12-10', cost: 500 }]
    const out = mergeCopilotBookings([UNIFIED()], legs, 'flight')
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual(UNIFIED())
    expect(sumClientTotals(out)).toBe(2050)
  })
  it('preserves unified hotels; legacy hotels round-trip', () => {
    const out = mergeCopilotBookings([UHOTEL(), { id: 'h_old', name: 'Old', extra: 'k' }], [{ id: 'bk_h1', name: 'LLM' }, { id: 'h_old', name: 'Old2' }], 'hotel')
    expect(out[0]).toEqual(UHOTEL())
    expect(out[1]).toEqual({ id: 'h_old', name: 'Old2', extra: 'k' })
    expect(out).toHaveLength(2)
  })
  it('legacy flight rows: LLM governs, same-id row keeps unknown optional fields', () => {
    const existing = [{ id: 'f1', from: 'A', to: 'B', cost: 10, seatNo: '12A', customField: { z: 1 } }, { id: 'f2', from: 'C', to: 'D' }]
    const out = mergeCopilotBookings(existing, [{ id: 'f1', from: 'A', to: 'B', cost: 20 }, { id: 'new', from: 'E', to: 'F' }], 'flight')
    expect(out).toEqual([
      { id: 'f1', from: 'A', to: 'B', cost: 20, seatNo: '12A', customField: { z: 1 } },
      { id: 'new', from: 'E', to: 'F' },
    ]) // f2 (legacy, omitted by LLM) dropped exactly as today
  })
  it('never groups or merges legacy rows (same route/date stay separate)', () => {
    const rows = [{ id: 'a', from: 'LHR', to: 'DOH', date: '2026-12-01', airline: 'QR' }, { id: 'b', from: 'LHR', to: 'DOH', date: '2026-12-01', airline: 'QR' }]
    const out = mergeCopilotBookings([], rows, 'flight')
    expect(out).toEqual(rows)
    expect(out.some((r) => 'journeys' in r)).toBe(false)
  })
  it('is pure and tolerant of junk input', () => {
    const ex = [UNIFIED()]; const snap = JSON.stringify(ex)
    mergeCopilotBookings(ex, [null, 5, 'x', [], { id: 'k' }] as unknown[], 'flight')
    expect(JSON.stringify(ex)).toBe(snap)
    expect(mergeCopilotBookings(null, undefined, 'flight')).toEqual([])
    expect(mergeCopilotBookings(['x', null] as unknown[], [], 'flight')).toEqual([])
  })
  it("'other' kind never treats rows as protected", () => {
    expect(mergeCopilotBookings([{ id: 't1', name: 'a', keep: 1 }], [{ id: 't1', name: 'b' }], 'other')).toEqual([{ id: 't1', name: 'b', keep: 1 }])
  })
})

// ── Copilot generate route (LLM mocked) ─────────────────────────────────────
describe('Copilot regenerate preserves unified bookings', () => {
  const OLD_KEY = process.env.OPENAI_API_KEY
  afterAll(() => { process.env.OPENAI_API_KEY = OLD_KEY })

  function llm(result: Record<string, unknown>) {
    process.env.OPENAI_API_KEY = 'test'
    let prompt = ''
    global.fetch = jest.fn(async (_u: unknown, init: { body: string }) => {
      prompt = JSON.parse(init.body).messages[1].content
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(result) } }] }) }
    }) as unknown as typeof fetch
    return () => prompt
  }
  const gen = () => GENERATE({ json: async () => ({ prompt: 'update it', itineraryId: 'it1' }) } as unknown as Parameters<typeof GENERATE>[0])

  it.each([
    ['omits it', { flights: [] }],
    ['mangles it', { flights: [{ id: 'bk_u1', from: 'ZZZ', to: 'YYY', cost: 1 }] }],
    ['re-emits its legs echoing its id', { flights: [{ id: 'bk_u1', from: 'LHR', to: 'DOH', cost: 1050 }, { id: 'bk_u1', from: 'DOH', to: 'LHR', cost: 1050 }] }],
  ])('LLM %s', async (_n, out) => {
    store.flights = JSON.stringify([UNIFIED()])
    store.hotels = JSON.stringify([UHOTEL()])
    store.transfers = JSON.stringify([{ id: 'tr1', from: 'A', to: 'B' }])
    llm({ title: 'X', ...out, hotels: [], tours: [{ name: 'Tour', date: '2026-12-02' }], transfers: [{ from: 'A', to: 'B' }] })
    const res = await gen()
    expect(res.status).toBe(200)
    const rows = flightsOut()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(UNIFIED()) // id, journeys[], pricing, offer.providerOfferId, extra fields intact
    expect(rows[0].journeys).toHaveLength(2)
    expect(JSON.parse(store.hotels)).toEqual([UHOTEL()])
    expect(JSON.parse(store.tours)).toHaveLength(1)
    expect(JSON.parse(store.transfers)).toHaveLength(1)
    const body = await res.json()
    expect(body.itinerary.flights[0]).toEqual(UNIFIED())
  })

  it('prompt describes a unified flight as ONE line with route, trip type and single total', async () => {
    store.flights = JSON.stringify([UNIFIED()])
    const getPrompt = llm({ title: 'X' })
    await gen()
    const p = getPrompt()
    expect(p).toContain('Current Flights (1):')
    expect(p).toMatch(/STAFF-MANAGED BOOKING[^\n]*Return LHR ⇄ DOH[^\n]*ONE total GBP 1050/)
    expect(p).toContain('do NOT invent per-leg rows')
    expect(p.match(/QR2/g)).toBeNull()
  })

  it('legacy flights still work (LLM governs; echoed id keeps unknown fields)', async () => {
    store.flights = JSON.stringify([{ id: 'f1', from: 'A', to: 'B', airline: 'X', seatNo: '12A' }])
    llm({ title: 'X', flights: [{ id: 'f1', from: 'A', to: 'B', airline: 'X' }, { from: 'C', to: 'D' }] })
    await gen()
    const rows = flightsOut()
    expect(rows).toHaveLength(2)
    expect(rows[0].seatNo).toBe('12A')
    expect(rows.some((r) => 'journeys' in r)).toBe(false)
  })

  it('source: copilot route no longer writes normedFlights/normedHotels unmerged', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/itineraries/copilot/route.ts'), 'utf8')
    expect(src).not.toContain('JSON.stringify(normedFlights)')
    expect(src).not.toContain('JSON.stringify(normedHotels)')
    expect(src).toContain("mergeCopilotBookings(exFl, normedFlights, 'flight')")
    expect(src).toContain('updateMany')
    expect(src).not.toMatch(/prisma\.itinerary\.update\(/)
    expect(src).toContain('JSON.stringify(finalFlights)')
  })

  it('source: Copilot no longer builds legacy single-leg flight rows', () => {
    const add = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/itineraries/[id]/copilot-add-item/route.ts'), 'utf8')
    expect(add).toContain('addOfferToItinerary')
    expect(add).not.toContain('flights.push')
    const ui = fs.readFileSync(path.join(process.cwd(), 'app/admin/itinerary-planner/[id]/JadeCopilot.tsx'), 'utf8')
    expect(ui).not.toContain('supplierCost: null')
    expect(ui).toContain('offerId: result.offerId')
  })
})


describe('permission gate (copilot-add-item flight)', () => {
  it("no 'bookings' → 403 same shape as research-add, no supplier call, nothing written", async () => {
    ;(hasPermission as jest.Mock).mockReturnValue(false)
    const res = await addCall({ itemType: 'flight', item: { offerId: 'off_1' } })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ ok: false, error: 'Forbidden' })
    expect(hasPermission).toHaveBeenCalledWith(expect.anything(), 'bookings')
    expect(getOffer).not.toHaveBeenCalled()
    expect(store.flights).toBe('[]')
  })
  it("with 'bookings' → works", async () => {
    expect((await addCall({ itemType: 'flight', item: { offerId: 'off_1' } })).status).toBe(200)
  })
})

describe('regenerate: CAS, malformed, totals, warnings', () => {
  const gen = () => GENERATE({ json: async () => ({ prompt: 'update it', itineraryId: 'it1' }) } as unknown as Parameters<typeof GENERATE>[0])
  const llm = (result: Record<string, unknown>) => {
    process.env.OPENAI_API_KEY = 'test'
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(result) } }] }) })) as unknown as typeof fetch
  }
  const U2 = () => ({ ...UNIFIED(), id: 'bk_u2', offer: { provider: 'duffel', providerOfferId: 'off_2' } })

  it('concurrent research-add between read and write is not lost (CAS retry re-merges)', async () => {
    store.flights = JSON.stringify([UNIFIED()])
    let fired = false
    hooks.beforeWrite = () => { if (!fired) { fired = true; store.flights = JSON.stringify([UNIFIED(), U2()]) } }
    llm({ title: 'X', flights: [] })
    const res = await gen()
    expect(res.status).toBe(200)
    expect(mockPrisma.itinerary.updateMany.mock.calls.length).toBe(2)
    expect(flightsOut().map((r) => r.id)).toEqual(['bk_u1', 'bk_u2'])
  })

  it('exhausted retries → 409, no clobber', async () => {
    store.flights = JSON.stringify([UNIFIED()])
    let n = 0
    hooks.beforeWrite = () => { store.flights = JSON.stringify([UNIFIED(), { id: `x${n++}` }]) }
    llm({ title: 'X', flights: [{ from: 'A', to: 'B' }] })
    const res = await gen()
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('CONFLICT')
    expect(mockPrisma.itinerary.updateMany.mock.calls.length).toBe(4)
    expect(flightsOut().some((r) => r.from === 'A')).toBe(false)
  })

  it.each([['flights', '{not json'], ['flights', '{"a":1}'], ['hotels', 'oops']])('malformed %s column → 422, nothing written', async (col, val) => {
    ;(store as Record<string, unknown>)[col] = val
    llm({ title: 'X', flights: [{ from: 'A', to: 'B' }] })
    const res = await gen()
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('ITINERARY_DATA_INVALID')
    expect((store as Record<string, unknown>)[col]).toBe(val)
    expect(mockPrisma.itinerary.updateMany).not.toHaveBeenCalled()
  })

  it('protected booking present → stored totalPrice/deposit untouched; without one → LLM total still applies', async () => {
    store.flights = JSON.stringify([UNIFIED()])
    llm({ title: 'X', totalPrice: 99, deposit: 9 })
    await gen()
    expect(store.totalPrice).toBe(5000); expect(store.deposit).toBe(500)
    store.flights = '[]'
    llm({ title: 'X', totalPrice: 99, deposit: 9 })
    await gen()
    expect(store.totalPrice).toBe(99); expect(store.deposit).toBe(9)
  })

  it('warns (response.warnings + copilotNotes) when generated flight rows sit beside a unified flight; no warning otherwise', async () => {
    store.flights = JSON.stringify([UNIFIED()])
    llm({ title: 'X', copilotNotes: 'n', flights: [{ from: 'LHR', to: 'DOH', cost: 500 }] })
    const b = await (await gen()).json()
    expect(b.warnings[0]).toMatch(/staff-managed flight booking/)
    expect(b.itinerary.copilotNotes).toContain('review the Bookings tab for duplicates')
    expect(flightsOut()).toHaveLength(2)
    store.flights = JSON.stringify([UNIFIED()])
    llm({ title: 'X', flights: [] })
    expect((await (await gen()).json()).warnings).toBeUndefined()
  })

  it('flights:null from the LLM keeps unified; changed id / duffelOrderId match ignored', async () => {
    store.flights = JSON.stringify([UNIFIED()])
    llm({ title: 'X', flights: null })
    await gen()
    expect(flightsOut()).toEqual([UNIFIED()])
    llm({ title: 'X', flights: [{ id: 'brand_new', from: 'Z', to: 'Y' }] })
    await gen()
    expect(flightsOut()[0]).toEqual(UNIFIED()) // preserved; the new leg is a separate legacy row
  })
})

describe('merge protects by bookingKind even when malformed', () => {
  it('unified-flight without journeys / research-hotel without rate kept verbatim', () => {
    const f = { id: 'f', bookingKind: 'unified-flight', cost: 7 }
    const h = { id: 'h', bookingKind: 'research-hotel', cost: 8 }
    expect(mergeCopilotBookings([f], [{ id: 'f', cost: 1 }], 'flight')).toEqual([f])
    expect(mergeCopilotBookings([h], [{ id: 'h', cost: 1 }], 'hotel')).toEqual([h])
  })
})

describe('mutate-itinerary guards', () => {
  const mut = (tool: string, params: Record<string, unknown>) =>
    MUTATE({ json: async () => ({ itineraryId: 'it1', tool, params }), headers: { get: () => '' } } as unknown as Parameters<typeof MUTATE>[0])
  it('unified flight: only notes/status editable', async () => {
    store.flights = JSON.stringify([UNIFIED()])
    const bad = await (await mut('updateFlightField', { flightIndex: 0, field: 'date', value: '2027-01-01' })).json()
    expect(bad.error).toMatch(/managed by staff/)
    expect(flightsOut()[0]).toEqual(UNIFIED())
    const ok = await (await mut('updateFlightField', { flightIndex: 0, field: 'notes', value: 'hi' })).json()
    expect(ok.ok).toBe(true)
    expect(flightsOut()[0].notes).toBe('hi'); expect(flightsOut()[0].journeys).toHaveLength(2)
  })
  it('research hotel: only notes/status editable', async () => {
    store.hotels = JSON.stringify([UHOTEL()])
    const bad = await (await mut('updateHotelField', { hotelIndex: 0, field: 'checkIn', value: '2027-01-01' })).json()
    expect(bad.error).toMatch(/managed by staff/)
    expect(JSON.parse(store.hotels)[0]).toEqual(UHOTEL())
    const ok = await (await mut('updateHotelField', { hotelIndex: 0, field: 'notes', value: 'hi' })).json()
    expect(ok.ok).toBe(true)
  })
})

describe('copilot-live-search returns offerId/journeys', () => {
  it('flight results carry offerId, tripType, journeys', async () => {
    jest.resetModules()
    jest.doMock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn(async () => SESSION) }))
    jest.doMock('@/lib/flights/duffel', () => ({ searchFlights: jest.fn(async () => [{
      id: 'off_9', stops: 0, expiresAt: '2099-01-01',
      segments: [{ airline: 'QR', flightNumber: 'QR1', departureIata: 'LHR', arrivalIata: 'DOH', departureTime: 't', arrivalTime: 't' }],
      returnSegments: [{ airline: 'QR', flightNumber: 'QR2', departureIata: 'DOH', arrivalIata: 'LHR', departureTime: 't', arrivalTime: 't' }],
      price: { total: 1000, currency: 'GBP' },
    }]) }))
    const { POST: L } = await import('@/app/api/admin/itineraries/[id]/copilot-live-search/route')
    const res = await L({ json: async () => ({ type: 'flights', params: { origin: 'LHR', destination: 'DOH', departure_date: '2026-12-01', return_date: '2026-12-10' } }) } as never, { params: Promise.resolve({ id: 'it1' }) })
    const r = (await res.json()).results[0]
    expect(r.offerId).toBe('off_9'); expect(r.tripType).toBe('return')
    expect(r.journeys).toEqual([{ from: 'LHR', to: 'DOH', segments: 1 }, { from: 'DOH', to: 'LHR', segments: 1 }])
  })
})
