/**
 * Agent B — Activity supplier ordering.
 *
 * lib/activities/index.ts's searchActivities() used to just concatenate
 * [...hbActivities, ...viatorActivities] before deduping, so Hotelbeds
 * results always sorted first regardless of relevance/quality. The fix
 * stably partitions the deduplicated result so every VIATOR item precedes
 * every HOTELBEDS item, without reshuffling either supplier's own internal
 * order (a partition, not a re-sort) and without touching dedup logic.
 */

const mockHbSearch = jest.fn()
const mockViatorSearch = jest.fn()

jest.mock('@/lib/activities/providers/hotelbeds', () => ({
  HotelbedsActivityProvider: jest.fn().mockImplementation(() => ({ search: mockHbSearch })),
}))
jest.mock('@/lib/activities/providers/viator', () => ({
  ViatorActivityProvider: jest.fn().mockImplementation(() => ({ search: mockViatorSearch })),
}))

import { searchActivities } from '@/lib/activities'
import type { NormalizedActivity } from '@/lib/activities/types'

const OLD_ENV = process.env

function hb(id: string, title: string): NormalizedActivity {
  return {
    id: `HOTELBEDS-${id}`,
    supplier: 'HOTELBEDS',
    supplierProductId: id,
    slug: `hb-${id}`,
    title,
    images: [],
    freeCancellation: false,
    currency: 'GBP',
    sellingPrice: 100,
    source: 'hotelbeds',
  }
}

function viator(id: string, title: string): NormalizedActivity {
  return {
    id: `VIATOR-${id}`,
    supplier: 'VIATOR',
    supplierProductId: id,
    slug: `viator-${id}`,
    title,
    images: [],
    freeCancellation: false,
    currency: 'GBP',
    sellingPrice: 120,
    source: 'viator',
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env = {
    ...OLD_ENV,
    VIATOR_ACTIVITIES_ENABLED: 'true',
    VIATOR_API_KEY: 'test-key',
    VIATOR_CUSTOMER_SEARCH_ENABLED: 'true',
  }
})

afterAll(() => {
  process.env = OLD_ENV
})

describe('searchActivities — Viator-first ordering', () => {
  it('places every Viator result before every Hotelbeds result', async () => {
    mockHbSearch.mockResolvedValue([hb('1', 'Hotelbeds Desert Safari'), hb('2', 'Hotelbeds City Tour')])
    mockViatorSearch.mockResolvedValue([viator('a', 'Viator Dhow Cruise'), viator('b', 'Viator Skydive')])

    const result = await searchActivities({ destination: 'Dubai', adults: 2 })

    expect(result.activities).toHaveLength(4)
    const suppliers = result.activities.map(a => a.supplier)
    expect(suppliers).toEqual(['VIATOR', 'VIATOR', 'HOTELBEDS', 'HOTELBEDS'])
  })

  it("preserves each supplier's own internal relative order (stable partition, not a re-sort)", async () => {
    mockHbSearch.mockResolvedValue([
      hb('1', 'Hotelbeds Alpha'),
      hb('2', 'Hotelbeds Beta'),
      hb('3', 'Hotelbeds Gamma'),
    ])
    mockViatorSearch.mockResolvedValue([
      viator('x', 'Viator One'),
      viator('y', 'Viator Two'),
      viator('z', 'Viator Three'),
    ])

    const result = await searchActivities({ destination: 'Dubai', adults: 2 })

    expect(result.activities.map(a => a.id)).toEqual([
      'VIATOR-x', 'VIATOR-y', 'VIATOR-z',
      'HOTELBEDS-1', 'HOTELBEDS-2', 'HOTELBEDS-3',
    ])
  })

  it('does not disturb dedup logic — a title-duplicate Viator entry is still removed, ordering only reorders what dedup leaves behind', async () => {
    mockHbSearch.mockResolvedValue([hb('1', 'Same Tour Name')])
    mockViatorSearch.mockResolvedValue([viator('a', 'Same Tour Name'), viator('b', 'Distinct Viator Tour')])

    const result = await searchActivities({ destination: 'Dubai', adults: 2 })

    expect(result.activities.map(a => a.id)).toEqual(['VIATOR-b', 'HOTELBEDS-1'])
  })

  it('when Viator is disabled/unavailable, Hotelbeds-only results are returned unaffected', async () => {
    process.env.VIATOR_CUSTOMER_SEARCH_ENABLED = 'false'
    mockHbSearch.mockResolvedValue([hb('1', 'Hotelbeds Only Tour')])

    const result = await searchActivities({ destination: 'Dubai', adults: 2 })

    expect(result.activities.map(a => a.id)).toEqual(['HOTELBEDS-1'])
    expect(mockViatorSearch).not.toHaveBeenCalled()
  })
})
