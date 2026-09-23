/**
 * WhatsApp Broadcast V1 — Meta status-callback handling in the webhook.
 *
 * Two halves:
 *  1. behavioural tests of applyBroadcastStatusCallbacks against a mocked
 *     Prisma with a real in-memory store;
 *  2. source pins on app/api/webhooks/whatsapp/route.ts proving the
 *     PRE-EXISTING 1:1 Inbox behaviour (signature verification, the `read`
 *     → Supabase messages.read_at update, inbound message handling, the
 *     Jade auto-reply, the 23505 dedup guard, the always-200 contract) is
 *     unchanged.
 */

import fs from 'fs'
import path from 'path'
import { createHmac } from 'crypto'
import { verifyMetaSignature } from '@/lib/webhooks/verify'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

interface Recip {
  id: string
  broadcastId: string
  status: string
  metaMessageId: string | null
  sentAt: Date | null
  deliveredAt: Date | null
  readAt: Date | null
  failedAt: Date | null
  failureCode: string | null
  failureReason: string | null
}

let recipients: Recip[] = []
const recomputed: string[] = []

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const value = row[key]
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>
      if ('in' in c && !(c.in as unknown[]).includes(value)) return false
    } else if (value !== cond) return false
  }
  return true
}

const mockPrisma = {
  whatsAppBroadcastRecipient: {
    findMany: jest.fn(async (args: { where: Record<string, unknown> }) =>
      recipients.filter(r => matches(r as unknown as Record<string, unknown>, args.where)).map(r => ({ ...r })),
    ),
    updateMany: jest.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const rows = recipients.filter(r => matches(r as unknown as Record<string, unknown>, args.where))
      for (const row of rows) Object.assign(row, args.data)
      return { count: rows.length }
    }),
    groupBy: jest.fn(async (args: { where: { broadcastId: string } }) => {
      recomputed.push(args.where.broadcastId)
      const rows = recipients.filter(r => r.broadcastId === args.where.broadcastId)
      const seen = new Map<string, number>()
      for (const r of rows) seen.set(r.status, (seen.get(r.status) ?? 0) + 1)
      return Array.from(seen.entries()).map(([status, n]) => ({ status, _count: { _all: n } }))
    }),
  },
  whatsAppBroadcast: { update: jest.fn(async () => ({})) },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }))

import { applyBroadcastStatusCallbacks } from '@/lib/whatsapp/broadcast/status-callbacks'

const NOW = new Date('2026-09-22T12:00:00.000Z')

function recip(over: Partial<Recip> = {}): Recip {
  return {
    id: 'r1', broadcastId: 'b1', status: 'SENT', metaMessageId: 'wamid.A',
    sentAt: null, deliveredAt: null, readAt: null, failedAt: null,
    failureCode: null, failureReason: null, ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  recipients = []
  recomputed.length = 0
})

// ── New status handling ─────────────────────────────────────────────────

describe('sent / delivered / read / failed callback processing', () => {
  it('records a `delivered` callback with Meta’s own timestamp', async () => {
    recipients = [recip({ status: 'SENT' })]
    const res = await applyBroadcastStatusCallbacks(
      [{ id: 'wamid.A', status: 'delivered', timestamp: '1758542400' }], NOW)

    expect(res.matched).toBe(1)
    expect(res.applied).toBe(1)
    expect(recipients[0].status).toBe('DELIVERED')
    expect(recipients[0].deliveredAt).toEqual(new Date(1758542400 * 1000))
  })

  it('records a `read` callback', async () => {
    recipients = [recip({ status: 'DELIVERED' })]
    await applyBroadcastStatusCallbacks([{ id: 'wamid.A', status: 'read' }], NOW)
    expect(recipients[0].status).toBe('READ')
    expect(recipients[0].readAt).toEqual(NOW)
  })

  it('records a `sent` callback for a row still SENDING', async () => {
    recipients = [recip({ status: 'SENDING' })]
    await applyBroadcastStatusCallbacks([{ id: 'wamid.A', status: 'sent' }], NOW)
    expect(recipients[0].status).toBe('SENT')
  })

  it('records a `failed` callback with Meta’s real error code and reason', async () => {
    recipients = [recip({ status: 'SENT' })]
    await applyBroadcastStatusCallbacks(
      [{ id: 'wamid.A', status: 'failed', errors: [{ code: 131026, title: 'Undeliverable', message: 'Not a WhatsApp user' }] }],
      NOW,
    )
    expect(recipients[0].status).toBe('FAILED')
    expect(recipients[0].failureCode).toBe('131026')
    expect(recipients[0].failureReason).toBe('Not a WhatsApp user')
    expect(recipients[0].failedAt).toEqual(NOW)
  })

  it('handles EVERY status in a batched payload, not just the first', async () => {
    recipients = [
      recip({ id: 'r1', metaMessageId: 'wamid.A', status: 'SENT' }),
      recip({ id: 'r2', metaMessageId: 'wamid.B', status: 'SENT' }),
      recip({ id: 'r3', metaMessageId: 'wamid.C', status: 'SENT' }),
    ]
    const res = await applyBroadcastStatusCallbacks([
      { id: 'wamid.A', status: 'delivered' },
      { id: 'wamid.B', status: 'read' },
      { id: 'wamid.C', status: 'failed', errors: [{ code: 131026 }] },
    ], NOW)

    expect(res.applied).toBe(3)
    expect(recipients.map(r => r.status)).toEqual(['DELIVERED', 'READ', 'FAILED'])
  })
})

describe('out-of-order and duplicate callbacks', () => {
  it('a stale `delivered` arriving after `read` is ignored, never a regression', async () => {
    recipients = [recip({ status: 'READ' })]
    const res = await applyBroadcastStatusCallbacks([{ id: 'wamid.A', status: 'delivered' }], NOW)
    expect(res.matched).toBe(1)
    expect(res.applied).toBe(0)
    expect(recipients[0].status).toBe('READ')
  })

  it('a redelivered identical callback is a no-op', async () => {
    recipients = [recip({ status: 'SENT' })]
    await applyBroadcastStatusCallbacks([{ id: 'wamid.A', status: 'delivered' }], NOW)
    const second = await applyBroadcastStatusCallbacks([{ id: 'wamid.A', status: 'delivered' }], NOW)
    expect(second.applied).toBe(0)
    expect(recipients[0].status).toBe('DELIVERED')
  })

  it('a duplicate inside ONE batch applies once', async () => {
    recipients = [recip({ status: 'SENT' })]
    const res = await applyBroadcastStatusCallbacks([
      { id: 'wamid.A', status: 'delivered' },
      { id: 'wamid.A', status: 'delivered' },
    ], NOW)
    expect(res.applied).toBe(1)
  })

  it('a terminal FAILED row is not resurrected by a later delivered/read', async () => {
    recipients = [recip({ status: 'FAILED' })]
    const res = await applyBroadcastStatusCallbacks([{ id: 'wamid.A', status: 'read' }], NOW)
    expect(res.applied).toBe(0)
    expect(recipients[0].status).toBe('FAILED')
  })
})

describe('the 1:1 reply path is untouched by broadcast attribution', () => {
  it('a message id that is not a broadcast send matches nothing and writes nothing', async () => {
    recipients = [recip({ metaMessageId: 'wamid.BROADCAST' })]
    const res = await applyBroadcastStatusCallbacks([{ id: 'wamid.INBOX_REPLY', status: 'read' }], NOW)
    expect(res.matched).toBe(0)
    expect(res.applied).toBe(0)
    expect(mockPrisma.whatsAppBroadcastRecipient.updateMany).not.toHaveBeenCalled()
    expect(recipients[0].status).toBe('SENT')
  })

  it('an unhandled status value is ignored without a query', async () => {
    recipients = [recip()]
    const res = await applyBroadcastStatusCallbacks([{ id: 'wamid.A', status: 'deleted' }], NOW)
    expect(res.matched).toBe(0)
    expect(mockPrisma.whatsAppBroadcastRecipient.findMany).not.toHaveBeenCalled()
  })

  it('a database failure is swallowed — the webhook must still return 200', async () => {
    mockPrisma.whatsAppBroadcastRecipient.findMany.mockRejectedValueOnce(new Error('db down'))
    await expect(applyBroadcastStatusCallbacks([{ id: 'wamid.A', status: 'read' }], NOW)).resolves.toEqual({
      matched: 0, applied: 0, broadcastsTouched: [],
    })
  })
})

describe('count-update safety', () => {
  it('recomputes the owning broadcast’s counters once per touched broadcast', async () => {
    recipients = [
      recip({ id: 'r1', broadcastId: 'b1', metaMessageId: 'wamid.A', status: 'SENT' }),
      recip({ id: 'r2', broadcastId: 'b1', metaMessageId: 'wamid.B', status: 'SENT' }),
      recip({ id: 'r3', broadcastId: 'b2', metaMessageId: 'wamid.C', status: 'SENT' }),
    ]
    await applyBroadcastStatusCallbacks([
      { id: 'wamid.A', status: 'delivered' },
      { id: 'wamid.B', status: 'read' },
      { id: 'wamid.C', status: 'delivered' },
    ], NOW)
    expect(recomputed.sort()).toEqual(['b1', 'b2'])
  })

  it('does NOT recompute when nothing actually changed', async () => {
    recipients = [recip({ status: 'READ' })]
    await applyBroadcastStatusCallbacks([{ id: 'wamid.A', status: 'delivered' }], NOW)
    expect(recomputed).toHaveLength(0)
  })

  it('never increments a counter — counts are derived from a groupBy', () => {
    const s = read('lib/whatsapp/broadcast/processor.ts')
    const fn = s.slice(s.indexOf('export async function recomputeBroadcastCounts'), s.indexOf('/** Dispatch ONE claimed'))
    expect(fn).toContain('groupBy')
    expect(fn).not.toContain('increment')
  })
})

// ── Signature verification: unchanged, and now covering broadcasts ──────

describe('webhook signature validation (existing behaviour unchanged)', () => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.A', status: 'read' }] } }] }] })

  it('a valid X-Hub-Signature-256 verifies', () => {
    const secret = 'app-secret'
    const sig = 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
    expect(verifyMetaSignature(body, sig, secret)).toBe(true)
  })

  it('a tampered body or signature does not', () => {
    const secret = 'app-secret'
    const sig = 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
    expect(verifyMetaSignature(body + ' ', sig, secret)).toBe(false)
    expect(verifyMetaSignature(body, sig.replace(/.$/, '0'), secret)).toBe(false)
    expect(verifyMetaSignature(body, null, secret)).toBe(false)
    expect(verifyMetaSignature(body, sig, '')).toBe(false)
  })
})

describe('source pins — the pre-existing webhook behaviour is preserved', () => {
  const s = read('app/api/webhooks/whatsapp/route.ts')

  it('still fails closed with no app secret, before anything is processed', () => {
    expect(s).toContain("process.env.WHATSAPP_APP_SECRET ?? process.env.META_APP_SECRET")
    expect(s).toContain('failing closed')
    expect(s).toContain('{ status: 503 }')
    expect(s).toContain('{ status: 401 }')
    expect(s.indexOf('verifyMetaSignature(')).toBeLessThan(s.indexOf('JSON.parse(rawBody)'))
    // Auth precedes the new broadcast handling too.
    expect(s.indexOf('verifyMetaSignature(')).toBeLessThan(s.lastIndexOf('applyBroadcastStatusCallbacks'))
  })

  it('the GET verify-token handshake is unchanged', () => {
    expect(s).toContain("mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_SECRET")
    expect(s).toContain("new Response('Forbidden', { status: 403 })")
  })

  it('the `read` → Supabase messages.read_at update is byte-for-byte intact', () => {
    expect(s).toContain(
      "await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('external_id', s.id)",
    )
    expect(s).toContain("const s = value.statuses[0]")
    expect(s).toContain("if (s.status === 'read') {")
    // The pre-existing update still happens BEFORE the added broadcast call.
    expect(s.indexOf("read_at: new Date().toISOString()")).toBeLessThan(s.lastIndexOf('applyBroadcastStatusCallbacks'))
  })

  it('inbound message handling, dedup and Jade auto-reply are untouched', () => {
    expect(s).toContain("if (!value.messages?.length) return NextResponse.json({ ok: true })")
    expect(s).toContain("insErr.code !== '23505'")
    expect(s).toContain('maybeJadeReply({ leadId, fromNumber, msgBody, supabase })')
    expect(s).toContain('increment_lead_unread')
    expect(s).toContain("getPreview(message)")
  })

  it('Jade’s 1:1 auto-reply remains free-form text to the inbound sender only', () => {
    // Explicitly NOT converted to a template, and not given a recipient list.
    expect(s).toContain("type: 'text',")
    expect(s).toContain('to:   fromNumber,')
  })

  it('the always-200 contract to Meta is preserved', () => {
    expect(s).toContain('// Always 200 — Meta retries on non-200 and will flood the endpoint')
  })

  it('the broadcast extension adds NO new env var to the webhook', () => {
    const envRefs = Array.from(s.matchAll(/process\.env\.([A-Z0-9_]+)/g)).map(m => m[1])
    expect(new Set(envRefs)).toEqual(new Set([
      'WHATSAPP_WEBHOOK_SECRET', 'WHATSAPP_APP_SECRET', 'META_APP_SECRET',
      'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN',
    ]))
  })
})

// ── WhatsApp Broadcast V1.2.1: opt-out moved OFF this webhook ─────────────
// V1.2 briefly added STOP/UNSUBSCRIBE handling and broadcast-status-
// callback attribution to THIS (Meta) webhook. A provider audit found
// Broadcast should never have depended on Meta in the first place, so
// V1.2.1 moved both to app/api/webhooks/twilio-whatsapp/route.ts and
// app/api/webhooks/twilio-whatsapp/broadcast-status/route.ts respectively
// — see __tests__/whatsapp-broadcast-v1-2-1-twilio-transport.test.ts for
// their coverage. This file reverts to pinning ONLY the pre-V1.2, still-
// live 1:1 Inbox behaviour (asserted above), plus this explicit proof that
// the V1.2 additions are genuinely gone rather than silently duplicated.
describe('WhatsApp Broadcast V1.2.1: this webhook no longer carries broadcast/opt-out logic', () => {
  const s2 = read('app/api/webhooks/whatsapp/route.ts')

  it('has no opt-out handling and no broadcast-status-callback attribution', () => {
    expect(s2).not.toContain('isOptOutKeyword')
    expect(s2).not.toContain('handleWhatsAppOptOut')
    // A doc comment may still explain WHERE the old function moved to; the
    // thing that must be gone is the IMPORT and the CALL.
    expect(s2).not.toMatch(/^import.*applyBroadcastStatusCallbacks/m)
    expect(s2).not.toContain('await applyBroadcastStatusCallbacks(')
    expect(s2).not.toContain('WHATSAPP_UNSUBSCRIBE_CONFIRMATION')
  })

  it('Jade auto-reply still fires unconditionally for every inbound text message (no !isOptOutMessage guard left dangling)', () => {
    expect(s2).toContain("message.type === 'text' && msgBody) {")
    expect(s2).not.toContain('isOptOutMessage')
  })
})
