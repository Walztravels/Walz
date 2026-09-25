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
const future = (n: number) => new Date(Date.now() + (30 + n) * 86_400_000).toISOString().slice(0, 10)
const call = async (rawLegs: unknown[], keepDates = false) => {
  const legs = keepDates ? rawLegs : rawLegs.map((l, i) => ({ ...(l as object), date: future(i) }))
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

describe('research route flights failure taxonomy (fail closed)', () => {
  const okLegs = [{ from: 'LHR', to: 'DOH', date: 'x' }]
  const fetchOf = () => (globalThis as unknown as { fetch: jest.Mock }).fetch
  const respond = (status: number, body: unknown) => {
    ;(globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: false, status, json: async () => body, text: async () => JSON.stringify(body) }))
  }
  const assertClosed = (d: { flights: unknown[]; fallback: boolean }) => {
    expect(d.flights).toEqual([])
    expect(d.fallback).toBe(true)
    expect(JSON.stringify(d)).not.toContain('offerId')
  }
  beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => {}) })
  afterEach(() => { jest.restoreAllMocks(); process.env.DUFFEL_ACCESS_TOKEN = 'test' })

  it('missing token -> NOT_CONFIGURED, no fetch', async () => {
    delete process.env.DUFFEL_ACCESS_TOKEN
    ;(globalThis as unknown as { fetch: unknown }).fetch = jest.fn()
    const d = await call(okLegs)
    expect(d.reason).toBe('NOT_CONFIGURED'); assertClosed(d)
    expect(fetchOf()).not.toHaveBeenCalled()
  })

  it('Duffel 422 -> INVALID_REQUEST with safe short message, no raw body/ids/token', async () => {
    respond(422, { meta: { request_id: 'FZ-SECRET-REQID', status: 422 }, errors: [{ type: 'validation_error', code: 'validation_error', title: 'Validation error', message: "Field 'departure_date' must be after 2026-09-24 duffel_test_SECRETTOKEN", documentation_url: 'https://x' }] })
    const d = await call(okLegs)
    expect(d.reason).toBe('INVALID_REQUEST'); assertClosed(d)
    expect(d.message).toContain('must be after 2026-09-24')
    const dump = JSON.stringify(d)
    expect(dump).not.toMatch(/FZ-SECRET-REQID|SECRETTOKEN|documentation_url|request_id/)
    expect(d.message.length).toBeLessThanOrEqual(160)
  })

  it.each([[401, 'SUPPLIER_AUTH'], [403, 'SUPPLIER_AUTH'], [429, 'RATE_LIMITED'], [500, 'SUPPLIER_ERROR'], [503, 'SUPPLIER_ERROR']])('status %i -> %s', async (status, reason) => {
    respond(status, { errors: [{ code: 'x', title: 'T', message: 'secret-body' }] })
    const d = await call(okLegs)
    expect(d.reason).toBe(reason); assertClosed(d)
    expect(JSON.stringify(d)).not.toContain('secret-body')
  })

  it('abort -> TIMEOUT', async () => {
    ;(globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e })
    const d = await call(okLegs)
    expect(d.reason).toBe('TIMEOUT'); assertClosed(d)
  })

  it('malformed offer is skipped, good offers still return', async () => {
    ;(globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ data: { offers: [
        null,
        { id: 'bad', slices: 'nope', total_amount: '1' },
        { id: 'good', total_amount: '100', total_currency: 'GBP', slices: [slice('LHR', 'DOH', [segment('LHR', 'DOH', 1, 'a', 'b')])] },
      ] } }),
    }))
    const d = await call(okLegs)
    expect(d.fallback).toBeUndefined()
    expect(d.flights.map((f: { offerId: string }) => f.offerId)).toEqual(['good'])
  })

  const offersResp = (offers: unknown[]) => {
    ;(globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: { offers } }) }))
  }
  const goodOffer = (i: number) => ({ id: `g${i}`, total_amount: '10', total_currency: 'GBP', slices: [slice('LHR', 'DOH', [segment('LHR', 'DOH', 1, 'a', 'b')])] })

  it('all offers throwing in mapping -> PROCESSING_ERROR, flights []', async () => {
    offersResp([null, null, null, null, null])
    const d = await call(okLegs)
    expect(d.reason).toBe('PROCESSING_ERROR'); assertClosed(d)
  })
  it('2 of 5 throwing -> 3 returned, no reason', async () => {
    offersResp([goodOffer(1), null, goodOffer(2), null, goodOffer(3)])
    const d = await call(okLegs)
    expect(d.flights).toHaveLength(3)
    expect(d.reason).toBeUndefined(); expect(d.fallback).toBeUndefined()
  })
  it('0 offers -> normal empty success', async () => {
    offersResp([])
    const d = await call(okLegs)
    expect(d.flights).toEqual([]); expect(d.source).toBe('duffel')
    expect(d.reason).toBeUndefined(); expect(d.fallback).toBeUndefined()
  })

  it('mapping exception on whole response -> PROCESSING_ERROR', async () => {
    ;(globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: { offers: { not: 'array' } } }) }))
    const d = await call(okLegs)
    expect(d.reason).toBe('PROCESSING_ERROR'); assertClosed(d)
    const bad = jest.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json') } }))
    ;(globalThis as unknown as { fetch: unknown }).fetch = bad
    const d2 = await call(okLegs)
    expect(d2.reason).toBe('PROCESSING_ERROR')
  })

  it.each([
    ['past date', [{ from: 'LHR', to: 'DOH', date: '2020-01-01' }]],
    ['malformed date', [{ from: 'LHR', to: 'DOH', date: '01/12/2030' }]],
    ['impossible date', [{ from: 'LHR', to: 'DOH', date: '2030-02-31' }]],
    ['return before departure', [{ from: 'LHR', to: 'DOH', date: future(10) }, { from: 'DOH', to: 'LHR', date: future(5) }]],
  ])('%s -> INVALID_REQUEST without calling Duffel', async (_n, legs) => {
    ;(globalThis as unknown as { fetch: unknown }).fetch = jest.fn()
    const d = await call(legs, true)
    expect(d.reason).toBe('INVALID_REQUEST'); assertClosed(d)
    expect(d.message).toMatch(/date/i)
    expect(fetchOf()).not.toHaveBeenCalled()
  })

  it('valid future date still returns live offers (regression)', async () => {
    mockDuffel([slice('LHR', 'DOH', [segment('LHR', 'DOH', 1, 'a', 'b')])])
    const d = await call(okLegs)
    expect(d.source).toBe('duffel')
    expect(d.fallback).toBeUndefined()
    expect(d.flights[0].offerId).toBe('off_abc')
  })
})
