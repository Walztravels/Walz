/**
 * @jest-environment jsdom
 *
 * "Prepare Client Reply" cross-product handoff — sessionStorage bridge
 * between Team Hub and the Inbox composer. Never trusted as
 * authorization (see file header); consumed exactly once; stale entries
 * are discarded.
 */
import { writePendingClientDraft, consumePendingClientDraft } from '@/lib/team/client-reply-handoff'

describe('client-reply-handoff', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    jest.restoreAllMocks()
  })

  it('round-trips a written draft', () => {
    writePendingClientDraft('42', 'Hello from Team Hub')
    expect(consumePendingClientDraft('42')).toBe('Hello from Team Hub')
  })

  it('is consumed exactly once — a second read after consumption returns null', () => {
    writePendingClientDraft('42', 'Hello')
    consumePendingClientDraft('42')
    expect(consumePendingClientDraft('42')).toBeNull()
  })

  it('does not leak across different conversation ids', () => {
    writePendingClientDraft('42', 'For 42')
    expect(consumePendingClientDraft('99')).toBeNull()
    expect(consumePendingClientDraft('42')).toBe('For 42') // untouched by the miss above
  })

  it('discards a stale draft (older than 15 minutes)', () => {
    const now = Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(now)
    writePendingClientDraft('42', 'Old draft')
    jest.spyOn(Date, 'now').mockReturnValue(now + 16 * 60 * 1000)
    expect(consumePendingClientDraft('42')).toBeNull()
  })

  it('returns null when nothing was written', () => {
    expect(consumePendingClientDraft('nope')).toBeNull()
  })

  it('returns null for malformed JSON without throwing', () => {
    window.sessionStorage.setItem('teamhub:pendingClientDraft:42', 'not json')
    expect(() => consumePendingClientDraft('42')).not.toThrow()
    expect(consumePendingClientDraft('42')).toBeNull()
  })
})
