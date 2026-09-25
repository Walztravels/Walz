/**
 * Research → Add to Itinerary (server). Supplier/fx/DB are all mocked: no
 * network, no real booking. Verifies one-offer-one-price, server-side
 * re-verification, duplicate protection, authz and currency safety.
 */
import { Prisma } from '@prisma/client'

const store: { flights: string; hotels: string; currency: string; exists: boolean } = {
  flights: '[]', hotels: '[]', currency: 'GBP', exists: true,
}
const mockPrisma = {
  itinerary: {
    findUnique: jest.fn(async ({ select }: { select?: Record<string, boolean> }) => {
      if (!store.exists) return null
      const all: Record<string, unknown> = { id: 'it1', ...store }
      if (!select) return all
      return Object.fromEntries(Object.keys(select).map((k) => [k, all[k]]))
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, string>; data: Record<string, string> }) => {
      const col = 'flights' in data ? 'flights' : 'hotels'
      if (col in where && where[col] !== store[col]) return { count: 0 }
      store[col] = data[col]
      return { count: 1 }
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

import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { getOffer } from '@/lib/flights/duffel'
import { hotelbedsRequest } from '@/lib/hotelbeds'
import { getStandardRate } from '@/lib/fx'
import { POST } from '@/app/api/admin/itineraries/[id]/research-add/route'
import { classifyTripType } from '@/lib/itinerary/research-add'
import { sumClientTotals, sumSupplierTotals } from '@/lib/itinerary/unified-booking'

const SESSION = { id: 's1', email: 'staff@walztravels.com', name: 'Staff', role: 'sales_rep', staffRole: 'sales_rep', permissions: {} }

function call(body: Record<string, unknown>) {
  const req = { json: async () => body, headers: { get: () => '' } } as unknown as Parameters<typeof POST>[0]
  return POST(req, { params: Promise.resolve({ id: 'it1' }) })
}

const seg = (o: string, d: string, no: string, dep: string, arr: string, dur = 'PT7H') => ({
  origin: { iata_code: o, city_name: o + 'city' }, destination: { iata_code: d, city_name: d + 'city' },
  departing_at: dep, arriving_at: arr, duration: dur,
  marketing_carrier: { iata_code: 'QR', name: 'Qatar Airways' }, marketing_carrier_flight_number: no,
  passengers: [{ cabin_class: 'economy', baggages: [{ type: 'checked', quantity: 1 }] }],
})
const slice = (segs: ReturnType<typeof seg>[]) => ({
  origin: segs[0].origin, destination: segs[segs.length - 1].destination, duration: 'PT14H', segments: segs,
})
const offer = (slices: ReturnType<typeof slice>[], over: Record<string, unknown> = {}) => ({
  id: 'off_1', total_amount: '1000.00', total_currency: 'GBP', tax_amount: '120.00',
  expires_at: '2099-01-01T00:00:00Z', passengers: [{ id: 'pas_1', type: 'adult' }], slices, ...over,
})
const OUT = () => slice([seg('LHR', 'DOH', '1', '2026-12-01T09:15:00', '2026-12-01T17:40:00')])
const BACK = () => slice([seg('DOH', 'LHR', '2', '2026-12-10T09:00:00', '2026-12-10T14:00:00')])

const HB = (over: Record<string, unknown> = {}) => ({
  hotel: {
    code: 77, name: 'Grand Test', checkIn: '2026-12-01', checkOut: '2026-12-04', currency: 'GBP',
    rooms: [{ code: 'DBL.ST', name: 'Double Standard', rates: [{
      rateKey: 'RK1', net: '300.00', currency: 'GBP', boardCode: 'BB', rateClass: 'NOR',
      cancellationPolicies: [{ amount: '100', from: '2026-11-25T00:00:00+01:00' }], ...over,
    }] }],
  },
})
const HOTEL_BODY = { type: 'hotel', hotelCode: '77', rateKey: 'RK1', checkIn: '2026-12-01', checkOut: '2026-12-04', rooms: 1, adults: 2, children: 0 }

const flightsOut = () => JSON.parse(store.flights) as Record<string, any>[] // eslint-disable-line @typescript-eslint/no-explicit-any

beforeEach(() => {
  jest.clearAllMocks()
  store.flights = '[]'; store.hotels = '[]'; store.currency = 'GBP'; store.exists = true
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(hasPermission as jest.Mock).mockReturnValue(true)
  ;(getOffer as jest.Mock).mockResolvedValue(offer([OUT()]))
  ;(hotelbedsRequest as jest.Mock).mockResolvedValue(HB())
  ;(getStandardRate as jest.Mock).mockResolvedValue(null)
  global.fetch = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch
})

describe('flight add', () => {
  it('one-way → 1 row, 1 journey, one price (5% markup once)', async () => {
    const res = await call({ type: 'flight', offerId: 'off_1' })
    const j = await res.json()
    expect(res.status).toBe(200)
    expect(j.ok).toBe(true); expect(j.kind).toBe('flight')
    expect(j.flights).toHaveLength(1)
    const b = j.booking
    expect(b.journeys).toHaveLength(1); expect(b.tripType).toBe('one-way')
    expect(b.supplierCost).toBe(1000); expect(b.cost).toBe(1050)
    expect(b.pricing.clientTotal).toBe(b.cost)
    expect(b.pricing.taxes).toBe(120); expect(b.pricing.markupPercent).toBe(5)
    expect(b.status).toBe('Pending'); expect(b.pnr).toBe(''); expect(b.addedFrom).toBe('research')
    expect(b.offer).toMatchObject({ provider: 'duffel', providerOfferId: 'off_1', supplierCurrency: 'GBP', supplierTotal: 1000, expiresAt: '2099-01-01T00:00:00Z' })
    expect(b.offer.refs.passenger1).toBe('pas_1')
    expect(b.from).toBe('LHR'); expect(b.to).toBe('DOH'); expect(b.flightNumber).toBe('QR1')
    expect(flightsOut()).toHaveLength(1)
    expect(mockPrisma.activityLog.create.mock.calls[0][0].data).toMatchObject({ module: 'itineraries', action: 'ITINERARY_RESEARCH_ADD' })
  })

  it('return → 1 row, 2 journeys, ONE total counted once', async () => {
    ;(getOffer as jest.Mock).mockResolvedValue(offer([OUT(), BACK()]))
    const j = await (await call({ type: 'flight', offerId: 'off_1' })).json()
    expect(j.booking.tripType).toBe('return')
    expect(j.booking.journeys.map((x: { direction: string }) => x.direction)).toEqual(['outbound', 'return'])
    expect(j.booking.cost).toBe(1050); expect(j.booking.supplierCost).toBe(1000)
    expect(sumClientTotals(j.flights)).toBe(1050); expect(sumSupplierTotals(j.flights)).toBe(1000)
    expect(j.booking.to).toBe('DOH')
    // price is booking-level only
    for (const jo of j.booking.journeys) {
      expect(jo).not.toHaveProperty('cost'); expect(jo).not.toHaveProperty('price')
      for (const s of jo.segments) { expect(s).not.toHaveProperty('cost'); expect(s).not.toHaveProperty('price') }
    }
  })

  it('connecting return keeps every segment and still one total', async () => {
    const o = slice([seg('LHR', 'DOH', '1', '2026-12-01T09:00:00', '2026-12-01T17:00:00'), seg('DOH', 'SYD', '3', '2026-12-01T20:00:00', '2026-12-02T14:00:00', 'PT14H')])
    const r = slice([seg('SYD', 'DOH', '4', '2026-12-10T09:00:00', '2026-12-10T14:00:00'), seg('DOH', 'LHR', '2', '2026-12-10T16:00:00', '2026-12-10T21:00:00')])
    ;(getOffer as jest.Mock).mockResolvedValue(offer([o, r]))
    const j = await (await call({ type: 'flight', offerId: 'off_1' })).json()
    expect(j.booking.tripType).toBe('return')
    expect(j.booking.journeys.map((x: { segments: unknown[] }) => x.segments.length)).toEqual([2, 2])
    expect(j.booking.journeys[0].stops).toBe(1)
    expect(j.booking.to).toBe('SYD')
    expect(j.booking.cost).toBe(1050)
    expect(sumClientTotals(j.flights)).toBe(1050)
  })

  it('multi-city (3 slices) → 3 journeys, one total', async () => {
    const a = slice([seg('LHR', 'DOH', '1', '2026-12-01T09:00:00', '2026-12-01T17:00:00')])
    const b = slice([seg('DOH', 'BKK', '5', '2026-12-05T09:00:00', '2026-12-05T17:00:00')])
    const c = slice([seg('BKK', 'LHR', '6', '2026-12-09T09:00:00', '2026-12-09T22:00:00')])
    ;(getOffer as jest.Mock).mockResolvedValue(offer([a, b, c]))
    const j = await (await call({ type: 'flight', offerId: 'off_1' })).json()
    expect(j.booking.tripType).toBe('multi-city')
    expect(j.booking.journeys).toHaveLength(3)
    expect(j.booking.journeys.every((x: { direction: string }) => x.direction === 'leg')).toBe(true)
    expect(sumClientTotals(j.flights)).toBe(1050)
  })

  it('ignores client-supplied price/segments; uses the supplier offer', async () => {
    const j = await (await call({
      type: 'flight', offerId: 'off_1', cost: 1, price: 1, supplierCost: 1, journeys: [{ segments: [] }],
      pricing: { clientTotal: 1 }, from: 'XXX',
    })).json()
    expect(j.booking.cost).toBe(1050); expect(j.booking.from).toBe('LHR'); expect(j.booking.journeys).toHaveLength(1)
    expect(getOffer).toHaveBeenCalledWith('off_1')
  })

  it('preserves legacy rows untouched', async () => {
    const legacy = [{ id: 'l1', from: 'LOS', to: 'LHR', cost: 400 }, { id: 'l2', from: 'LHR', to: 'LOS', cost: 400 }]
    store.flights = JSON.stringify(legacy)
    const j = await (await call({ type: 'flight', offerId: 'off_1' })).json()
    expect(j.flights).toHaveLength(3)
    expect(j.flights[0]).toEqual(legacy[0]); expect(j.flights[1]).toEqual(legacy[1])
    expect(sumClientTotals(j.flights)).toBe(400 + 400 + 1050)
  })

  it('expired offer (expires_at past) → 410, nothing written', async () => {
    ;(getOffer as jest.Mock).mockResolvedValue(offer([OUT()], { expires_at: '2000-01-01T00:00:00Z' }))
    const res = await call({ type: 'flight', offerId: 'off_1' })
    expect(res.status).toBe(410)
    expect(mockPrisma.itinerary.updateMany).not.toHaveBeenCalled()
    expect(store.flights).toBe('[]')
  })

  it('supplier 404 → 410, nothing written', async () => {
    ;(getOffer as jest.Mock).mockRejectedValue(new Error('Duffel 404: not_found'))
    const res = await call({ type: 'flight', offerId: 'off_1' })
    expect(res.status).toBe(410)
    expect(store.flights).toBe('[]')
  })

  it('duplicate → 409 {duplicate, existingId}; allowDuplicate adds', async () => {
    const first = await (await call({ type: 'flight', offerId: 'off_1' })).json()
    const dup = await call({ type: 'flight', offerId: 'off_1' })
    const dj = await dup.json()
    expect(dup.status).toBe(409); expect(dj.duplicate).toBe(true); expect(dj.existingId).toBe(first.booking.id)
    expect(flightsOut()).toHaveLength(1)
    const ok = await call({ type: 'flight', offerId: 'off_1', allowDuplicate: true })
    expect(ok.status).toBe(200)
    expect(flightsOut()).toHaveLength(2)
  })

  it('double POST race → one row (CAS re-read catches the loser)', async () => {
    const [a, b] = await Promise.all([call({ type: 'flight', offerId: 'off_1' }), call({ type: 'flight', offerId: 'off_1' })])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(flightsOut()).toHaveLength(1)
  })

  it('race on different offers keeps both', async () => {
    ;(getOffer as jest.Mock).mockImplementation(async (id: string) => offer([OUT()], { id }))
    await Promise.all([call({ type: 'flight', offerId: 'off_a' }), call({ type: 'flight', offerId: 'off_b' })])
    expect(flightsOut().map((r) => r.offer.providerOfferId).sort()).toEqual(['off_a', 'off_b'])
  })

  it('unauthenticated → 401, no write, no supplier call', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await call({ type: 'flight', offerId: 'off_1' })
    expect(res.status).toBe(401)
    expect(getOffer).not.toHaveBeenCalled(); expect(mockPrisma.itinerary.updateMany).not.toHaveBeenCalled()
  })

  it('missing permission → 403, no write', async () => {
    ;(hasPermission as jest.Mock).mockReturnValue(false)
    const res = await call({ type: 'flight', offerId: 'off_1' })
    expect(res.status).toBe(403)
    expect(mockPrisma.itinerary.updateMany).not.toHaveBeenCalled()
  })

  it('currency mismatch converts via fx, records the original', async () => {
    store.currency = 'USD'
    ;(getStandardRate as jest.Mock).mockResolvedValue({ rawRate: new Prisma.Decimal('1.25'), fetchedAt: new Date(), provider: 'mock', rateSource: 'mock' })
    const j = await (await call({ type: 'flight', offerId: 'off_1' })).json()
    expect(j.ok).toBe(true)
    expect(j.booking.pricing).toMatchObject({ currency: 'USD', supplierTotal: 1250, supplierCurrency: 'GBP', supplierTotalOriginal: 1000, clientTotal: 1312.5 })
    expect(j.booking.cost).toBe(1312.5)
    expect(j.booking.offer.supplierCurrency).toBe('GBP'); expect(j.booking.offer.supplierTotal).toBe(1000)
  })

  it('currency mismatch with no fx rate → refused, nothing written', async () => {
    store.currency = 'USD'
    const res = await call({ type: 'flight', offerId: 'off_1' })
    expect(res.status).toBe(422)
    expect(store.flights).toBe('[]')
  })
})

describe('hotel add', () => {
  it('adds a research hotel from the checkrates response and never books', async () => {
    const res = await call({
      ...HOTEL_BODY, hotelName: 'Client Name', location: 'Dubai', stars: 5,
      net: 1, price: 1, cost: 1, roomName: 'Fake', boardCode: 'RO',
    })
    const j = await res.json()
    expect(res.status).toBe(200); expect(j.kind).toBe('hotel')
    const h = j.booking
    expect(h.bookingKind).toBe('research-hotel')
    expect(h.name).toBe('Grand Test') // supplier value wins
    expect(h.rate).toMatchObject({
      providerHotelCode: '77', rateKey: 'RK1', roomCode: 'DBL.ST', roomName: 'Double Standard',
      boardCode: 'BB', breakfastIncluded: true, isRefundable: true,
      occupancy: { rooms: 1, adults: 2, children: 0 },
    })
    expect(h.rate.cancellationPolicy).toContain('2026-11-25')
    expect(h.checkIn).toBe('2026-12-01'); expect(h.checkOut).toBe('2026-12-04'); expect(h.nights).toBe(3)
    expect(h.supplierCost).toBe(300); expect(h.cost).toBe(354) // 18% once, whole stay
    expect(h.pricing.clientTotal).toBe(h.cost)
    expect(h.offer).toMatchObject({ provider: 'hotelbeds', providerOfferId: '77:RK1', supplierCurrency: 'GBP', supplierTotal: 300 })
    expect(j.hotels).toHaveLength(1)
    // only /checkrates was ever called on the supplier
    const paths = (hotelbedsRequest as jest.Mock).mock.calls.map((c) => c[1])
    expect(paths).toEqual(['/checkrates'])
    expect(paths.some((p: string) => /booking/i.test(p))).toBe(false)
    expect(getOffer).not.toHaveBeenCalled()
  })

  it('preserves legacy hotel rows; duplicate rate → 409', async () => {
    const legacy = [{ id: 'h0', name: 'Old', cost: 100 }]
    store.hotels = JSON.stringify(legacy)
    const first = await (await call(HOTEL_BODY)).json()
    expect(first.hotels[0]).toEqual(legacy[0]); expect(first.hotels).toHaveLength(2)
    const dup = await call(HOTEL_BODY)
    expect(dup.status).toBe(409)
    expect((await dup.json()).existingId).toBe(first.booking.id)
    expect(JSON.parse(store.hotels)).toHaveLength(2)
    expect((await call({ ...HOTEL_BODY, allowDuplicate: true })).status).toBe(200)
    expect(JSON.parse(store.hotels)).toHaveLength(3)
  })

  it('unavailable rate → 410, nothing written', async () => {
    ;(hotelbedsRequest as jest.Mock).mockRejectedValue(new Error('Hotelbeds hotel POST /checkrates → 400: INVALID_RATE'))
    const res = await call(HOTEL_BODY)
    expect(res.status).toBe(410); expect(store.hotels).toBe('[]')
  })

  it('hotel currency mismatch without fx → refused', async () => {
    ;(hotelbedsRequest as jest.Mock).mockResolvedValue(HB({ currency: 'EUR' }))
    const res = await call(HOTEL_BODY)
    expect(res.status).toBe(422); expect(store.hotels).toBe('[]')
  })

  it('hotel currency mismatch with fx → converted, original recorded', async () => {
    ;(hotelbedsRequest as jest.Mock).mockResolvedValue(HB({ currency: 'EUR' }))
    ;(getStandardRate as jest.Mock).mockResolvedValue({ rawRate: new Prisma.Decimal('0.5'), fetchedAt: new Date(), provider: 'mock', rateSource: 'mock' })
    const j = await (await call(HOTEL_BODY)).json()
    expect(j.booking.pricing).toMatchObject({ currency: 'GBP', supplierTotal: 150, supplierCurrency: 'EUR', supplierTotalOriginal: 300, clientTotal: 177 })
  })

  it('rejects bad input without calling the supplier', async () => {
    expect((await call({ type: 'hotel', hotelCode: '77' })).status).toBe(400)
    expect((await call({ ...HOTEL_BODY, checkOut: '2026-12-01' })).status).toBe(400)
    expect(hotelbedsRequest).not.toHaveBeenCalled()
  })
})

describe('data integrity + error mapping + classifyTripType', () => {
  it.each(['{not json', '{"a":1}', '"str"'])('malformed/non-array flights column %s → 422, nothing written', async (bad) => {
    store.flights = bad
    for (const extra of [{}, { allowDuplicate: true }]) {
      const res = await call({ type: 'flight', offerId: 'off_1', ...extra })
      expect(res.status).toBe(422)
      expect((await res.json()).code).toBe('ITINERARY_DATA_INVALID')
    }
    expect(mockPrisma.itinerary.updateMany).not.toHaveBeenCalled()
    expect(store.flights).toBe(bad)
  })

  it('malformed hotels column → 422, nothing written', async () => {
    store.hotels = '{oops'
    const res = await call(HOTEL_BODY)
    expect(res.status).toBe(422)
    expect(store.hotels).toBe('{oops')
    expect(mockPrisma.itinerary.updateMany).not.toHaveBeenCalled()
  })

  it.each(['', '[]'])('empty column %j still adds', async (v) => {
    store.flights = v
    expect((await call({ type: 'flight', offerId: 'off_1' })).status).toBe(200)
    expect(flightsOut()).toHaveLength(1)
  })

  it('null column still adds', async () => {
    ;(store as unknown as { flights: string | null }).flights = null
    expect((await call({ type: 'flight', offerId: 'off_1' })).status).toBe(200)
  })

  it('hotelbeds 5xx whose body contains "400" → 502, not 410', async () => {
    ;(hotelbedsRequest as jest.Mock).mockRejectedValue(new Error('Hotelbeds hotel POST /checkrates → 503: upstream 400 timeout INVALID_RATE'))
    expect((await call(HOTEL_BODY)).status).toBe(502)
    ;(hotelbedsRequest as jest.Mock).mockRejectedValue(new Error('Hotelbeds hotel POST /checkrates timed out after 12000ms'))
    expect((await call(HOTEL_BODY)).status).toBe(502)
    expect(store.hotels).toBe('[]')
  })

  it('duffel 5xx whose body mentions not_found/404 → 502, not 410', async () => {
    ;(getOffer as jest.Mock).mockRejectedValue(new Error('Duffel 500: not_found 404 expired'))
    expect((await call({ type: 'flight', offerId: 'off_1' })).status).toBe(502)
  })

  it('classifyTripType', () => {
    const sl = (o: string, d: string) => ({ origin: { iata_code: o }, destination: { iata_code: d } })
    expect(classifyTripType([sl('LHR', 'DOH')])).toBe('one-way')
    expect(classifyTripType([])).toBe('one-way')
    expect(classifyTripType([sl('LHR', 'DOH'), sl('DOH', 'LHR')])).toBe('return')
    expect(classifyTripType([sl('LHR', 'DOH'), sl('DOH', 'MAN')])).toBe('multi-city')
    expect(classifyTripType([sl('LHR', 'DOH'), sl('BKK', 'LHR')])).toBe('multi-city')
    expect(classifyTripType([sl('LHR', 'DOH'), sl('DOH', 'BKK'), sl('BKK', 'LHR')])).toBe('multi-city')
  })
})
