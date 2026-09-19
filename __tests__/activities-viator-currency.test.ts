/**
 * Agent B — Viator provider currency forwarding.
 *
 * ViatorActivityProvider already used `params.currency ?? 'GBP'` internally
 * — this confirms that behavior end to end: a currency passed into
 * .search() reaches the actual Viator API call body, and the GBP default
 * still applies (backward compatible) when no currency is supplied.
 */

const mockViatorPost = jest.fn()
const mockViatorGet = jest.fn()

jest.mock('@/lib/activities/providers/viator/client', () => ({
  viatorPost: (...args: unknown[]) => mockViatorPost(...args),
  viatorGet: (...args: unknown[]) => mockViatorGet(...args),
}))

import { ViatorActivityProvider } from '@/lib/activities/providers/viator'

beforeEach(() => {
  jest.clearAllMocks()
  mockViatorPost.mockResolvedValue({ status: 200, data: { products: [], totalCount: 0 } })
})

describe('ViatorActivityProvider — currency forwarding', () => {
  it('sends the caller-supplied currency to Viator /products/search (destination browse)', async () => {
    const provider = new ViatorActivityProvider()
    await provider.search({ destination: 'London', adults: 2, currency: 'USD' })
    expect(mockViatorPost).toHaveBeenCalledWith(
      '/products/search',
      expect.objectContaining({ currency: 'USD' }),
    )
  })

  it('falls back to GBP when no currency is supplied — backward compatible with any other caller', async () => {
    const provider = new ViatorActivityProvider()
    await provider.search({ destination: 'London', adults: 2 })
    expect(mockViatorPost).toHaveBeenCalledWith(
      '/products/search',
      expect.objectContaining({ currency: 'GBP' }),
    )
  })

  it('sends the caller-supplied currency to Viator /search/freetext (keyword search)', async () => {
    const provider = new ViatorActivityProvider()
    await provider.search({ destination: 'London', adults: 2, currency: 'EUR', keyword: 'museum' })
    expect(mockViatorPost).toHaveBeenCalledWith(
      '/search/freetext',
      expect.objectContaining({ currency: 'EUR' }),
    )
  })
})
