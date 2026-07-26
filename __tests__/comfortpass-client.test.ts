import { unwrapList } from '@/lib/concierge/suppliers/comfortpass/client'

interface Item { id: string }

describe('unwrapList', () => {
  it('returns a bare array as-is', () => {
    const arr: Item[] = [{ id: 'a' }, { id: 'b' }]
    expect(unwrapList<Item>(arr, 'items')).toEqual(arr)
  })

  it('extracts from a preferred named key', () => {
    const payload = { airports: [{ id: 'x' }] }
    expect(unwrapList<Item>(payload, 'airports')).toEqual([{ id: 'x' }])
  })

  it('falls back to generic "data" key', () => {
    const payload = { data: [{ id: 'y' }] }
    expect(unwrapList<Item>(payload, 'airports')).toEqual([{ id: 'y' }])
  })

  it('falls back to generic "results" key', () => {
    const payload = { results: [{ id: 'z' }] }
    expect(unwrapList<Item>(payload, 'airports')).toEqual([{ id: 'z' }])
  })

  it('finds the preferred key one level deep', () => {
    const payload = { data: { airports: [{ id: 'nested' }] } }
    expect(unwrapList<Item>(payload, 'airports')).toEqual([{ id: 'nested' }])
  })

  it('returns empty array for a genuinely empty response', () => {
    expect(unwrapList<Item>({}, 'airports')).toEqual([])
  })

  it('returns empty array for null', () => {
    expect(unwrapList<Item>(null, 'airports')).toEqual([])
  })

  it('checks preferred keys before generic fallbacks', () => {
    // Both 'services' (preferred) and 'data' (generic) present — preferred wins
    const payload = { services: [{ id: 'svc' }], data: [{ id: 'dat' }] }
    expect(unwrapList<Item>(payload, 'services')).toEqual([{ id: 'svc' }])
  })

  it('checks multiple preferred keys in order', () => {
    // 'packages' second preferred key; 'services' key absent
    const payload = { packages: [{ id: 'pkg' }] }
    expect(unwrapList<Item>(payload, 'services', 'packages')).toEqual([{ id: 'pkg' }])
  })
})
