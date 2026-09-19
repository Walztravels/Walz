/**
 * Agent A — Flight search error handling.
 *
 * Root cause: app/api/admin/travel-search/flights/route.ts and
 * app/api/admin/travel-search/transfers/route.ts had no try/catch around
 * their provider calls (searchFlights / hotelbedsRequest). When the
 * provider rejected a request (e.g. Duffel 422 "Invalid IATA code", or a
 * Hotelbeds 403 "Access to this API has been disallowed"), the unhandled
 * throw produced a malformed/bodyless Next.js error response instead of a
 * real {error} JSON body — matching the confirmed production symptom.
 *
 * These tests prove:
 *  - Duffel validation errors now surface as a real {error, source} body
 *    with status 422 from the admin flights route (mirroring the public
 *    /api/flights/search route's classification).
 *  - Hotelbeds 403 "disallowed" errors now surface as a clean, classified
 *    {error, code: TRANSFER_UNAVAILABLE} body with status 503 from the
 *    admin transfers route (mirroring /api/hotelbeds/transfers).
 *  - The happy path for both routes is unaffected by the added try/catch.
 */

jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: () => true }))
jest.mock('@/lib/flights/duffel', () => ({ searchFlights: jest.fn(), assignBadges: (x: unknown) => x }))
jest.mock('@/lib/hotelbeds', () => ({ hotelbedsRequest: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { searchFlights } from '@/lib/flights/duffel'
import { hotelbedsRequest } from '@/lib/hotelbeds'
import { POST as flightsPOST } from '@/app/api/admin/travel-search/flights/route'
import { POST as transfersPOST } from '@/app/api/admin/travel-search/transfers/route'

const SESSION = { email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} }

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof flightsPOST>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  process.env.DUFFEL_ACCESS_TOKEN = 'test-token'
})

describe('POST /api/admin/travel-search/flights — error handling', () => {
  const FLIGHT_BODY = { from: 'LHR', to: 'ZZZ', depart: '2026-10-01', trip: 'one-way', cabin: 'economy', adults: 1 }

  it('a Duffel 422 validation error produces a real {error} JSON body with status 422 (not an unhandled exception)', async () => {
    ;(searchFlights as jest.Mock).mockRejectedValue(new Error('Duffel 422: Invalid IATA code'))

    const res = await flightsPOST(req(FLIGHT_BODY))
    expect(res.status).toBe(422)

    const json = await res.json()
    expect(json.error).toContain('Duffel 422')
    expect(json.source).toBe('duffel_error')
  })

  it('a generic/network failure produces a 500 with an actionable, non-crashing error body', async () => {
    ;(searchFlights as jest.Mock).mockRejectedValue(new Error('fetch failed: ECONNRESET'))

    const res = await flightsPOST(req(FLIGHT_BODY))
    expect(res.status).toBe(500)

    const json = await res.json()
    expect(json.error).toBe('Search failed. Please try again.')
    expect(json.source).toBe('error')
  })

  it('happy path (successful Duffel search) is unaffected by the added try/catch', async () => {
    const itinerary = {
      id: 'off_1',
      segments: [{
        departureIata: 'LHR', arrivalIata: 'DXB',
        departureTime: '2026-10-01T10:00:00Z', arrivalTime: '2026-10-01T20:00:00Z',
        airline: 'EK', airlineName: 'Emirates', cabinClass: 'ECONOMY',
      }],
      returnSegments: [],
      price: { total: 500, currency: 'GBP' },
      expiresAt: null, refundable: false, changeable: false, fareType: null, seatsLeft: null,
      baggageInfo: {},
    }
    ;(searchFlights as jest.Mock).mockResolvedValue([itinerary])

    const res = await flightsPOST(req(FLIGHT_BODY))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.provider).toBe('duffel')
    expect(json.totalOffers).toBe(1)
    expect(json.offers).toHaveLength(1)
    expect(json.offers[0].providerOfferId).toBe('off_1')
  })
})

// Closing security hardening (2026-09-19): the UI's multi-city leg builder
// already caps at 5 legs (CreateQuoteDrawer.tsx / FlightSearchWidget.tsx,
// MC_MAX_LEGS), but that cap was never enforced server-side — a direct API
// call could submit an arbitrarily large or malformed segments array
// straight into the Duffel request. These tests prove the new validation
// rejects out-of-bounds/malformed multi-city requests with a controlled
// 4xx JSON error BEFORE searchFlights()/Duffel is ever called, while
// leaving a valid request, and one-way/round-trip requests, unaffected.
describe('POST /api/admin/travel-search/flights — multi-city segment validation', () => {
  const seg = (from: string, to: string, date: string) => ({ from, to, date })

  it('a valid multi-city request (3 well-formed segments) is accepted and reaches searchFlights', async () => {
    ;(searchFlights as jest.Mock).mockResolvedValue([])
    const res = await flightsPOST(req({
      trip: 'multi-city', cabin: 'economy', adults: 1,
      segments: [seg('LOS', 'DXB', '2026-11-01'), seg('DXB', 'LHR', '2026-11-05'), seg('LHR', 'LOS', '2026-11-10')],
    }))
    expect(res.status).toBe(200)
    expect(searchFlights).toHaveBeenCalledTimes(1)
    const params = (searchFlights as jest.Mock).mock.calls[0][0]
    expect(params.legs).toHaveLength(3)
  })

  it('exactly 5 segments (the UI maximum) is accepted', async () => {
    ;(searchFlights as jest.Mock).mockResolvedValue([])
    const segments = [
      seg('LOS', 'DXB', '2026-11-01'), seg('DXB', 'LHR', '2026-11-03'), seg('LHR', 'CDG', '2026-11-05'),
      seg('CDG', 'JFK', '2026-11-07'), seg('JFK', 'LOS', '2026-11-10'),
    ]
    const res = await flightsPOST(req({ trip: 'multi-city', cabin: 'economy', adults: 1, segments }))
    expect(res.status).toBe(200)
    expect(searchFlights).toHaveBeenCalledTimes(1)
  })

  it('6 segments (one over the maximum) is rejected with a controlled 400, and Duffel is never called', async () => {
    const segments = [
      seg('LOS', 'DXB', '2026-11-01'), seg('DXB', 'LHR', '2026-11-03'), seg('LHR', 'CDG', '2026-11-05'),
      seg('CDG', 'JFK', '2026-11-07'), seg('JFK', 'SYD', '2026-11-09'), seg('SYD', 'LOS', '2026-11-12'),
    ]
    const res = await flightsPOST(req({ trip: 'multi-city', cabin: 'economy', adults: 1, segments }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/maximum of 5/i)
    expect(searchFlights).not.toHaveBeenCalled()
  })

  it('fewer than 2 segments is rejected (multi-city requires at least 2)', async () => {
    const res = await flightsPOST(req({ trip: 'multi-city', cabin: 'economy', adults: 1, segments: [seg('LOS', 'DXB', '2026-11-01')] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/at least 2/i)
    expect(searchFlights).not.toHaveBeenCalled()
  })

  it('a missing segments array is rejected', async () => {
    const res = await flightsPOST(req({ trip: 'multi-city', cabin: 'economy', adults: 1 }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/segments array/i)
    expect(searchFlights).not.toHaveBeenCalled()
  })

  it('a segment with an invalid (non-3-letter) airport code is rejected', async () => {
    const res = await flightsPOST(req({
      trip: 'multi-city', cabin: 'economy', adults: 1,
      segments: [seg('LOS', 'DXB', '2026-11-01'), seg('DUBAI', 'LHR', '2026-11-05')],
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Segment 2.*"from"/i)
    expect(searchFlights).not.toHaveBeenCalled()
  })

  it('a segment with a missing/empty "to" field is rejected', async () => {
    const res = await flightsPOST(req({
      trip: 'multi-city', cabin: 'economy', adults: 1,
      segments: [seg('LOS', 'DXB', '2026-11-01'), { from: 'DXB', to: '', date: '2026-11-05' }],
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Segment 2.*"to"/i)
    expect(searchFlights).not.toHaveBeenCalled()
  })

  it('a segment with a malformed date is rejected', async () => {
    const res = await flightsPOST(req({
      trip: 'multi-city', cabin: 'economy', adults: 1,
      segments: [seg('LOS', 'DXB', '2026-11-01'), seg('DXB', 'LHR', 'not-a-date')],
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Segment 2.*departure date/i)
    expect(searchFlights).not.toHaveBeenCalled()
  })

  it('a segment that is not an object at all is rejected without throwing', async () => {
    const res = await flightsPOST(req({
      trip: 'multi-city', cabin: 'economy', adults: 1,
      segments: [seg('LOS', 'DXB', '2026-11-01'), null],
    }))
    expect(res.status).toBe(400)
    expect(searchFlights).not.toHaveBeenCalled()
  })

  it('one-way requests are completely unaffected by the new multi-city validation', async () => {
    ;(searchFlights as jest.Mock).mockResolvedValue([])
    const res = await flightsPOST(req({ from: 'LHR', to: 'JFK', depart: '2026-11-01', trip: 'one-way', cabin: 'economy', adults: 1 }))
    expect(res.status).toBe(200)
    expect(searchFlights).toHaveBeenCalledTimes(1)
    const params = (searchFlights as jest.Mock).mock.calls[0][0]
    expect(params.legs).toHaveLength(1)
  })

  it('round-trip requests are completely unaffected by the new multi-city validation', async () => {
    ;(searchFlights as jest.Mock).mockResolvedValue([])
    const res = await flightsPOST(req({ from: 'LHR', to: 'JFK', depart: '2026-11-01', return: '2026-11-10', trip: 'round-trip', cabin: 'economy', adults: 1 }))
    expect(res.status).toBe(200)
    expect(searchFlights).toHaveBeenCalledTimes(1)
    const params = (searchFlights as jest.Mock).mock.calls[0][0]
    expect(params.legs).toHaveLength(2)
  })
})

describe('POST /api/admin/travel-search/transfers — error handling', () => {
  const TRANSFER_BODY = {
    pickupType: 'IATA', pickupCode: 'DXB', dropoffType: 'HOTEL', dropoffCode: 'H123',
    transferDate: '2026-10-01', adults: 2,
  }

  it('a Hotelbeds 403 "disallowed" error produces a clean, classified 503 response (not a crash)', async () => {
    ;(hotelbedsRequest as jest.Mock).mockRejectedValue(
      new Error('Hotelbeds transfers POST /transfers/availability → 403: {"error":{"message":"Access to this API has been disallowed"}}')
    )

    const res = await transfersPOST(req(TRANSFER_BODY))
    expect(res.status).toBe(503)

    const json = await res.json()
    expect(json.code).toBe('TRANSFER_UNAVAILABLE')
    expect(json.error).toMatch(/unavailable/i)
  })

  it('a generic/network failure produces a 500 with an actionable, non-crashing error body', async () => {
    ;(hotelbedsRequest as jest.Mock).mockRejectedValue(new Error('timed out after 12000ms'))

    const res = await transfersPOST(req(TRANSFER_BODY))
    expect(res.status).toBe(500)

    const json = await res.json()
    expect(json.error).toBe('Transfer search failed. Please try again.')
  })

  it('happy path (successful Hotelbeds search) is unaffected by the added try/catch', async () => {
    ;(hotelbedsRequest as jest.Mock).mockResolvedValue({
      transfers: [{
        id: 't1', name: 'Airport Transfer', type: 'PRIVATE',
        categories: [{
          name: 'Standard',
          vehicles: [{ rateKey: 'rk1', description: 'Sedan', maxPax: 3, prices: [{ totalNet: '45.00', currency: 'GBP' }] }],
        }],
      }],
    })

    const res = await transfersPOST(req(TRANSFER_BODY))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.provider).toBe('hotelbeds')
    expect(json.totalOffers).toBe(1)
    expect(json.offers[0].providerRateKey).toBe('rk1')
  })
})
