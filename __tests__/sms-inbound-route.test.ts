import { createHmac } from 'crypto'

type Row = Record<string, any>
const db = {
  smsMessage: [] as Row[],
  consentRecord: [] as Row[],
  consentEvent: [] as Row[],
  failWrites: false,
  failAfterMessage: false,
}
const p2002 = () => Object.assign(new Error('unique'), { code: 'P2002' })

function makeClient() {
  return {
    smsMessage: {
      create: async ({ data }: any) => {
        if (db.failWrites) throw new Error('db down')
        if (db.smsMessage.some((r) => r.twilioMessageSid === data.twilioMessageSid)) throw p2002()
        db.smsMessage.push({ id: `m${db.smsMessage.length}`, ...data })
        if (db.failAfterMessage) throw new Error('crash after message write')
        return data
      },
    },
    consentRecord: {
      findUnique: async ({ where }: any) => {
        const k = where.normalizedNumber_purpose
        return db.consentRecord.find((r) => r.normalizedNumber === k.normalizedNumber && r.purpose === k.purpose) ?? null
      },
      create: async ({ data }: any) => {
        db.consentRecord.push({ id: `c${db.consentRecord.length}`, revokedAt: null, consentedAt: null, ...data })
      },
      update: async ({ where, data }: any) => {
        Object.assign(db.consentRecord.find((r) => r.id === where.id)!, data)
      },
    },
    consentEvent: {
      create: async ({ data }: any) => {
        if (
          data.providerMessageSid &&
          db.consentEvent.some((e) => e.providerMessageSid === data.providerMessageSid && e.eventType === data.eventType)
        )
          throw p2002()
        db.consentEvent.push({ ...data })
      },
    },
  }
}
const fake: any = {
  ...makeClient(),
  $transaction: async (fn: any) => {
    const snap = [structuredClone(db.consentRecord), structuredClone(db.consentEvent)]
    try {
      return await fn(makeClient())
    } catch (e) {
      db.consentRecord = snap[0]
      db.consentEvent = snap[1]
      throw e
    }
  },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: fake }))
jest.mock('@/lib/inbox/client-identity', () => ({
  findCredibleDuplicate: jest.fn(async () => ({ status: 'none' })),
}))

import { POST } from '@/app/api/webhooks/twilio-sms/route'
import { SMS_HELP_REPLY } from '@/lib/sms/help'
import { SMS_INBOUND_WEBHOOK_URL_DEFAULT } from '@/lib/sms/config'
import { findCredibleDuplicate } from '@/lib/inbox/client-identity'

const TOKEN = 'test-auth-token'
const URL_ = SMS_INBOUND_WEBHOOK_URL_DEFAULT
const NUM = '+12317902336'

function sign(params: Record<string, string>, url = URL_, token = TOKEN) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
  return createHmac('sha1', token).update(data, 'utf8').digest('base64')
}
function req(params: Record<string, string>, opts: { sig?: string | null; headers?: Record<string, string> } = {}) {
  const h = new Map<string, string>(Object.entries({ ...(opts.headers ?? {}) }))
  const sig = opts.sig === undefined ? sign(params) : opts.sig
  if (sig) h.set('x-twilio-signature', sig)
  return {
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
    text: async () => new URLSearchParams(params).toString(),
  } as any
}
const msg = (body: string, extra: Record<string, string> = {}) => ({
  MessageSid: 'SM' + 'a'.repeat(32),
  From: NUM,
  To: '+15550001111',
  Body: body,
  ...extra,
})
const EMPTY = '<Response></Response>'

beforeEach(() => {
  db.smsMessage = []
  db.consentRecord = []
  db.consentEvent = []
  db.failWrites = false
  db.failAfterMessage = false
  process.env.TWILIO_AUTH_TOKEN = TOKEN
  delete process.env.TWILIO_WEBHOOK_AUTH_TOKEN
  delete process.env.TWILIO_SMS_WEBHOOK_URL
  delete process.env.TWILIO_SMS_APP_HELP_REPLY
  ;(findCredibleDuplicate as jest.Mock).mockResolvedValue({ status: 'none' })
})

const grantedRow = () => ({
  id: 'g1', normalizedNumber: NUM, purpose: 'SMS_CUSTOMER_CARE', status: 'GRANTED',
  consentedAt: new Date('2026-01-01'), ipAddress: '1.2.3.4', evidence: 'proof', source: 'web', revokedAt: null,
})

describe('signature / auth', () => {
  it('forged signature -> 403, nothing written', async () => {
    const res = await POST(req(msg('STOP'), { sig: 'forged' }))
    expect(res.status).toBe(403)
    expect(db.smsMessage).toHaveLength(0)
    expect(db.consentRecord).toHaveLength(0)
  })
  it('missing signature -> 403, nothing written', async () => {
    const res = await POST(req(msg('STOP'), { sig: null }))
    expect(res.status).toBe(403)
    expect(db.smsMessage).toHaveLength(0)
    expect(db.consentEvent).toHaveLength(0)
  })
  it('signature made with a different token -> 403', async () => {
    const p = msg('STOP')
    expect((await POST(req(p, { sig: sign(p, URL_, 'other') }))).status).toBe(403)
  })
  it('missing auth token -> 403 even with a signature', async () => {
    delete process.env.TWILIO_AUTH_TOKEN
    const p = msg('STOP')
    expect((await POST(req(p))).status).toBe(403)
    expect(db.smsMessage).toHaveLength(0)
  })
  it('canonical-URL signature passes despite wrong Host / forwarded host', async () => {
    const res = await POST(req(msg('hello'), { headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' } }))
    expect(res.status).toBe(200)
    expect(db.smsMessage).toHaveLength(1)
  })
  it('signature for a headers-derived URL is rejected', async () => {
    const p = msg('STOP')
    const res = await POST(req(p, { sig: sign(p, 'https://evil.example/api/webhooks/twilio-sms'), headers: { host: 'evil.example' } }))
    expect(res.status).toBe(403)
  })
})

describe('malformed', () => {
  it('missing MessageSid -> 400', async () => {
    const p: Record<string, string> = { From: NUM, Body: 'hi' }
    expect((await POST(req(p))).status).toBe(400)
  })
  it('missing From -> 400', async () => {
    const p: Record<string, string> = { MessageSid: 'SM1', Body: 'hi' }
    expect((await POST(req(p))).status).toBe(400)
  })
})

describe('STOP', () => {
  it('valid STOP -> message row + REVOKED once, proof preserved', async () => {
    db.consentRecord.push(grantedRow())
    const res = await POST(req(msg('STOP')))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/xml')
    expect(await res.text()).toBe(EMPTY)
    expect(db.smsMessage).toHaveLength(1)
    expect(db.smsMessage[0]).toMatchObject({
      direction: 'INBOUND', phone: NUM, status: 'received', classification: 'SMS_CUSTOMER_CARE',
      keywordClass: 'STOP', twilioMessageSid: 'SM' + 'a'.repeat(32),
    })
    const rec = db.consentRecord[0]
    expect(rec.status).toBe('REVOKED')
    expect(rec.revokedAt).toBeInstanceOf(Date)
    expect(rec.consentedAt).toEqual(new Date('2026-01-01'))
    expect(rec.ipAddress).toBe('1.2.3.4')
    expect(rec.evidence).toBe('proof')
    const ev = db.consentEvent.filter((e) => e.eventType === 'REVOKED')
    expect(ev).toHaveLength(1)
    expect(ev[0].source).toBe('inbound_sms_stop')
  })

  it('Twilio retry of the same MessageSid -> no second event, still 200', async () => {
    db.consentRecord.push(grantedRow())
    await POST(req(msg('STOP')))
    const res = await POST(req(msg('STOP')))
    expect(res.status).toBe(200)
    expect(db.smsMessage).toHaveLength(1)
    expect(db.consentEvent).toHaveLength(1)
  })

  it('retry after crash (row exists, no revoke) still applies the STOP', async () => {
    db.consentRecord.push(grantedRow())
    db.failAfterMessage = true
    const first = await POST(req(msg('STOP')))
    expect(first.status).toBe(500)
    expect(db.smsMessage).toHaveLength(1)
    expect(db.consentRecord[0].status).toBe('GRANTED')
    db.failAfterMessage = false
    const retry = await POST(req(msg('STOP')))
    expect(retry.status).toBe(200)
    expect(db.smsMessage).toHaveLength(1)
    expect(db.consentRecord[0].status).toBe('REVOKED')
    expect(db.consentEvent.filter((e) => e.eventType === 'REVOKED')).toHaveLength(1)
  })

  it('STOP from a number with no row -> REVOKED row, never GRANTED', async () => {
    await POST(req(msg('stop')))
    expect(db.consentRecord).toHaveLength(1)
    expect(db.consentRecord[0].status).toBe('REVOKED')
    expect(db.consentRecord.some((r) => r.status === 'GRANTED')).toBe(false)
  })

  it('OptOutType=STOP is honoured for a non-keyword body', async () => {
    await POST(req(msg('whatever', { OptOutType: 'STOP' })))
    expect(db.smsMessage[0].keywordClass).toBe('STOP')
    expect(db.consentRecord[0].status).toBe('REVOKED')
  })
})

describe('START / HELP / OTHER', () => {
  it('START after STOP keeps REVOKED, records only PROVIDER_START', async () => {
    db.consentRecord.push(grantedRow())
    await POST(req(msg('STOP')))
    const res = await POST(req(msg('START', { MessageSid: 'SM' + 'b'.repeat(32) })))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(EMPTY)
    expect(db.consentRecord[0].status).toBe('REVOKED')
    expect(db.consentRecord[0].revokedAt).not.toBeNull()
    expect(db.consentEvent.map((e) => e.eventType)).toEqual(['REVOKED', 'PROVIDER_START'])
  })

  it('START from unknown number creates no consent row', async () => {
    await POST(req(msg('YES')))
    expect(db.consentRecord).toHaveLength(0)
    expect(db.consentEvent.map((e) => e.eventType)).toEqual(['PROVIDER_START'])
  })

  it('HELP -> event only, empty TwiML by default', async () => {
    const res = await POST(req(msg('HELP')))
    expect(await res.text()).toBe(EMPTY)
    expect(db.consentRecord).toHaveLength(0)
    expect(db.consentEvent.map((e) => e.eventType)).toEqual(['PROVIDER_HELP'])
  })

  it('HELP returns SMS_HELP_REPLY only when TWILIO_SMS_APP_HELP_REPLY=1', async () => {
    process.env.TWILIO_SMS_APP_HELP_REPLY = '1'
    const res = await POST(req(msg('HELP')))
    const text = await res.text()
    expect(text).toContain('<Message>')
    expect(text).toContain('Msg&amp;data rates may apply')
    expect(SMS_HELP_REPLY).toContain('Reply STOP to opt out')
    expect(SMS_HELP_REPLY).toContain('contact@walztravels.com')
    // never a reply for STOP/START even when enabled
    const stop = await POST(req(msg('STOP', { MessageSid: 'SM' + 'c'.repeat(32) })))
    expect(await stop.text()).toBe(EMPTY)
  })

  it("'please stop calling' is OTHER -> no revoke", async () => {
    db.consentRecord.push(grantedRow())
    await POST(req(msg('please stop calling')))
    expect(db.smsMessage[0].keywordClass).toBe('OTHER')
    expect(db.consentRecord[0].status).toBe('GRANTED')
    expect(db.consentEvent).toHaveLength(0)
  })
})

describe('refusals / failures / identity', () => {
  it("'whatsapp:+1…' From is not persisted as SMS", async () => {
    const res = await POST(req(msg('STOP', { From: 'whatsapp:' + NUM })))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(EMPTY)
    expect(db.smsMessage).toHaveLength(0)
    expect(db.consentRecord).toHaveLength(0)
    expect(db.consentEvent).toHaveLength(0)
  })

  it('DB failure -> 500 so Twilio retries', async () => {
    db.failWrites = true
    expect((await POST(req(msg('hello')))).status).toBe(500)
  })

  it('sets clientId only for a single registered-user exact match', async () => {
    ;(findCredibleDuplicate as jest.Mock).mockResolvedValue({ status: 'found', candidate: { type: 'user', id: 'u1' } })
    await POST(req(msg('hello')))
    expect(db.smsMessage[0].clientId).toBe('u1')
  })
  it('leaves clientId null for a lead match or ambiguity', async () => {
    ;(findCredibleDuplicate as jest.Mock).mockResolvedValue({ status: 'found', candidate: { type: 'lead', id: 'l1' } })
    await POST(req(msg('a')))
    ;(findCredibleDuplicate as jest.Mock).mockResolvedValue({ status: 'ambiguous', candidates: [] })
    await POST(req(msg('b', { MessageSid: 'SM' + 'd'.repeat(32) })))
    expect(db.smsMessage.map((m) => m.clientId)).toEqual([null, null])
  })
})
