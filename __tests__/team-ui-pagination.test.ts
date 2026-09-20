/**
 * Walz Team Hub V1 UI — cursor-pagination merge/de-duplication
 * (lib/pagination.ts), used by useTeamMessages.ts for older-page prepends
 * and the realtime/poll safety net's "refetch the latest window and
 * reconcile" behavior.
 */
import { mergeOlderPage, mergeLatestBatch, upsertMessage, removeMessage } from '@/app/admin/team/lib/pagination'

interface Item { id: string; createdAt: string }

describe('mergeOlderPage', () => {
  it('prepends an older page in front of the existing list', () => {
    const existing: Item[] = [{ id: '3', createdAt: '3' }, { id: '4', createdAt: '4' }]
    const older: Item[] = [{ id: '1', createdAt: '1' }, { id: '2', createdAt: '2' }]
    expect(mergeOlderPage(existing, older).map(m => m.id)).toEqual(['1', '2', '3', '4'])
  })

  it('drops any id from the older page that is already loaded (overlapping cursor boundary)', () => {
    const existing: Item[] = [{ id: '2', createdAt: '2' }, { id: '3', createdAt: '3' }]
    const older: Item[] = [{ id: '1', createdAt: '1' }, { id: '2', createdAt: '2' }] // '2' overlaps
    expect(mergeOlderPage(existing, older).map(m => m.id)).toEqual(['1', '2', '3'])
  })

  it('returns the existing list unchanged when the older page is empty', () => {
    const existing: Item[] = [{ id: '1', createdAt: '1' }]
    expect(mergeOlderPage(existing, [])).toEqual(existing)
  })
})

describe('mergeLatestBatch', () => {
  it('appends a genuinely new message from the latest-window refetch', () => {
    const existing: Item[] = [{ id: '1', createdAt: '2026-01-01T00:00:00Z' }]
    const latest: Item[] = [{ id: '1', createdAt: '2026-01-01T00:00:00Z' }, { id: '2', createdAt: '2026-01-01T00:01:00Z' }]
    const merged = mergeLatestBatch(existing, latest)
    expect(merged.map(m => m.id)).toEqual(['1', '2'])
  })

  it('upserts an already-loaded message (e.g. an edit, a delete tombstone, or a reaction change)', () => {
    const existing = [{ id: '1', createdAt: '2026-01-01T00:00:00Z', body: 'original' }]
    const latest = [{ id: '1', createdAt: '2026-01-01T00:00:00Z', body: 'edited' }]
    const merged = mergeLatestBatch(existing, latest)
    expect(merged).toHaveLength(1)
    expect(merged[0].body).toBe('edited')
  })

  it('re-sorts chronologically even if the latest batch arrives out of order', () => {
    const existing: Item[] = []
    const latest: Item[] = [
      { id: '2', createdAt: '2026-01-01T00:02:00Z' },
      { id: '1', createdAt: '2026-01-01T00:01:00Z' },
    ]
    expect(mergeLatestBatch(existing, latest).map(m => m.id)).toEqual(['1', '2'])
  })

  it('never duplicates a message present in both existing and latest', () => {
    const existing: Item[] = [{ id: '1', createdAt: '2026-01-01T00:00:00Z' }]
    const latest: Item[] = [{ id: '1', createdAt: '2026-01-01T00:00:00Z' }]
    expect(mergeLatestBatch(existing, latest)).toHaveLength(1)
  })
})

describe('upsertMessage / removeMessage', () => {
  it('upsertMessage replaces an existing message by id', () => {
    const existing: Item[] = [{ id: '1', createdAt: 'a' }]
    const result = upsertMessage(existing, { id: '1', createdAt: 'b' })
    expect(result).toEqual([{ id: '1', createdAt: 'b' }])
  })

  it('upsertMessage appends when the id is not already present (optimistic-send reconciliation)', () => {
    const existing: Item[] = [{ id: '1', createdAt: 'a' }]
    const result = upsertMessage(existing, { id: '2', createdAt: 'b' })
    expect(result.map(m => m.id)).toEqual(['1', '2'])
  })

  it('removeMessage drops a message by id (failed optimistic-send rollback)', () => {
    const existing: Item[] = [{ id: '1', createdAt: 'a' }, { id: '2', createdAt: 'b' }]
    expect(removeMessage(existing, '1').map(m => m.id)).toEqual(['2'])
  })
})
