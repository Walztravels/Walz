/**
 * Agent B — Hotelbeds provider honest currency reporting.
 *
 * Hotelbeds' Activities API (unlike its Hotel API, which accepts a top-level
 * `currency` field on POST /hotels) has no currency-selection parameter on
 * its activities search/pricing endpoints — so no conversion is attempted.
 * Instead, HotelbedsActivityProvider must report whatever currency
 * Hotelbeds' own response data actually carries (checking the field
 * sibling to whichever price field was used, not just a top-level
 * `.currency`), rather than silently defaulting the label to a guess.
 */

const mockHotelbedsRequest = jest.fn()

jest.mock('@/lib/hotelbeds', () => ({
  hotelbedsRequest: (...args: unknown[]) => mockHotelbedsRequest(...args),
}))

import { HotelbedsActivityProvider } from '@/lib/activities/providers/hotelbeds'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('HotelbedsActivityProvider — honest currency reporting', () => {
  it('reports the currency actually present alongside the price field (amountsFrom sibling), not a guessed default', async () => {
    mockHotelbedsRequest.mockImplementation(async (api: string) => {
      if (api === 'activities-cache') {
        return { activities: [{ code: '123', name: 'City Tour', amountsFrom: [{ amount: 40, currency: 'EUR' }] }] }
      }
      if (api === 'activities') return { activities: [] } // no live price found for this item
      return {}
    })

    const provider = new HotelbedsActivityProvider()
    const result = await provider.search({ destination: 'Dubai', adults: 2 })

    expect(result).toHaveLength(1)
    expect(result[0].currency).toBe('EUR')
  })

  it('falls back to a placeholder only when Hotelbeds sends no currency anywhere in the payload', async () => {
    mockHotelbedsRequest.mockImplementation(async (api: string) => {
      if (api === 'activities-cache') {
        return { activities: [{ code: '456', name: 'No Currency Tour', amountFrom: 40 }] }
      }
      if (api === 'activities') return { activities: [] }
      return {}
    })

    const provider = new HotelbedsActivityProvider()
    const result = await provider.search({ destination: 'Dubai', adults: 2 })

    expect(result[0].currency).toBe('USD')
  })

  it('lets the authoritative live-price step override the cache-stage guess with its own honest currency', async () => {
    mockHotelbedsRequest.mockImplementation(async (api: string) => {
      if (api === 'activities-cache') {
        return { activities: [{ code: '789', name: 'Live Priced Tour', amountFrom: 40, currency: 'EUR' }] }
      }
      if (api === 'activities') {
        return { activities: [{ code: '789', amountFrom: 55, currency: 'AED' }] }
      }
      return {}
    })

    const provider = new HotelbedsActivityProvider()
    const result = await provider.search({ destination: 'Dubai', adults: 2 })

    expect(result[0].currency).toBe('AED')
    expect(result[0].supplierNetPrice).toBe(55)
  })

  it("never sends a currency field to Hotelbeds' own activities requests — their API doesn't support requesting one", async () => {
    mockHotelbedsRequest.mockImplementation(async (api: string) => {
      if (api === 'activities-cache') return { activities: [] }
      return {}
    })

    const provider = new HotelbedsActivityProvider()
    await provider.search({ destination: 'Dubai', adults: 2, currency: 'USD' })

    for (const call of mockHotelbedsRequest.mock.calls) {
      const opts = call[2] as { body?: unknown } | undefined
      if (opts?.body) {
        expect(JSON.stringify(opts.body)).not.toContain('"currency"')
      }
    }
  })
})
