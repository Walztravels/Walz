/**
 * WhatsApp Broadcast V1 — the cron processor.
 *
 * A small in-memory store sits behind the Prisma mock so the status
 * transitions are REAL, which is what makes the claim/idempotency/
 * concurrency assertions meaningful rather than assertions about call
 * arguments. Twilio is mocked at the fetch boundary.
 */

interface Recip {
  id: string
  broadcastId: string
  leadId: string | null
  normalizedNumber: string | null
  waId: string | null
  templateParamsSnapshot: Record<string, string>
  status: string
  providerMessageId: string | null
  failureCode: string | null
  failureReason: string | null
  attempts: number
  nextAttemptAt: Date | null
  queuedAt: Date | null
  sentAt: Date | null
  deliveredAt: Date | null
  readAt: Date | null
  failedAt: Date | null
  createdAt: Date
}

interface Bcast {
  id: string
  status: string
  contentSid: string | null
  scheduledAt: Date | null
  queuedAt: Date | null
  startedAt: Date | null
  completedAt: Date | null
  sentAt: Date | null
  createdAt: Date
  recipientCount: number
  sentCount: number
  deliveredCount: number
  readCount: number
  failedCount: number
  skippedCount: number
}

let recipients: Recip[] = []
let broadcasts: Bcast[] = []

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      const any = (cond as Array<Record<string, unknown>>).some(c => matches(row, c))
      if (!any) return false
      continue
    }
    const value = row[key]
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>
      if ('in' in c && !(c.in as unknown[]).includes(value)) return false
      if ('lte' in c) {
        if (c.lte === null) { if (value !== null) return false }
        else if (!(value instanceof Date && value <= (c.lte as Date))) return false
      }
      if ('gte' in c && !(value instanceof Date && value >= (c.gte as Date))) return false
      if ('not' in c && value === c.not) return false
    } else if (value !== cond) {
      return false
    }
  }
  return true
}

function applyData(row: Record<string, unknown>, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !(value instanceof Date) && 'increment' in (value as object)) {
      row[key] = (row[key] as number) + (value as { increment: number }).increment
    } else {
      row[key] = value
    }
  }
}

const mockPrisma = {
  whatsAppBroadcastRecipient: {
    findMany: jest.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
      const rows = recipients.filter(r => matches(r as unknown as Record<string, unknown>, args.where))
      return rows.slice(0, args.take ?? rows.length).map(r => ({ ...r }))
    }),
    findUnique: jest.fn(async (args: { where: { id: string } }) => {
      const r = recipients.find(x => x.id === args.where.id)
      return r ? { ...r } : null
    }),
    updateMany: jest.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const rows = recipients.filter(r => matches(r as unknown as Record<string, unknown>, args.where))
      for (const row of rows) applyData(row as unknown as Record<string, unknown>, args.data)
      return { count: rows.length }
    }),
    groupBy: jest.fn(async (args: { where: { broadcastId: string }; by: string[] }) => {
      const rows = recipients.filter(r => r.broadcastId === args.where.broadcastId)
      const key = args.by[0] as keyof Recip
      const seen = new Map<string, number>()
      for (const r of rows) {
        const k = String(r[key] ?? 'UNKNOWN')
        seen.set(k, (seen.get(k) ?? 0) + 1)
      }
      return Array.from(seen.entries()).map(([k, n]) => ({ [key]: k, _count: { _all: n } }))
    }),
  },
  whatsAppBroadcast: {
    findMany: jest.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
      const rows = broadcasts.filter(b => matches(b as unknown as Record<string, unknown>, args.where))
      return rows.slice(0, args.take ?? rows.length).map(b => ({ ...b }))
    }),
    findUnique: jest.fn(async (args: { where: { id: string } }) => {
      const b = broadcasts.find(x => x.id === args.where.id)
      return b ? { ...b } : null
    }),
    updateMany: jest.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const rows = broadcasts.filter(b => matches(b as unknown as Record<string, unknown>, args.where))
      for (const row of rows) applyData(row as unknown as Record<string, unknown>, args.data)
      return { count: rows.length }
    }),
    update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const b = broadcasts.find(x => x.id === args.where.id)
      if (b) applyData(b as unknown as Record<string, unknown>, args.data)
      return b ? { ...b } : null
    }),
  },
  // ── WhatsApp Broadcast V1.2: the pre-dispatch consent recheck ──────────
  // UNSEEDED (the default for every pre-existing test in this file, which
  // predates the recheck and never populates these stores) means "assume
  // still eligible" — i.e. nothing changed since snapshot time, which was
  // the entire, implicit universe before V1.2. A test that wants to
  // exercise the recheck itself explicitly seeds `consentOverrides` /
  // `leadOptOutOverrides` / `visaOptOutOverrides` for the specific
  // number/id under test.
  whatsAppConsent: {
    findUnique: jest.fn(async (args: { where: { normalizedNumber: string } }) => {
      const status = consentOverrides.get(args.where.normalizedNumber)
      return { status: status ?? 'SUBSCRIBED' }
    }),
  },
  lead: {
    findUnique: jest.fn(async (args: { where: { id: string } }) => ({
      marketingOptOut: leadOptOutOverrides.has(args.where.id),
    })),
  },
  visaApplication: {
    findUnique: jest.fn(async (args: { where: { id: string } }) => ({
      marketingOptOut: visaOptOutOverrides.has(args.where.id),
    })),
  },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }))

let consentOverrides = new Map<string, string>()
let leadOptOutOverrides = new Set<string>()
let visaOptOutOverrides = new Set<string>()

// Credentials are always "present" so the sender reaches the fetch mock.
process.env.TWILIO_ACCOUNT_SID = 'AC-test'
process.env.TWILIO_AUTH_TOKEN = 'token-test'

import {
  processWhatsAppBroadcasts, recomputeBroadcastCounts,
  MAX_RECIPIENTS_PER_TICK, MAX_SEND_ATTEMPTS, INTER_MESSAGE_DELAY_MS,
} from '@/lib/whatsapp/broadcast/processor'

const NOW = new Date('2026-09-22T12:00:00.000Z')

// A syntactically-valid-looking approved Content SID (HX + 32 hex chars) —
// matches lib/whatsapp/broadcast/template.ts's CONTENT_SID_RE.
const TEST_CONTENT_SID = 'HX' + '0'.repeat(32)

function bcast(over: Partial<Bcast> = {}): Bcast {
  return {
    id: 'b1', status: 'QUEUED', contentSid: TEST_CONTENT_SID,
    scheduledAt: null, queuedAt: NOW, startedAt: null, completedAt: null, sentAt: null,
    createdAt: NOW, recipientCount: 0, sentCount: 0, deliveredCount: 0, readCount: 0,
    failedCount: 0, skippedCount: 0, ...over,
  }
}

function recip(over: Partial<Recip> = {}): Recip {
  return {
    id: 'r1', broadcastId: 'b1', leadId: 'l1', normalizedNumber: '+2348011111111',
    waId: '2348011111111', templateParamsSnapshot: { '1': 'Ada' }, status: 'QUEUED',
    providerMessageId: null, failureCode: null, failureReason: null, attempts: 0,
    nextAttemptAt: null, queuedAt: NOW, sentAt: null, deliveredAt: null, readAt: null,
    failedAt: null, createdAt: NOW, ...over,
  }
}

/** A successful Twilio Messages.json response (201, {sid, status}). */
const okFetch = (sid = 'SM_OK') =>
  jest.fn(async () => ({
    ok: true, status: 201,
    json: async () => ({ sid, status: 'queued' }),
  })) as unknown as typeof fetch

/** A failing Twilio Messages.json response ({code, message}, no nested "error"). */
const errFetch = (status: number, code: number, message = 'nope') =>
  jest.fn(async () => ({
    ok: false, status,
    json: async () => ({ code, message }),
  })) as unknown as typeof fetch

beforeEach(() => {
  jest.clearAllMocks()
  recipients = []
  broadcasts = []
  consentOverrides = new Map()
  leadOptOutOverrides = new Set()
  visaOptOutOverrides = new Set()
})

// ── Rate limiting / batching ────────────────────────────────────────────

describe('bounded batches and pacing', () => {
  it('never dispatches more than MAX_RECIPIENTS_PER_TICK in one tick', async () => {
    broadcasts = [bcast()]
    recipients = Array.from({ length: MAX_RECIPIENTS_PER_TICK + 10 }, (_, i) =>
      recip({ id: `r${i}`, normalizedNumber: `+23480000000${i}`, waId: `23480000000${i}` }))
    const f = okFetch()

    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })

    expect(summary.claimed).toBe(MAX_RECIPIENTS_PER_TICK)
    expect(summary.sent).toBe(MAX_RECIPIENTS_PER_TICK)
    expect((f as unknown as jest.Mock).mock.calls).toHaveLength(MAX_RECIPIENTS_PER_TICK)
    // The remainder stays QUEUED for the next tick.
    expect(recipients.filter(r => r.status === 'QUEUED')).toHaveLength(10)
  }, 20_000)

  it('paces sends so one tick stays inside the 60s function budget', () => {
    expect(INTER_MESSAGE_DELAY_MS).toBeGreaterThan(0)
    expect((MAX_RECIPIENTS_PER_TICK * INTER_MESSAGE_DELAY_MS) / 1000).toBeLessThan(30)
  })
})

// ── Claiming / concurrency ──────────────────────────────────────────────

describe('idempotent claiming', () => {
  it('claims QUEUED → SENDING and checks the affected count', async () => {
    broadcasts = [bcast()]
    recipients = [recip()]
    await processWhatsAppBroadcasts({ now: NOW, fetchImpl: okFetch() })

    const claimCall = mockPrisma.whatsAppBroadcastRecipient.updateMany.mock.calls
      .find(c => (c[0] as { data: Record<string, unknown> }).data.status === 'SENDING')
    expect(claimCall).toBeTruthy()
    expect((claimCall![0] as { where: Record<string, unknown> }).where.status).toBe('QUEUED')
  })

  it('two concurrent processors never both claim the same recipient', async () => {
    broadcasts = [bcast()]
    recipients = [recip()]
    const f1 = okFetch('wamid.A')
    const f2 = okFetch('wamid.B')

    // Run both ticks over the SAME store — the conditional updateMany is
    // what serialises them, exactly as Postgres would.
    const [s1, s2] = await Promise.all([
      processWhatsAppBroadcasts({ now: NOW, fetchImpl: f1 }),
      processWhatsAppBroadcasts({ now: NOW, fetchImpl: f2 }),
    ])

    expect(s1.claimed + s2.claimed).toBe(1)
    const totalFetches =
      (f1 as unknown as jest.Mock).mock.calls.length + (f2 as unknown as jest.Mock).mock.calls.length
    expect(totalFetches).toBe(1)
    expect(recipients[0].attempts).toBe(1)
  })

  it('a second tick after a successful send dispatches nothing', async () => {
    broadcasts = [bcast()]
    recipients = [recip()]
    await processWhatsAppBroadcasts({ now: NOW, fetchImpl: okFetch() })
    const f2 = okFetch()
    const s2 = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f2 })
    expect(s2.claimed).toBe(0)
    expect((f2 as unknown as jest.Mock).mock.calls).toHaveLength(0)
  })
})

// ── The message-id gate ─────────────────────────────────────────────────

describe('a row with a provider message id is NEVER re-sent', () => {
  it('refuses to call Twilio even when the row was re-queued', async () => {
    broadcasts = [bcast()]
    // The pathological case: a crash left the row QUEUED after Twilio had
    // already accepted it. The Message SID is the proof, and it wins.
    recipients = [recip({ status: 'QUEUED', providerMessageId: 'SM.ALREADY' })]
    const f = okFetch()

    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })

    expect((f as unknown as jest.Mock).mock.calls).toHaveLength(0)
    expect(summary.sent).toBe(0)
    expect(summary.skippedAlreadyDispatched).toBe(1)
    expect(recipients[0].status).toBe('SENT')
    expect(recipients[0].providerMessageId).toBe('SM.ALREADY')
  })

  it('the gate is checked before the send call in the source', () => {
    const s = require('fs').readFileSync(
      require('path').join(process.cwd(), 'lib/whatsapp/broadcast/processor.ts'), 'utf8')
    expect(s.indexOf('if (row.providerMessageId)')).toBeLessThan(s.indexOf('sendBroadcastTemplate({'))
  })
})

// ── Retry / backoff ─────────────────────────────────────────────────────

describe('Twilio failure handling', () => {
  it('a TRANSIENT failure re-queues behind a backoff, keeping the attempt count', async () => {
    broadcasts = [bcast()]
    recipients = [recip()]

    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: errFetch(500, 1, 'server error') })

    expect(summary.retried).toBe(1)
    expect(summary.failed).toBe(0)
    expect(recipients[0].status).toBe('QUEUED')
    expect(recipients[0].attempts).toBe(1)
    expect(recipients[0].nextAttemptAt).toBeInstanceOf(Date)
    expect(recipients[0].nextAttemptAt!.getTime()).toBeGreaterThan(Date.now())
    expect(recipients[0].providerMessageId).toBeNull()
  })

  it('a backed-off row is not picked up before its time', async () => {
    broadcasts = [bcast()]
    recipients = [recip({ nextAttemptAt: new Date(NOW.getTime() + 10 * 60_000) })]
    const f = okFetch()
    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })
    expect(summary.claimed).toBe(0)
    expect((f as unknown as jest.Mock).mock.calls).toHaveLength(0)
  })

  it('a PERMANENT failure is never retried', async () => {
    broadcasts = [bcast()]
    recipients = [recip()]

    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: errFetch(400, 63032, 'template not found') })

    expect(summary.failed).toBe(1)
    expect(summary.retried).toBe(0)
    expect(recipients[0].status).toBe('FAILED')
    expect(recipients[0].failureCode).toBe('63032')
    expect(recipients[0].failureReason).toContain('template not found')
  })

  it('a transient failure is parked FAILED once attempts are exhausted', async () => {
    broadcasts = [bcast()]
    recipients = [recip({ attempts: MAX_SEND_ATTEMPTS })]
    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: errFetch(500, 1) })
    expect(summary.failed).toBe(1)
    expect(recipients[0].status).toBe('FAILED')
  })

  it('a network throw is transient, not a lost message', async () => {
    broadcasts = [bcast()]
    recipients = [recip()]
    const throwing = jest.fn(async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: throwing })
    expect(summary.retried).toBe(1)
    expect(recipients[0].status).toBe('QUEUED')
  })

  it('a 200 with no message SID is treated as transient, never as a send', async () => {
    broadcasts = [bcast()]
    recipients = [recip()]
    const weird = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })) as unknown as typeof fetch
    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: weird })
    expect(summary.sent).toBe(0)
    expect(summary.retried).toBe(1)
    expect(recipients[0].providerMessageId).toBeNull()
  })
})

// ── Scheduling and cancellation ─────────────────────────────────────────

describe('scheduling and cancellation', () => {
  it('promotes a due SCHEDULED broadcast to QUEUED', async () => {
    broadcasts = [bcast({ status: 'SCHEDULED', scheduledAt: new Date(NOW.getTime() - 60_000), queuedAt: null })]
    recipients = [recip()]
    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: okFetch() })
    expect(summary.broadcastsPromoted).toBe(1)
    expect(summary.sent).toBe(1)
  })

  it('does NOT promote a SCHEDULED broadcast before its time', async () => {
    broadcasts = [bcast({ status: 'SCHEDULED', scheduledAt: new Date(NOW.getTime() + 60 * 60_000), queuedAt: null })]
    recipients = [recip()]
    const f = okFetch()
    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })
    expect(summary.broadcastsPromoted).toBe(0)
    expect((f as unknown as jest.Mock).mock.calls).toHaveLength(0)
  })

  it('a CANCELLED broadcast is never picked up and none of its recipients are claimed', async () => {
    broadcasts = [bcast({ status: 'CANCELLED' })]
    recipients = [recip()]
    const f = okFetch()
    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })
    expect(summary.claimed).toBe(0)
    expect((f as unknown as jest.Mock).mock.calls).toHaveLength(0)
    expect(recipients[0].status).toBe('QUEUED')
  })
})

// ── Aggregate counts ────────────────────────────────────────────────────

describe('aggregate count correctness', () => {
  it('recomputes counters from the rows rather than incrementing', async () => {
    broadcasts = [bcast()]
    recipients = [
      recip({ id: 'a', status: 'SENT' }),
      recip({ id: 'b', status: 'DELIVERED' }),
      recip({ id: 'c', status: 'READ' }),
      recip({ id: 'd', status: 'FAILED' }),
      recip({ id: 'e', status: 'SKIPPED_NO_CONSENT' }),
      recip({ id: 'f', status: 'SKIPPED_OPT_OUT' }),
    ]

    const counts = await recomputeBroadcastCounts('b1')

    expect(counts.total).toBe(6)
    expect(counts.dispatched).toBe(3)        // SENT + DELIVERED + READ
    expect(counts.skipped).toBe(2)
    expect(counts.outstanding).toBe(0)
    expect(broadcasts[0].recipientCount).toBe(6)
    expect(broadcasts[0].sentCount).toBe(3)
    expect(broadcasts[0].deliveredCount).toBe(2)   // DELIVERED + READ
    expect(broadcasts[0].readCount).toBe(1)
    expect(broadcasts[0].failedCount).toBe(1)
    expect(broadcasts[0].skippedCount).toBe(2)
  })

  it('running it repeatedly cannot inflate a counter', async () => {
    broadcasts = [bcast()]
    recipients = [recip({ status: 'SENT' })]
    await recomputeBroadcastCounts('b1')
    await recomputeBroadcastCounts('b1')
    await recomputeBroadcastCounts('b1')
    expect(broadcasts[0].sentCount).toBe(1)
  })

  it('closes a fully-dispatched broadcast as COMPLETED', async () => {
    broadcasts = [bcast()]
    recipients = [recip()]
    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: okFetch() })
    expect(summary.broadcastsCompleted).toBe(1)
    expect(broadcasts[0].status).toBe('COMPLETED')
    expect(broadcasts[0].sentAt).toEqual(NOW)
  })

  it('closes a mixed outcome as PARTIAL_FAILURE', async () => {
    broadcasts = [bcast()]
    recipients = [recip({ id: 'ok' }), recip({ id: 'bad', status: 'FAILED' })]
    await processWhatsAppBroadcasts({ now: NOW, fetchImpl: okFetch() })
    expect(broadcasts[0].status).toBe('PARTIAL_FAILURE')
  })

  it('closes an all-skipped broadcast as COMPLETED, not FAILED', async () => {
    broadcasts = [bcast()]
    recipients = [recip({ id: 's1', status: 'SKIPPED_NO_CONSENT' })]
    await processWhatsAppBroadcasts({ now: NOW, fetchImpl: okFetch() })
    expect(broadcasts[0].status).toBe('COMPLETED')
  })

  it('closes a broadcast straight from QUEUED to FAILED when every recipient was already terminal before dispatch', async () => {
    // The exact gap the security/QA review flagged: a snapshot containing
    // recipients that were marked FAILED before ever reaching dispatch
    // (e.g. an unresolvable template parameter at schedule time) alongside
    // SKIPPED_* rows means NOTHING is ever QUEUED for the processor to
    // claim. The very first tick finds due.length === 0 while the
    // broadcast is still QUEUED — it never passes through SENDING at all
    // — so the closeout must go QUEUED → FAILED directly. Before the fix,
    // BROADCAST_TRANSITIONS['QUEUED'] didn't include FAILED, so
    // canTransitionBroadcast('QUEUED', 'FAILED') was false and this
    // broadcast would have been left stuck in QUEUED forever once the
    // closeout started asking the guard.
    broadcasts = [bcast({ status: 'QUEUED', startedAt: null })]
    recipients = [
      recip({ id: 'a', status: 'FAILED' }),
      recip({ id: 'b', status: 'SKIPPED_NO_CONSENT' }),
    ]
    const f = okFetch()

    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })

    expect((f as unknown as jest.Mock).mock.calls).toHaveLength(0)
    expect(summary.claimed).toBe(0)
    expect(summary.broadcastsCompleted).toBe(1)
    expect(broadcasts[0].status).toBe('FAILED')
    // It never touched SENDING on the way to FAILED.
    expect(broadcasts[0].startedAt).toBeNull()
  })

  it('a broadcast with no template is failed rather than sent as anything else', async () => {
    broadcasts = [bcast({ contentSid: null })]
    recipients = [recip()]
    const f = okFetch()
    await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })
    expect((f as unknown as jest.Mock).mock.calls).toHaveLength(0)
    expect(broadcasts[0].status).toBe('FAILED')
  })

  it('closes a no-template broadcast through the SAME guarded recompute-then-write path as every other closeout, not a direct unguarded write', async () => {
    // This is the regression guard for the "no template" defensive branch:
    // it must reach FAILED via writeBroadcastTerminal()/recomputeBroadcastCounts(),
    // not via its own standalone `updateMany({ data: { status: 'FAILED' } })`.
    // Both routes land on the same end status, so asserting status alone
    // (the test above) cannot tell them apart. What CAN tell them apart is
    // whether the broadcast's counters get freshly recomputed from the
    // recipient rows: a direct unguarded write never touches them, so they
    // would be left at whatever stale values were already on the row. Seed
    // deliberately wrong counters here — if this test passes, it is because
    // recomputeBroadcastCounts() actually ran as part of this branch.
    broadcasts = [bcast({
      contentSid: null,
      recipientCount: 99, sentCount: 7, deliveredCount: 6, readCount: 5, failedCount: 4, skippedCount: 3,
    })]
    recipients = [
      recip({ id: 'a', status: 'QUEUED' }),
      recip({ id: 'b', status: 'SKIPPED_NO_CONSENT' }),
    ]
    const f = okFetch()

    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })

    expect((f as unknown as jest.Mock).mock.calls).toHaveLength(0)
    // Still ends up FAILED (the preserved defensive outcome)...
    expect(broadcasts[0].status).toBe('FAILED')
    // ...but ONLY via the guarded closeout: the stale seeded counters are
    // gone, replaced by a fresh tally of the two actual recipient rows.
    // A direct `updateMany({ data: { status: 'FAILED' } })` bypass would
    // never touch these fields, so they would still read 99/7/6/5/4/3.
    expect(broadcasts[0].recipientCount).toBe(2)
    expect(broadcasts[0].sentCount).toBe(0)
    expect(broadcasts[0].deliveredCount).toBe(0)
    expect(broadcasts[0].readCount).toBe(0)
    expect(broadcasts[0].failedCount).toBe(0)
    expect(broadcasts[0].skippedCount).toBe(1)
    // And the guarded write itself is credited as a closeout, exactly like
    // the other two sites.
    expect(summary.broadcastsCompleted).toBe(1)
  })
})

// ── The payload actually sent ───────────────────────────────────────────

describe('what reaches Twilio', () => {
  it('is an approved Content Template message via Twilio\'s REST API with Basic auth', async () => {
    broadcasts = [bcast()]
    recipients = [recip({ templateParamsSnapshot: { '1': 'Ada', '2': 'July' } })]
    const f = okFetch()
    await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })

    const [url, init] = (f as unknown as jest.Mock).mock.calls[0]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC-test/Messages.json')
    expect((init as RequestInit).headers).toMatchObject({ Authorization: expect.stringContaining('Basic ') })
    expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' })

    const body = new URLSearchParams((init as RequestInit).body as string)
    expect(body.get('To')).toBe('whatsapp:+2348011111111')
    expect(body.get('ContentSid')).toBe(TEST_CONTENT_SID)
    expect(JSON.parse(body.get('ContentVariables')!)).toEqual({ '1': 'Ada', '2': 'July' })
    // No free-text fallback exists on this path at all.
    expect(body.has('Body')).toBe(false)
  })

  it('uses the FROZEN snapshot parameters, never re-derived lead data', async () => {
    broadcasts = [bcast()]
    recipients = [recip({ templateParamsSnapshot: { '1': 'FrozenName' } })]
    const f = okFetch()
    await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })
    const body = new URLSearchParams(((f as unknown as jest.Mock).mock.calls[0][1] as RequestInit).body as string)
    expect(JSON.parse(body.get('ContentVariables')!)).toEqual({ '1': 'FrozenName' })
    // WhatsApp Broadcast V1.2: the processor DOES now read the lead row —
    // but ONLY for the pre-dispatch consent recheck's marketingOptOut
    // field, never to re-derive a template parameter. Pin the query shape
    // rather than "never touches the lead table", which stopped being true
    // the moment the recheck was added on purpose.
    expect(mockPrisma.lead.findUnique).toHaveBeenCalledWith({
      where: { id: 'l1' },
      select: { marketingOptOut: true },
    })
  })

  it('a legacy V1/V1.1 row (array-shaped templateParamsSnapshot) degrades to empty variables rather than throwing', async () => {
    broadcasts = [bcast()]
    // Cast past the interface on purpose — this simulates a pre-V1.2.1
    // row shape that, per processor.ts's doc comment, has zero such rows
    // in production but must still degrade safely rather than crash.
    recipients = [recip({ templateParamsSnapshot: ['Ada', 'July'] as unknown as Record<string, string> })]
    const f = okFetch()
    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })
    expect(summary.sent).toBe(1)
    const body = new URLSearchParams((((f as unknown as jest.Mock).mock.calls[0][1]) as RequestInit).body as string)
    expect(JSON.parse(body.get('ContentVariables')!)).toEqual({})
  })
})

// ── WhatsApp Broadcast V1.2: pre-dispatch consent recheck ────────────────
describe('pre-dispatch consent recheck (V1.2)', () => {
  it('excludes a recipient whose WhatsAppConsent flipped to OPTED_OUT after scheduling, without calling Twilio', async () => {
    broadcasts = [bcast()]
    recipients = [recip()]
    consentOverrides.set('+2348011111111', 'OPTED_OUT')
    const f = okFetch()

    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })

    expect((f as unknown as jest.Mock)).not.toHaveBeenCalled()
    expect(recipients[0].status).toBe('SKIPPED_OPT_OUT')
    expect(recipients[0].providerMessageId).toBeNull()
    expect(summary.skippedConsentChangedAtSend).toBe(1)
    expect(summary.sent).toBe(0)
  })

  it('excludes a recipient whose consent lapsed to no-longer-SUBSCRIBED after scheduling', async () => {
    broadcasts = [bcast()]
    recipients = [recip()]
    consentOverrides.set('+2348011111111', 'UNKNOWN')
    const f = okFetch()

    await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })

    expect((f as unknown as jest.Mock)).not.toHaveBeenCalled()
    expect(recipients[0].status).toBe('SKIPPED_NO_CONSENT')
  })

  it('excludes a recipient whose Lead.marketingOptOut became true after scheduling, even though WhatsAppConsent still says SUBSCRIBED', async () => {
    broadcasts = [bcast()]
    recipients = [recip({ leadId: 'l1' })]
    consentOverrides.set('+2348011111111', 'SUBSCRIBED')
    leadOptOutOverrides.add('l1')
    const f = okFetch()

    await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })

    // The hard override is checked first, exactly as decideEligibility()
    // always has — an OPTED_OUT-shaped consent row could never re-enrol it.
    expect((f as unknown as jest.Mock)).not.toHaveBeenCalled()
    expect(recipients[0].status).toBe('SKIPPED_OPT_OUT')
  })

  it('still sends when consent is unchanged (SUBSCRIBED) at dispatch time', async () => {
    broadcasts = [bcast()]
    recipients = [recip()]
    consentOverrides.set('+2348011111111', 'SUBSCRIBED')
    const f = okFetch()

    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })

    expect((f as unknown as jest.Mock)).toHaveBeenCalledTimes(1)
    expect(recipients[0].status).toBe('SENT')
    expect(summary.skippedConsentChangedAtSend).toBe(0)
  })

  it('never resends a row already marked SKIPPED_OPT_OUT by the recheck (SKIPPED_* is terminal)', async () => {
    broadcasts = [bcast()]
    recipients = [recip()]
    consentOverrides.set('+2348011111111', 'OPTED_OUT')
    await processWhatsAppBroadcasts({ now: NOW, fetchImpl: okFetch() })
    expect(recipients[0].status).toBe('SKIPPED_OPT_OUT')

    // A second tick must not touch it — SKIPPED_OPT_OUT is not QUEUED, so
    // the claim step never picks it up again.
    const f2 = okFetch()
    await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f2 })
    expect((f2 as unknown as jest.Mock)).not.toHaveBeenCalled()
    expect(recipients[0].status).toBe('SKIPPED_OPT_OUT')
  })
})

// ── ADVERSARIAL: the recheck-read → Twilio-call window ────────────────────
// V1.2's recheck reads WhatsAppConsent/Lead/VisaApplication, THEN calls
// sendBroadcastTemplate() (an external HTTP call, so it cannot share a
// transaction with the read). Anything that opts out in that exact gap is
// still sent to — an unavoidable property of any recheck-then-act design,
// not a defect introduced here. What actually matters for correctness is
// (a) that gap is per-recipient and as small as one recheck+HTTP round
// trip — never a batch-wide staleness where recipient #5's opt-out is
// missed because recipient #1's recheck read is reused for it — and
// (b) it is strictly smaller than the V1 window it replaces, which was
// "however long the broadcast sat QUEUED/SCHEDULED", i.e. potentially
// hours or days with NO recheck at all.
describe('ADVERSARIAL: recheck-read-to-Twilio-call window', () => {
  it('a real gap exists: an opt-out written DURING the Twilio call for THIS recipient still gets sent to (inherent TOCTOU, not a batch-wide gap)', async () => {
    broadcasts = [bcast()]
    recipients = [recip()]
    // Simulate the opt-out landing at the worst possible instant: exactly
    // while the Twilio HTTP call for this very row is in flight, i.e. AFTER
    // the recheck read already returned "still SUBSCRIBED".
    const f = jest.fn(async () => {
      consentOverrides.set('+2348011111111', 'OPTED_OUT')
      return { ok: true, status: 201, json: async () => ({ sid: 'SM.RACE', status: 'queued' }) }
    }) as unknown as typeof fetch

    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })

    // This message DOES go out — the recheck read happened before the
    // opt-out was written, and nothing rolls back an already-sent Twilio
    // call. This is the honest, unavoidable shape of the gap: it can only
    // be closed by not sending at all, which is not what a recheck design
    // buys you.
    expect((f as unknown as jest.Mock)).toHaveBeenCalledTimes(1)
    expect(recipients[0].status).toBe('SENT')
    expect(summary.sent).toBe(1)
  })

  it('the gap does NOT extend across recipients in the same tick — recipient #2 sees recipient #1\'s just-written opt-out, proving the recheck is per-row-fresh, not snapshotted once for the whole batch', async () => {
    broadcasts = [bcast()]
    recipients = [
      recip({ id: 'r1', normalizedNumber: '+2348011111111', waId: '2348011111111' }),
      recip({ id: 'r2', normalizedNumber: '+2348022222222', waId: '2348022222222' }),
    ]
    // r1's OWN Twilio call flips consent for r2's number — simulating a
    // completely independent event (e.g. r2's number sends an inbound
    // STOP) landing in the gap between the batch being claimed and r2's
    // turn in the sequential dispatch loop.
    const f = jest.fn(async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(init.body as string)
      const to = body.get('To') // "whatsapp:+2348011111111"
      if (to === 'whatsapp:+2348011111111') consentOverrides.set('+2348022222222', 'OPTED_OUT')
      return { ok: true, status: 201, json: async () => ({ sid: `SM.${to}`, status: 'queued' }) }
    }) as unknown as typeof fetch

    const summary = await processWhatsAppBroadcasts({ now: NOW, fetchImpl: f })

    // r1 sent (its own recheck ran before anything changed).
    expect(recipients.find(r => r.id === 'r1')!.status).toBe('SENT')
    // r2 is excluded — its recheck runs AFTER r1's send, inside the SAME
    // tick, and picks up the fresh OPTED_OUT state. No batch-wide
    // snapshot-once-for-all-rows staleness exists in this design.
    expect(recipients.find(r => r.id === 'r2')!.status).toBe('SKIPPED_OPT_OUT')
    expect(summary.sent).toBe(1)
    expect(summary.skippedConsentChangedAtSend).toBe(1)
    // Only ONE Twilio call was made — r2 was never dispatched to.
    expect((f as unknown as jest.Mock)).toHaveBeenCalledTimes(1)
  })
})
