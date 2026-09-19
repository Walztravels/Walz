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
