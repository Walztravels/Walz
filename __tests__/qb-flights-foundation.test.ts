import { duffelOfferToItinerary, classifyFlightTripType } from '@/lib/flights/duffel'

const seg = (from: string, to: string, no: string, dep: string, arr: string) => ({
  id: `seg_${no}`, origin: { iata_code: from }, destination: { iata_code: to },
  departing_at: dep, arriving_at: arr, duration: 'PT2H0M',
  marketing_carrier: { iata_code: 'QR', name: 'Qatar Airways' }, marketing_carrier_flight_number: no,
  passengers: [{ cabin_class: 'economy', baggages: [] }],
})
// A real Duffel slice carries its own origin/destination (used by
// classifyFlightTripType), separate from each segment's origin/destination.
const slice = (segs: ReturnType<typeof seg>[]) => ({
  origin: segs[0].origin,
  destination: segs[segs.length - 1].destination,
  segments: segs,
})

describe('classifyFlightTripType', () => {
  it('one-way for 0-1 slices', () => {
    expect(classifyFlightTripType([])).toBe('one-way')
    expect(classifyFlightTripType([slice([seg('LOS', 'DXB', '1', '2026-12-01T09:00', '2026-12-01T13:00')])])).toBe('one-way')
  })
  it('round-trip only for an exact reverse pair', () => {
    const out = slice([seg('LOS', 'DXB', '1', '2026-12-01T09:00', '2026-12-01T13:00')])
    const ret = slice([seg('DXB', 'LOS', '2', '2026-12-08T09:00', '2026-12-08T15:00')])
    expect(classifyFlightTripType([out, ret])).toBe('round-trip')
  })
  it('multi-city for an open-jaw pair', () => {
    const leg1 = slice([seg('LOS', 'DXB', '1', '2026-12-01T09:00', '2026-12-01T13:00')])
    const leg2 = slice([seg('DXB', 'LHR', '2', '2026-12-08T09:00', '2026-12-08T13:00')])
    expect(classifyFlightTripType([leg1, leg2])).toBe('multi-city')
  })
  it('multi-city for 3+ slices, never truncated', () => {
    const legs = [
      slice([seg('LOS', 'DXB', '1', '2026-09-27T09:00', '2026-09-27T18:00')]),
      slice([seg('DXB', 'LHR', '2', '2026-10-03T09:00', '2026-10-03T14:00')]),
      slice([seg('LHR', 'LOS', '3', '2026-10-10T09:00', '2026-10-10T16:00')]),
    ]
    expect(classifyFlightTripType(legs)).toBe('multi-city')
  })
})

describe('duffelOfferToItinerary — multi-city is never truncated', () => {
  it('a 3-slice offer produces 3 journeys, not 2', () => {
    const offer = {
      id: 'off_mc', total_amount: '2000.00', total_currency: 'USD', cabin_class: 'economy',
      slices: [
        slice([seg('LOS', 'DXB', '1', '2026-09-27T09:00', '2026-09-27T18:00')]),
        slice([seg('DXB', 'LHR', '2', '2026-10-03T09:00', '2026-10-03T14:00')]),
        slice([seg('LHR', 'LOS', '3', '2026-10-10T09:00', '2026-10-10T16:00')]),
      ],
    }
    const it = duffelOfferToItinerary(offer, 1)
    expect(it.journeys).toHaveLength(3)
    expect(it.journeys!.map(j => j.direction)).toEqual(['outbound', 'leg', 'leg'])
    expect(it.journeys!.map(j => j.segments[0].departureIata)).toEqual(['LOS', 'DXB', 'LHR'])
    // Legacy fields stay 2-leg-shaped for backward compatibility.
    expect(it.segments[0].departureIata).toBe('LOS')
    expect(it.returnSegments![0].departureIata).toBe('DXB')
  })

  it('a true round-trip is unaffected (journeys[1].direction === return)', () => {
    const offer = {
      id: 'off_rt', total_amount: '900.00', total_currency: 'GBP', cabin_class: 'economy',
      slices: [
        slice([seg('LOS', 'DOH', '1', '2026-12-01T09:00', '2026-12-01T18:00')]),
        slice([seg('DOH', 'LOS', '2', '2026-12-08T01:00', '2026-12-08T07:00')]),
      ],
    }
    const it = duffelOfferToItinerary(offer, 1)
    expect(it.journeys).toHaveLength(2)
    expect(it.journeys![1].direction).toBe('return')
  })

  it('per-journey stops are independent (a connecting leg does not inflate another leg)', () => {
    const offer = {
      id: 'off_conn', total_amount: '1500.00', total_currency: 'USD', cabin_class: 'economy',
      slices: [
        slice([
          seg('LOS', 'ADD', '1', '2026-09-27T09:00', '2026-09-27T14:00'),
          seg('ADD', 'DXB', '2', '2026-09-27T16:00', '2026-09-27T20:00'),
        ]),
        slice([seg('DXB', 'LOS', '3', '2026-10-03T09:00', '2026-10-03T15:00')]),
      ],
    }
    const it = duffelOfferToItinerary(offer, 1)
    expect(it.journeys![0].stops).toBe(1)
    expect(it.journeys![1].stops).toBe(0)
  })
})

describe('searchFlights — server-side stop-preference safety filter', () => {
  const realFetch = global.fetch
  afterEach(() => { global.fetch = realFetch; jest.restoreAllMocks() })

  function mockDuffelOffers(offers: unknown[]) {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ data: { offers } }),
    })) as unknown as typeof fetch
  }

  const baseParams = {
    tripType: 'one-way' as const,
    cabin: 'ECONOMY' as const,
    passengers: { adults: 1, children: 0, infants: 0 },
    legs: [{ from: 'LOS', to: 'DXB', date: '2026-12-01' }],
  }

  it('sends max_connections on the Duffel request only when a limit is given', async () => {
    mockDuffelOffers([])
    const { searchFlights } = await import('@/lib/flights/duffel')
    await searchFlights({ ...baseParams, maxConnections: 0 })
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.data.max_connections).toBe(0)

    ;(global.fetch as jest.Mock).mockClear()
    await searchFlights(baseParams) // maxConnections undefined
    const body2 = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body2.data.max_connections).toBeUndefined()
  })

  it('drops an offer whose OUTBOUND alone violates the limit even though the return leg is direct', async () => {
    mockDuffelOffers([
      offerWithSlices('off_bad', [slice([seg('LOS', 'ADD', '1'), seg('ADD', 'DXB', '2')]), slice([seg('DXB', 'LOS', '3')])]),
      offerWithSlices('off_good', [slice([seg('LOS', 'DXB', '4')]), slice([seg('DXB', 'LOS', '5')])]),
    ])
    const { searchFlights } = await import('@/lib/flights/duffel')
    const results = await searchFlights({ ...baseParams, maxConnections: 0 })
    expect(results.map((r) => r.id)).toEqual(['off_good'])
  })

  it('drops a multi-city offer whose MIDDLE journey alone violates the limit', async () => {
    mockDuffelOffers([
      offerWithSlices('off_mc_bad', [
        slice([seg('LOS', 'DXB', '1')]),
        slice([seg('DXB', 'ADD', '2'), seg('ADD', 'LHR', '3')]),
        slice([seg('LHR', 'LOS', '4')]),
      ]),
    ])
    const { searchFlights } = await import('@/lib/flights/duffel')
    const results = await searchFlights({ ...baseParams, maxConnections: 0 })
    expect(results).toHaveLength(0)
  })

  it('keeps every offer when no stop preference is given (any)', async () => {
    mockDuffelOffers([
      offerWithSlices('off_a', [slice([seg('LOS', 'ADD', '1'), seg('ADD', 'DXB', '2')])]),
    ])
    const { searchFlights } = await import('@/lib/flights/duffel')
    const results = await searchFlights(baseParams)
    expect(results.map((r) => r.id)).toEqual(['off_a'])
  })

  it('max-1-stop keeps a 1-stop journey and drops a 2-stop journey', async () => {
    mockDuffelOffers([
      offerWithSlices('off_1stop', [slice([seg('LOS', 'ADD', '1'), seg('ADD', 'DXB', '2')])]),
      offerWithSlices('off_2stop', [slice([seg('LOS', 'ADD', '1'), seg('ADD', 'CAI', '2'), seg('CAI', 'DXB', '3')])]),
    ])
    const { searchFlights } = await import('@/lib/flights/duffel')
    const results = await searchFlights({ ...baseParams, maxConnections: 1 })
    expect(results.map((r) => r.id)).toEqual(['off_1stop'])
  })
})

function offerWithSlices(id: string, slices: ReturnType<typeof slice>[]) {
  return { id, total_amount: '1000.00', total_currency: 'USD', cabin_class: 'economy', slices }
}
