/**
 * A2P CUSTOMER_CARE SMS — status callback route + monotonic persistence.
 * Real signature verification; @/lib/db replaced by an in-memory fake that
 * implements updateMany WHERE semantics (so terminal-row protection is
 * asserted on behaviour, not strings).
 */
import { createHmac } from 'crypto'

type Row = {
  id: string; direction: string; phone: string; status: string
  twilioMessageSid: string | null; errorCode: string | null
  errorMessageSafe: string | null; statusUpdatedAt: Date | null
}
const rows: Row[] = []
let failDb = false
const dbCalls = { updateMany: 0, findFirst: 0, create: 0 }

type StatusFilter = { in?: string[]; notIn?: string[] }
const matchStatus = (s: string, f: StatusFilter) =>
  (!f.in || f.in.includes(s)) && (!f.notIn || !f.notIn.includes(s))

jest.mock('@/lib/db', () => ({
  prisma: {
    smsMessage: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        dbCalls.updateMany++
        if (failDb) throw new Error('db down')
        let count = 0
        for (const r of rows) {
          if (where.twilioMessageSid !== undefined && r.twilioMessageSid !== where.twilioMessageSid) continue
          if (where.direction !== undefined && r.direction !== where.direction) continue
          const filters: StatusFilter[] = [...(where.AND ?? []).map((a: any) => a.status), ...(where.status ? [where.status] : [])]
          if (!filters.every((f) => matchStatus(r.status, f))) continue
          Object.assign(r, data)
          count++
        }
        return { count }
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        dbCalls.findFirst++
        return rows.find((r) => r.twilioMessageSid === where.twilioMessageSid && r.direction === where.direction) ?? null
      }),
      create: jest.fn(async () => { dbCalls.create++ }),
    },
  },
}))

const mockRevoke = jest.fn(async (..._a: unknown[]) => 'REVOKED')
jest.mock('@/lib/sms/consent', () => ({ revokeSmsCustomerCare: (...a: unknown[]) => mockRevoke(...a) }))

import { POST } from '@/app/api/webhooks/twilio-sms/status/route'
import { applySmsStatusUpdate } from '@/lib/sms/status'

const TOKEN = 'test-auth-token'
const URL_CANON = 'https://www.walztravels.com/api/webhooks/twilio-sms/status'

function sign(url: string, params: Record<string, string>, token = TOKEN) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
  return createHmac('sha1', token).update(data, 'utf8').digest('base64')
}

function req(params: Record<string, string>, opts: { sig?: string | null; host?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' }
  const sig = opts.sig === undefined ? sign(URL_CANON, params) : opts.sig
  if (sig) headers['x-twilio-signature'] = sig
  if (opts.host) headers['host'] = opts.host
  return new Request('https://evil.example/api/webhooks/twilio-sms/status', {
    method: 'POST', headers, body: new URLSearchParams(params).toString(),
  }) as any
}

const SID = 'SM' + 'a'.repeat(32)
const seed = (status: string, over: Partial<Row> = {}) => {
  rows.push({
    id: 'r1', direction: 'OUTBOUND', phone: '+12317902336', status, twilioMessageSid: SID,
    errorCode: null, errorMessageSafe: null, statusUpdatedAt: null, ...over,
  })
}
const cb = (status: string, extra: Record<string, string> = {}) =>
  req({ MessageSid: SID, MessageStatus: status, To: '+12317902336', From: '+15551234567', ...extra })

beforeEach(() => {
  rows.length = 0
  failDb = false
  dbCalls.updateMany = dbCalls.findFirst = dbCalls.create = 0
  mockRevoke.mockClear()
  process.env.TWILIO_AUTH_TOKEN = TOKEN
  delete process.env.TWILIO_WEBHOOK_AUTH_TOKEN
  delete process.env.TWILIO_SMS_STATUS_WEBHOOK_URL
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('status route auth', () => {
  it('forged signature -> 403, no DB write', async () => {
    seed('queued')
    const res = await POST(req({ MessageSid: SID, MessageStatus: 'sent' }, { sig: 'forged' }))
    expect(res.status).toBe(403)
    expect(dbCalls.updateMany).toBe(0)
    expect(rows[0].status).toBe('queued')
  })
  it('missing signature -> 403, no DB write', async () => {
    seed('queued')
    const res = await POST(req({ MessageSid: SID, MessageStatus: 'sent' }, { sig: null }))
    expect(res.status).toBe(403)
    expect(dbCalls.updateMany).toBe(0)
  })
  it('signature made with wrong token -> 403', async () => {
    const p = { MessageSid: SID, MessageStatus: 'sent' }
    const res = await POST(req(p, { sig: sign(URL_CANON, p, 'other') }))
    expect(res.status).toBe(403)
  })
  it('missing auth token -> 403 (fail closed)', async () => {
    delete process.env.TWILIO_AUTH_TOKEN
    const res = await POST(cb('sent'))
    expect(res.status).toBe(403)
    expect(dbCalls.updateMany).toBe(0)
  })
  it('canonical-URL signature passes even with a wrong Host header', async () => {
    seed('queued')
    const res = await POST(cb('sent'))
    const wrong = await POST(req({ MessageSid: SID, MessageStatus: 'delivered' }, { host: 'attacker.test' }))
    expect(res.status).toBe(200)
    expect(wrong.status).toBe(200)
    expect(rows[0].status).toBe('delivered')
  })
  it('signature over a non-canonical (request) URL is rejected', async () => {
    const p = { MessageSid: SID, MessageStatus: 'sent' }
    const res = await POST(req(p, { sig: sign('https://evil.example/api/webhooks/twilio-sms/status', p) }))
    expect(res.status).toBe(403)
  })
})

describe('status route validation', () => {
  it('missing MessageSid -> 400', async () => {
    expect((await POST(req({ MessageStatus: 'sent' }))).status).toBe(400)
  })
  it('missing MessageStatus -> 400', async () => {
    expect((await POST(req({ MessageSid: SID }))).status).toBe(400)
  })
  it('whatsapp: To -> ignored, no DB call', async () => {
    seed('queued')
    const res = await POST(req({ MessageSid: SID, MessageStatus: 'sent', To: 'whatsapp:+12317902336', From: '+1555' }))
    expect(res.status).toBe(200)
    expect(dbCalls.updateMany).toBe(0)
    expect(rows[0].status).toBe('queued')
  })
  it('whatsapp: From -> ignored, no DB call', async () => {
    const res = await POST(req({ MessageSid: SID, MessageStatus: 'sent', To: '+1', From: 'whatsapp:+1555' }))
    expect(res.status).toBe(200)
    expect(dbCalls.updateMany).toBe(0)
  })
  it('DB error -> 500 so Twilio retries', async () => {
    seed('queued')
    failDb = true
    expect((await POST(cb('sent'))).status).toBe(500)
  })
  it('unknown SID -> 200 no-op, no row created', async () => {
    const res = await POST(cb('sent'))
    expect(res.status).toBe(200)
    expect(rows).toHaveLength(0)
    expect(dbCalls.create).toBe(0)
    expect(await res.text()).toBe('')
  })
  it('unknown/irrelevant status values -> 200, no write', async () => {
    seed('queued')
    for (const s of ['read', 'receiving', 'received', 'scheduled', 'canceled', 'partially_delivered', 'bogus']) {
      expect((await POST(cb(s))).status).toBe(200)
    }
    expect(dbCalls.updateMany).toBe(0)
    expect(rows[0].status).toBe('queued')
  })
})

describe('status progression (monotonic, terminal-sticky)', () => {
  it('queued -> sent -> delivered', async () => {
    seed('pending')
    await POST(cb('queued')); expect(rows[0].status).toBe('queued')
    await POST(cb('sent')); expect(rows[0].status).toBe('sent')
    await POST(cb('delivered')); expect(rows[0].status).toBe('delivered')
    expect(rows[0].statusUpdatedAt).toBeInstanceOf(Date)
  })
  it('late sent after delivered does not regress', async () => {
    seed('delivered')
    expect((await POST(cb('sent'))).status).toBe(200)
    expect(rows[0].status).toBe('delivered')
  })
  it('late queued after sent -> no change', async () => {
    seed('sent')
    await POST(cb('queued'))
    expect(rows[0].status).toBe('sent')
    expect(rows[0].statusUpdatedAt).toBeNull()
  })
  it('duplicate identical callback -> no change, 200', async () => {
    seed('sent')
    expect((await POST(cb('sent'))).status).toBe(200)
    expect(rows[0].statusUpdatedAt).toBeNull()
  })
  it('failed with 30007 persists code + safe message', async () => {
    seed('sent')
    await POST(cb('failed', { ErrorCode: '30007', ErrorMessage: 'raw provider text' }))
    expect(rows[0]).toMatchObject({ status: 'failed', errorCode: '30007', errorMessageSafe: 'Message filtered by carrier' })
    expect(JSON.stringify(rows[0])).not.toContain('raw provider text')
  })
  it('undelivered persists', async () => {
    seed('sent')
    await POST(cb('undelivered', { ErrorCode: '30003' }))
    expect(rows[0]).toMatchObject({ status: 'undelivered', errorCode: '30003' })
  })
  it('failed then late delivered does not overwrite (first terminal wins)', async () => {
    seed('sent')
    await POST(cb('failed', { ErrorCode: '30008' }))
    await POST(cb('delivered'))
    expect(rows[0].status).toBe('failed')
    expect(rows[0].errorCode).toBe('30008')
  })
  it('delivered then late failed does not overwrite', async () => {
    seed('delivered')
    await POST(cb('failed', { ErrorCode: '30008' }))
    expect(rows[0]).toMatchObject({ status: 'delivered', errorCode: null })
  })
  it('errorCode is not stored for non-failure statuses', async () => {
    seed('queued')
    await POST(cb('sent', { ErrorCode: '30007' }))
    expect(rows[0].errorCode).toBeNull()
  })
  it('never touches INBOUND rows', async () => {
    seed('received', { direction: 'INBOUND' })
    await POST(cb('delivered'))
    expect(rows[0].status).toBe('received')
  })
})

describe('conditional update cannot match terminal rows (fake DB behaviour)', () => {
  it.each(['delivered', 'failed', 'undelivered'])('%s row is untouched by every status', async (terminal) => {
    for (const s of ['queued', 'accepted', 'sending', 'sent', 'delivered', 'failed', 'undelivered']) {
      rows.length = 0
      seed(terminal)
      const out = await applySmsStatusUpdate({ messageSid: SID, status: s, errorCode: '30007' })
      expect(out).toBe('noop')
      expect(rows[0].status).toBe(terminal)
      expect(rows[0].errorCode).toBeNull()
    }
  })
  it('non-terminal statuses only move forward', async () => {
    const order = ['pending', 'queued', 'sending', 'sent']
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        rows.length = 0
        seed(order[i])
        await applySmsStatusUpdate({ messageSid: SID, status: order[j] === 'pending' ? 'queued' : order[j] })
        const target = order[j] === 'pending' ? 'queued' : order[j]
        const rank = (s: string) => ({ pending: 0, queued: 1, sending: 2, sent: 3 } as Record<string, number>)[s]
        expect(rank(rows[0].status)).toBeGreaterThanOrEqual(rank(order[i]))
        if (rank(target) > rank(order[i])) expect(rows[0].status).toBe(target)
      }
    }
  })
})

describe('21610 opt-out mirroring', () => {
  it('failure with 21610 revokes consent exactly once (retry does not repeat)', async () => {
    seed('sent')
    await POST(cb('failed', { ErrorCode: '21610' }))
    await POST(cb('failed', { ErrorCode: '21610' }))
    expect(mockRevoke).toHaveBeenCalledTimes(1)
    expect(mockRevoke).toHaveBeenCalledWith({
      e164: '+12317902336',
      providerMessageSid: `status_21610:${SID}`,
      source: 'twilio_status_21610',
    })
    expect(rows[0].errorMessageSafe).toBe('Recipient has opted out (STOP)')
  })
  it('revoke failure does not fail the callback', async () => {
    seed('sent')
    mockRevoke.mockRejectedValueOnce(new Error('boom'))
    expect((await POST(cb('undelivered', { ErrorCode: '21610' }))).status).toBe(200)
    expect(rows[0].status).toBe('undelivered')
  })
  it('other codes do not revoke', async () => {
    seed('sent')
    await POST(cb('failed', { ErrorCode: '30007' }))
    expect(mockRevoke).not.toHaveBeenCalled()
  })
})
