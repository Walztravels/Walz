/**
 * Walz Team Hub V1 UI — grouped-by-sender collapsing (lib/messageGrouping.ts).
 * GROUP/CHANNEL conversations collapse consecutive same-author messages
 * within a short time window under one header; DMs never call this
 * (bubble mode instead) but the function itself is conversation-type-agnostic.
 */
import { groupMessagesBySender, DEFAULT_GROUPING_WINDOW_MS, type GroupableMessage } from '@/app/admin/team/lib/messageGrouping'

function msg(id: string, authorId: string, createdAt: string): GroupableMessage {
  return { id, authorId, createdAt }
}

describe('groupMessagesBySender', () => {
  it('collapses consecutive same-author messages into one group', () => {
    const groups = groupMessagesBySender([
      msg('1', 'A', '2026-01-01T10:00:00Z'),
      msg('2', 'A', '2026-01-01T10:00:30Z'),
      msg('3', 'A', '2026-01-01T10:01:00Z'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].authorId).toBe('A')
    expect(groups[0].messages.map(m => m.id)).toEqual(['1', '2', '3'])
  })

  it('starts a new group when the author changes', () => {
    const groups = groupMessagesBySender([
      msg('1', 'A', '2026-01-01T10:00:00Z'),
      msg('2', 'B', '2026-01-01T10:00:05Z'),
      msg('3', 'A', '2026-01-01T10:00:10Z'),
    ])
    expect(groups).toHaveLength(3)
    expect(groups.map(g => g.authorId)).toEqual(['A', 'B', 'A'])
  })

  it('starts a new group when the same author posts again after the window elapses', () => {
    const groups = groupMessagesBySender(
      [
        msg('1', 'A', '2026-01-01T10:00:00.000Z'),
        msg('2', 'A', '2026-01-01T10:06:00.000Z'), // 6 minutes later — beyond the default 5-minute window
      ],
      DEFAULT_GROUPING_WINDOW_MS,
    )
    expect(groups).toHaveLength(2)
  })

  it('keeps same-author messages together right at the window boundary', () => {
    const groups = groupMessagesBySender([
      msg('1', 'A', '2026-01-01T10:00:00.000Z'),
      msg('2', 'A', '2026-01-01T10:05:00.000Z'), // exactly 5 minutes — inclusive boundary
    ])
    expect(groups).toHaveLength(1)
  })

  it('returns an empty array for an empty input', () => {
    expect(groupMessagesBySender([])).toEqual([])
  })

  it('handles a single message as its own group', () => {
    const groups = groupMessagesBySender([msg('1', 'A', '2026-01-01T10:00:00Z')])
    expect(groups).toHaveLength(1)
    expect(groups[0].messages).toHaveLength(1)
  })

  it('respects a custom window size', () => {
    const groups = groupMessagesBySender(
      [
        msg('1', 'A', '2026-01-01T10:00:00.000Z'),
        msg('2', 'A', '2026-01-01T10:00:30.000Z'),
      ],
      10_000, // 10 seconds — the 30s gap above exceeds it
    )
    expect(groups).toHaveLength(2)
  })
})
