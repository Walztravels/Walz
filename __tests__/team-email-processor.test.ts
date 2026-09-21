/**
 * Walz Team Hub V1.1 — lib/team/email-processor.ts (the cron processor).
 *
 * Uses a small in-memory candidate store behind the Prisma mock so the
 * status transitions (PENDING → SENDING → SENT/CANCELLED/FAILED) are real,
 * which is what makes the idempotency and cooldown assertions meaningful
 * rather than assertions about call arguments.
 */

const mockSendTeamHubEmail = jest.fn()
jest.mock('@/lib/email-team-notification', () => ({
  __esModule: true,
  sendTeamHubEmail: (...args: unknown[]) => mockSendTeamHubEmail(...args),
}))

interface StoredCandidate {
  id: string
  staffId: string
  kind: string
  conversationId: string
  sourceId: string
  actorName: string | null
  status: string
  scheduledSendAt: Date
  eventAt: Date
  attempts: number
  sentAt: Date | null
  resolvedAt: Date | null
  cancelReason: string | null
}

let store: StoredCandidate[] = []

function matches(row: StoredCandidate, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const value = (row as unknown as Record<string, unknown>)[key]
    if (cond && typeof cond === 'object') {
      const c = cond as Record<string, unknown>
      if ('in' in c && !(c.in as unknown[]).includes(value)) return false
      if ('lte' in c && !(value instanceof Date && value <= (c.lte as Date))) return false
      if ('gte' in c && !(value instanceof Date && value >= (c.gte as Date))) return false
    } else if (value !== cond) {
      return false
    }
  }
  return true
}

const mockPrisma = {
  teamEmailNotificationCandidate: {
    findMany: jest.fn(async (args: { where: Record<string, unknown>; take?: number; distinct?: string[] }) => {
      let rows = store.filter(r => matches(r, args.where))
      rows = [...rows].sort((a, b) => a.scheduledSendAt.getTime() - b.scheduledSendAt.getTime())
      if (args.distinct?.includes('staffId')) {
        const seen = new Set<string>()
        rows = rows.filter(r => (seen.has(r.staffId) ? false : (seen.add(r.staffId), true)))
      }
      if (args.take) rows = rows.slice(0, args.take)
      return rows.map(r => ({ ...r }))
    }),
    updateMany: jest.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const rows = store.filter(r => matches(r, args.where))
      for (const row of rows) {
        for (const [key, value] of Object.entries(args.data)) {
          if (value && typeof value === 'object' && 'increment' in (value as Record<string, unknown>)) {
            ;(row as unknown as Record<string, number>)[key] += (value as { increment: number }).increment
          } else {
            ;(row as unknown as Record<string, unknown>)[key] = value
          }
        }
      }
      return { count: rows.length }
    }),
  },
  teamEmailNotificationPreference: { findMany: jest.fn() },
  staff: { findMany: jest.fn() },
  teamConversation: { findMany: jest.fn() },
  teamConversationMember: { findMany: jest.fn() },
  teamMessage: { findMany: jest.fn() },
  teamCallRecord: { findMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import {
  processTeamEmailNotifications,
  composeEventTitle,
  EMAIL_COOLDOWN_MS,
  MAX_SEND_ATTEMPTS,
} from '@/lib/team/email-processor'

const NOW = new Date('2026-09-21T12:00:00.000Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)
const minutesAhead = (m: number) => new Date(NOW.getTime() + m * 60_000)

function candidate(over: Partial<StoredCandidate> = {}): StoredCandidate {
  return {
    id: 'cand-1', staffId: 's1', kind: 'MENTION', conversationId: 'conv-1', sourceId: 'msg-1',
    actorName: 'Ada', status: 'PENDING', scheduledSendAt: minutesAgo(1), eventAt: minutesAgo(4),
    attempts: 0, sentAt: null, resolvedAt: null, cancelReason: null, ...over,
  }
}

function byId(id: string): StoredCandidate {
  const row = store.find(r => r.id === id)
  if (!row) throw new Error(`no candidate ${id}`)
  return row
}

beforeEach(() => {
  jest.clearAllMocks()
  store = []
  mockSendTeamHubEmail.mockResolvedValue(true)
  mockPrisma.teamEmailNotificationPreference.findMany.mockResolvedValue([])
  mockPrisma.staff.findMany.mockResolvedValue([
    { id: 's1', name: 'Joe', email: 'joe@walztravels.com', isActive: true },
    { id: 's2', name: 'Pat', email: 'pat@walztravels.com', isActive: true },
  ])
  mockPrisma.teamConversation.findMany.mockResolvedValue([
    { id: 'conv-1', type: 'CHANNEL', name: '#reservations' },
    { id: 'dm-1', type: 'DM', name: null },
  ])
  mockPrisma.teamConversationMember.findMany.mockResolvedValue([
    { conversationId: 'conv-1', staffId: 's1', lastReadAt: minutesAgo(30) },
    { conversationId: 'conv-1', staffId: 's2', lastReadAt: null },
    { conversationId: 'dm-1', staffId: 's1', lastReadAt: minutesAgo(30) },
  ])
  mockPrisma.teamMessage.findMany.mockResolvedValue([
    { id: 'msg-1', conversationId: 'conv-1', body: 'can you check this booking?', createdAt: minutesAgo(4), deletedAt: null, author: { name: 'Ada' } },
    { id: 'msg-2', conversationId: 'conv-1', body: 'and this one too', createdAt: minutesAgo(3), deletedAt: null, author: { name: 'Ada' } },
    { id: 'msg-3', conversationId: 'dm-1', body: 'morning!', createdAt: minutesAgo(3), deletedAt: null, author: { name: 'Bo' } },
  ])
  mockPrisma.teamCallRecord.findMany.mockResolvedValue([
    { id: 'call-1', status: 'MISSED', caller: { name: 'Bo' } },
  ])
  jest.spyOn(console, 'info').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('debounce window', () => {
  it('only processes candidates whose debounce window has elapsed', async () => {
    store = [candidate({ id: 'due', scheduledSendAt: minutesAgo(1) }), candidate({ id: 'early', sourceId: 'msg-2', scheduledSendAt: minutesAhead(2) })]
    const summary = await processTeamEmailNotifications(NOW)

    expect(summary.scanned).toBe(1)
    expect(mockSendTeamHubEmail).toHaveBeenCalledTimes(1)
    expect(mockSendTeamHubEmail.mock.calls[0][0].events).toHaveLength(1)
    expect(byId('due').status).toBe('SENT')
    expect(byId('early').status).toBe('PENDING') // untouched — it is not due yet
  })
})

describe('re-checks at send time', () => {
  it('cancels a candidate whose message was deleted', async () => {
    mockPrisma.teamMessage.findMany.mockResolvedValue([
      { id: 'msg-1', conversationId: 'conv-1', body: 'gone', createdAt: minutesAgo(4), deletedAt: minutesAgo(2), author: { name: 'Ada' } },
    ])
    store = [candidate()]
    const summary = await processTeamEmailNotifications(NOW)
    expect(mockSendTeamHubEmail).not.toHaveBeenCalled()
    expect(byId('cand-1')).toMatchObject({ status: 'CANCELLED', cancelReason: 'message_deleted' })
    expect(summary.candidatesCancelled).toBe(1)
  })

  it('cancels a candidate the recipient has already read (lastReadAt is the source of truth)', async () => {
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([
      { conversationId: 'conv-1', staffId: 's1', lastReadAt: minutesAgo(2) }, // read AFTER the message
    ])
    store = [candidate()]
    await processTeamEmailNotifications(NOW)
    expect(mockSendTeamHubEmail).not.toHaveBeenCalled()
    expect(byId('cand-1')).toMatchObject({ status: 'CANCELLED', cancelReason: 'already_read' })
  })

  it('cancels a candidate for someone who has left the conversation', async () => {
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([])
    store = [candidate()]
    await processTeamEmailNotifications(NOW)
    expect(mockSendTeamHubEmail).not.toHaveBeenCalled()
    expect(byId('cand-1')).toMatchObject({ status: 'CANCELLED', cancelReason: 'not_member' })
  })

  it('cancels a missed-call candidate whose call no longer shows MISSED', async () => {
    mockPrisma.teamCallRecord.findMany.mockResolvedValue([{ id: 'call-1', status: 'ANSWERED', caller: { name: 'Bo' } }])
    store = [candidate({ kind: 'MISSED_CALL', sourceId: 'call-1', conversationId: 'dm-1' })]
    await processTeamEmailNotifications(NOW)
    expect(mockSendTeamHubEmail).not.toHaveBeenCalled()
    expect(byId('cand-1')).toMatchObject({ status: 'CANCELLED', cancelReason: 'call_not_missed' })
  })

  it('sends a missed-call candidate whose call still shows MISSED (actor falls back to the live caller)', async () => {
    store = [candidate({ kind: 'MISSED_CALL', sourceId: 'call-1', conversationId: 'dm-1', actorName: null })]
    await processTeamEmailNotifications(NOW)
    expect(mockSendTeamHubEmail).toHaveBeenCalledTimes(1)
    expect(mockSendTeamHubEmail.mock.calls[0][0].events[0]).toMatchObject({ kind: 'MISSED_CALL', title: 'Missed call from Bo' })
  })

  it('cancels a candidate for a deactivated staff member', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([{ id: 's1', name: 'Joe', email: 'joe@walztravels.com', isActive: false }])
    store = [candidate()]
    await processTeamEmailNotifications(NOW)
    expect(mockSendTeamHubEmail).not.toHaveBeenCalled()
    expect(byId('cand-1')).toMatchObject({ status: 'CANCELLED', cancelReason: 'staff_inactive' })
  })

  it('cancels a candidate whose category preference was switched off after it was scheduled', async () => {
    mockPrisma.teamEmailNotificationPreference.findMany.mockResolvedValue([
      { staffId: 's1', directMessages: true, mentionsAndThreads: false, missedCalls: true, invites: true },
    ])
    store = [candidate()]
    await processTeamEmailNotifications(NOW)
    expect(mockSendTeamHubEmail).not.toHaveBeenCalled()
    expect(byId('cand-1')).toMatchObject({ status: 'CANCELLED', cancelReason: 'preference_off' })
  })
})

describe('batching', () => {
  it('collapses every still-valid candidate for one staff member into ONE email', async () => {
    store = [
      candidate({ id: 'c1', sourceId: 'msg-1', eventAt: minutesAgo(5) }),
      candidate({ id: 'c2', sourceId: 'msg-2', eventAt: minutesAgo(4) }),
      candidate({ id: 'c3', kind: 'DM', conversationId: 'dm-1', sourceId: 'msg-3', eventAt: minutesAgo(3) }),
      candidate({ id: 'c4', kind: 'MISSED_CALL', conversationId: 'dm-1', sourceId: 'call-1', eventAt: minutesAgo(2) }),
    ]
    const summary = await processTeamEmailNotifications(NOW)

    expect(mockSendTeamHubEmail).toHaveBeenCalledTimes(1)
    const payload = mockSendTeamHubEmail.mock.calls[0][0]
    expect(payload.staffId).toBe('s1')
    expect(payload.events.map((e: { kind: string }) => e.kind)).toEqual(['MENTION', 'MENTION', 'DM', 'MISSED_CALL'])
    expect(summary.emailsSent).toBe(1)
    expect(summary.candidatesSent).toBe(4)
    expect(store.every(r => r.status === 'SENT')).toBe(true)
  })

  it('sends one email per staff member, never one shared email', async () => {
    store = [
      candidate({ id: 'c1', staffId: 's1' }),
      candidate({ id: 'c2', staffId: 's2' }),
    ]
    const summary = await processTeamEmailNotifications(NOW)
    expect(mockSendTeamHubEmail).toHaveBeenCalledTimes(2)
    expect(mockSendTeamHubEmail.mock.calls.map(c => c[0].staffId).sort()).toEqual(['s1', 's2'])
    expect(summary.emailsSent).toBe(2)
  })
})

describe('mention beats thread reply', () => {
  it('produces exactly one line for a message that is both a mention and a reply to you', async () => {
    store = [
      candidate({ id: 'c-mention', kind: 'MENTION', sourceId: 'msg-1' }),
      candidate({ id: 'c-thread', kind: 'THREAD_REPLY', sourceId: 'msg-1' }),
    ]
    await processTeamEmailNotifications(NOW)
    const payload = mockSendTeamHubEmail.mock.calls[0][0]
    expect(payload.events).toHaveLength(1)
    expect(payload.events[0].kind).toBe('MENTION')
    expect(byId('c-thread')).toMatchObject({ status: 'CANCELLED', cancelReason: 'superseded_by_mention' })
    expect(byId('c-mention').status).toBe('SENT')
  })

  it('keeps a thread reply that belongs to a DIFFERENT message', async () => {
    store = [
      candidate({ id: 'c-mention', kind: 'MENTION', sourceId: 'msg-1' }),
      candidate({ id: 'c-thread', kind: 'THREAD_REPLY', sourceId: 'msg-2' }),
    ]
    await processTeamEmailNotifications(NOW)
    expect(mockSendTeamHubEmail.mock.calls[0][0].events).toHaveLength(2)
  })
})

describe('cooldown', () => {
  it('does not email a staff member again within 15 minutes — the candidates roll into a later tick', async () => {
    store = [
      candidate({ id: 'already', status: 'SENT', sentAt: minutesAgo(5), scheduledSendAt: minutesAgo(8) }),
      candidate({ id: 'fresh', sourceId: 'msg-2' }),
    ]
    const summary = await processTeamEmailNotifications(NOW)

    expect(mockSendTeamHubEmail).not.toHaveBeenCalled()
    expect(summary.staffInCooldown).toBe(1)
    expect(byId('fresh').status).toBe('PENDING') // still queued, not cancelled
  })

  it('emails again once the cooldown has expired', async () => {
    const past = new Date(NOW.getTime() - EMAIL_COOLDOWN_MS - 60_000)
    store = [
      candidate({ id: 'already', status: 'SENT', sentAt: past, scheduledSendAt: past }),
      candidate({ id: 'fresh', sourceId: 'msg-2' }),
    ]
    await processTeamEmailNotifications(NOW)
    expect(mockSendTeamHubEmail).toHaveBeenCalledTimes(1)
    expect(byId('fresh').status).toBe('SENT')
  })
})

describe('idempotency', () => {
  it('running the cron twice over the same data never double-emails', async () => {
    store = [candidate()]
    await processTeamEmailNotifications(NOW)
    expect(mockSendTeamHubEmail).toHaveBeenCalledTimes(1)

    // Immediately again — nothing PENDING, and the cooldown would block anyway.
    const second = await processTeamEmailNotifications(new Date(NOW.getTime() + 1000))
    expect(mockSendTeamHubEmail).toHaveBeenCalledTimes(1)
    expect(second.scanned).toBe(0)
    expect(second.emailsSent).toBe(0)
  })

  it('a candidate claimed by a concurrent run is skipped rather than sent twice', async () => {
    store = [candidate()]
    // Simulate the other invocation winning the claim between the scan and
    // the claim: the row is no longer PENDING when this run tries.
    mockPrisma.teamEmailNotificationCandidate.updateMany.mockImplementationOnce(async () => ({ count: 0 }))
    const summary = await processTeamEmailNotifications(NOW)
    expect(mockSendTeamHubEmail).not.toHaveBeenCalled()
    expect(summary.emailsSent).toBe(0)
  })
})

describe('send failure handling', () => {
  it('requeues with a backoff (never loses the event) when Resend fails', async () => {
    mockSendTeamHubEmail.mockResolvedValue(false)
    store = [candidate()]
    const summary = await processTeamEmailNotifications(NOW)

    const row = byId('cand-1')
    expect(row.status).toBe('PENDING')
    expect(row.attempts).toBe(1)
    expect(row.scheduledSendAt.getTime()).toBeGreaterThan(NOW.getTime())
    expect(summary.candidatesFailed).toBe(0)
  })

  it('parks a candidate as FAILED once the attempt budget is exhausted', async () => {
    mockSendTeamHubEmail.mockResolvedValue(false)
    store = [candidate({ attempts: MAX_SEND_ATTEMPTS - 1 })]
    const summary = await processTeamEmailNotifications(NOW)

    expect(byId('cand-1').status).toBe('FAILED')
    expect(summary.candidatesFailed).toBe(1)
  })
})

describe('composeEventTitle', () => {
  it('words each kind for the email, with a graceful fallback actor', () => {
    expect(composeEventTitle('MENTION', 'Ada', '#reservations')).toBe('Ada mentioned you in #reservations')
    expect(composeEventTitle('THREAD_REPLY', 'Ada', '#reservations')).toBe('Ada replied to your message in #reservations')
    expect(composeEventTitle('DM', 'Bo', null)).toBe('Bo sent you a direct message')
    expect(composeEventTitle('MISSED_CALL', 'Bo', null)).toBe('Missed call from Bo')
    expect(composeEventTitle('INVITE', 'Chi', '#ops')).toBe('Chi added you to #ops')
    expect(composeEventTitle('MENTION', null, null)).toBe('A teammate mentioned you')
  })
})
