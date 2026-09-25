jest.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }) },
}))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn(async () => ({ id: 'a' })) }))
jest.mock('@/lib/db', () => ({ __esModule: true, default: {}, prisma: {} }))
jest.mock('@/lib/hotelbeds', () => ({ hotelbedsRequest: jest.fn() }))

import { GET } from '@/app/api/admin/itineraries/[id]/research/route'

const segment = (o: string, d: string, no: number, dep: string, arr: string) => ({
  origin: { iata_code: o }, destination: { iata_code: d },
  departing_at: dep, arriving_at: arr, duration: 'PT6H30M',
  marketing_carrier: { name: 'Qatar Airways', iata_code: 'QR' }, marketing_carrier_flight_number: String(no),
  passengers: [{ cabin_class_marketing_name: 'Economy', baggages: [{ type: 'checked', quantity: 1 }, { type: 'carry_on', quantity: 1 }] }],
})
const slice = (o: string, d: string, segs: ReturnType<typeof segment>[]) => ({
  origin: { iata_code: o }, destination: { iata_code: d }, duration: 'PT7H', segments: segs,
})

function mockDuffel(slices: ReturnType<typeof slice>[]) {
  ;(globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ data: { offers: [{ id: 'off_abc', expires_at: '2026-12-01T00:00:00Z', total_amount: '2241.50', total_currency: 'GBP', slices }] } }),
  }))
}
const call = async (legs: unknown[]) => {
  const url = `http://x/api?type=flights&legs=${encodeURIComponent(JSON.stringify(legs))}`
  const res = await GET({ url } as never, { params: Promise.resolve({ id: 'i1' }) })
  return res.json()
}

beforeAll(() => { process.env.DUFFEL_ACCESS_TOKEN = 'test' })

describe('research route flights enrichment', () => {
  it('return offer: 2 journeys with all segments, offerId, single total price', async () => {
    mockDuffel([
      slice('LHR', 'DOH', [segment('LHR', 'AMS', 1, '2026-12-01T08:00:00Z', '2026-12-01T09:30:00Z'), segment('AMS', 'DOH', 2, '2026-12-01T11:00:00Z', '2026-12-01T18:00:00Z')]),
      slice('DOH', 'LHR', [segment('DOH', 'LHR', 3, '2026-12-10T02:00:00Z', '2026-12-10T09:00:00Z')]),
    ])
    const data = await call([{ from: 'LHR', to: 'DOH', date: '2026-12-01' }, { from: 'DOH', to: 'LHR', date: '2026-12-10' }])
    expect(data.flights).toHaveLength(1)
    const f = data.flights[0]
    expect(f.offerId).toBe('off_abc')
    expect(f.expiresAt).toBe('2026-12-01T00:00:00Z')
    expect(f.tripType).toBe('return')
    expect(f.journeys).toHaveLength(2)
    expect(f.journeys[0].direction).toBe('outbound')
    expect(f.journeys[1].direction).toBe('return')
    expect(f.journeys[0].segments.map((s: { flightNumber: string }) => s.flightNumber)).toEqual(['QR1', 'QR2'])
    expect(f.journeys[0].stops).toBe(1)
    expect(f.journeys[1].segments[0]).toMatchObject({ from: 'DOH', to: 'LHR', departureAt: '2026-12-10T02:00:00Z', cabin: 'Economy', baggage: '1 checked, 1 carry-on' })
    expect(f.price).toBe(2241.5)
    expect(f.currency).toBe('GBP')
    // no per-leg price anywhere
    expect(JSON.stringify(f.journeys)).not.toMatch(/price|amount/i)
    // backward compat
    expect(f.slices).toHaveLength(2)
    expect(f.airline).toBe('Qatar Airways')
  })

  it('multi-city offer: 3 journeys labelled legs', async () => {
    mockDuffel([
      slice('LHR', 'DOH', [segment('LHR', 'DOH', 1, 'a', 'b')]),
      slice('DOH', 'DXB', [segment('DOH', 'DXB', 2, 'c', 'd')]),
      slice('DXB', 'LHR', [segment('DXB', 'LHR', 3, 'e', 'f')]),
    ])
    const data = await call([{ from: 'LHR', to: 'DOH', date: 'x' }, { from: 'DOH', to: 'DXB', date: 'y' }, { from: 'DXB', to: 'LHR', date: 'z' }])
    const f = data.flights[0]
    expect(f.tripType).toBe('multi-city')
    expect(f.journeys).toHaveLength(3)
    expect(f.journeys.every((j: { direction: string }) => j.direction === 'outbound' || j.direction === 'leg')).toBe(true)
  })

  it('one-way offer', async () => {
    mockDuffel([slice('LHR', 'DOH', [segment('LHR', 'DOH', 1, 'a', 'b')])])
    const data = await call([{ from: 'LHR', to: 'DOH', date: 'x' }])
    expect(data.flights[0].tripType).toBe('one-way')
    expect(data.flights[0].journeys).toHaveLength(1)
  })

  it('trip type agrees with the saved booking: open-jaw = multi-city, exact reverse = return', async () => {
    mockDuffel([slice('LHR', 'DOH', [segment('LHR', 'DOH', 1, 'a', 'b')]), slice('DXB', 'LHR', [segment('DXB', 'LHR', 2, 'c', 'd')])])
    let f = (await call([{ from: 'LHR', to: 'DOH', date: 'x' }, { from: 'DXB', to: 'LHR', date: 'y' }])).flights[0]
    expect(f.tripType).toBe('multi-city')
    expect(f.journeys.map((j: { direction: string }) => j.direction)).toEqual(['leg', 'leg'])
    mockDuffel([slice('LHR', 'DOH', [segment('LHR', 'DOH', 1, 'a', 'b')]), slice('DOH', 'LHR', [segment('DOH', 'LHR', 2, 'c', 'd')])])
    f = (await call([{ from: 'LHR', to: 'DOH', date: 'x' }, { from: 'DOH', to: 'LHR', date: 'y' }])).flights[0]
    expect(f.tripType).toBe('return')
  })
})
