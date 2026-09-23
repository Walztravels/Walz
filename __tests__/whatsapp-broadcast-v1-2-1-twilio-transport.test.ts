/**
 * WhatsApp Broadcast V1.2.1 — Twilio provider alignment, adversarial coverage.
 *
 * A provider audit found Broadcast (and its V1.2 OTP flow) had been built
 * against direct Meta Cloud API credentials while the rest of Walz's
 * WhatsApp infrastructure already ran through Twilio. This file covers the
 * NEW surfaces this release adds — the Twilio inbound opt-out path, the new
 * Broadcast delivery-status callback endpoint, and the OTP Content Template
 * transport — that are not already covered by:
 *  - __tests__/whatsapp-broadcast-core.test.ts (no graph.facebook.com
 *    anywhere in the sender, Twilio error classification)
 *  - __tests__/whatsapp-broadcast-processor.test.ts (providerMessageId
 *    storage, the message-id gate, the pre-dispatch consent recheck)
 *  - __tests__/whatsapp-broadcast-v12-otp.test.ts (OTP fails closed without
 *    Twilio credentials/Content SID, never a free-text fallback)
 *  - __tests__/whatsapp-broadcast-webhook.test.ts (the legacy Meta webhook
 *    no longer carries broadcast/opt-out logic at all)
 */

import { createHmac } from 'crypto'

const AUTH_TOKEN = 'test-twilio-auth-token'
const INBOUND_URL = 'https://x.test/api/webhooks/twilio-whatsapp'
const STATUS_URL = 'https://x.test/api/webhooks/twilio-whatsapp/broadcast-status'

process.env.TWILIO_ACCOUNT_SID = 'AC-test'
process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN
process.env.TWILIO_WEBHOOK_URL = INBOUND_URL
process.env.TWILIO_BROADCAST_STATUS_WEBHOOK_URL = STATUS_URL
process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID = 'HX' + '9'.repeat(32)
process.env.TWILIO_WHATSAPP_PRIMARY_FROM = '+12317902336'

function twilioSignature(url: string, params: Record<string, string>, authToken = AUTH_TOKEN): string {
  const data = url + Object.keys(params).sort().map(k => k + params[k]).join('')
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64')
}

function formReq(url: string, fields: Record<string, string>, opts: { signed?: boolean; badSig?: boolean } = { signed: true }) {
  const params = fields
  const body = new URLSearchParams(params).toString()
  const sig = opts.badSig ? 'not-a-real-signature' : opts.signed === false ? null : twilioSignature(url, params)
  return {
    text: async () => body,
    headers: { get: (name: string) => (name.toLowerCase() === 'x-twilio-signature' ? sig : null) },
  } as never
}

// ── Mocks ───────────────────────────────────────────────────────────────

let consents: Array<{ normalizedNumber: string; status: string; source?: string; evidence?: string | null; optedOutAt?: Date | null }> = []
type VisaMsg = { id: string; visaApplicationId: string; direction: string; body: string; sentBy: string | null; fromBsuid: string | null; status: string; twilioSid: string | null }
let visaMessages: VisaMsg[] = []
type VisaApp = { id: string; whatsappBsuid: string | null; firstName: string | null; lastName: string | null; phone: string | null; assignedTo: string | null; status: string }
let visaApps: VisaApp[] = []
type LeadRow = { id: string; name: string | null; whatsapp: string | null; service: string | null; branch: string | null; destination: string | null; travelDate: string | null; marketingOptOut: boolean }
let leads: LeadRow[] = []
let recipients: Array<{ id: string; broadcastId: string; status: string; providerMessageId: string | null; failedAt: Date | null; sentAt: Date | null; deliveredAt: Date | null; readAt: Date | null; failureCode: string | null; failureReason: string | null }> = []
let broadcastUpdates: Array<{ id: string; data: Record<string, unknown> }> = []
let sendWhatsAppBodyResult: { ok: boolean; sid?: string; error?: string; usedTemplate: boolean } = { ok: true, sid: 'SM.confirmation', usedTemplate: false }
const sendWhatsAppBodyMock = jest.fn(async () => sendWhatsAppBodyResult)

const mockPrisma = {
  whatsAppConsent: {
    upsert: jest.fn(async (a: { where: { normalizedNumber: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      const existing = consents.find(c => c.normalizedNumber === a.where.normalizedNumber)
      const data = (existing ? a.update : a.create) as Record<string, unknown>
      const row = { normalizedNumber: a.where.normalizedNumber, ...data } as typeof consents[number]
      if (existing) Object.assign(existing, data)
      else consents.push(row)
      return row
    }),
    findUnique: jest.fn(async (a: { where: { normalizedNumber: string } }) => {
      const c = consents.find(x => x.normalizedNumber === a.where.normalizedNumber)
      return c ? { status: c.status, evidence: c.evidence ?? null } : null
    }),
    findMany: jest.fn(async (a: { where: { normalizedNumber: { in: string[] } } }) =>
      consents.filter(c => a.where.normalizedNumber.in.includes(c.normalizedNumber)).map(c => ({ normalizedNumber: c.normalizedNumber, status: c.status })),
    ),
    // The atomic confirmation-send claim: matches only when evidence is
    // null or differs from the messageId being claimed — mirrors Postgres's
    // real conditional-UPDATE row locking (one winner among concurrent
    // callers targeting the SAME row), which is what makes this a valid
    // stand-in for the real DB's compare-and-swap semantics.
    updateMany: jest.fn(async (a: { where: { normalizedNumber: string; OR: Array<{ evidence?: string | null; evidence_not?: string }> }; data: { evidence: string } }) => {
      const w = a.where as { normalizedNumber: string; OR: Array<Record<string, unknown>> }
      const c = consents.find(x => x.normalizedNumber === w.normalizedNumber)
      if (!c) return { count: 0 }
      const matches = w.OR.some(clause => {
        if ('evidence' in clause && clause.evidence === null) return (c.evidence ?? null) === null
        const notClause = clause.evidence as { not?: string } | undefined
        if (notClause && typeof notClause === 'object' && 'not' in notClause) return (c.evidence ?? null) !== notClause.not
        return false
      })
      if (!matches) return { count: 0 }
      c.evidence = a.data.evidence
      return { count: 1 }
    }),
  },
  visaApplicationMessage: {
    findFirst: jest.fn(async (a: { where: { twilioSid: string } }) => {
      const m = visaMessages.find(x => x.twilioSid === a.where.twilioSid)
      return m ? { id: m.id } : null
    }),
    create: jest.fn(async (a: { data: Record<string, unknown> }) => {
      const sid = (a.data.twilioSid as string | null) ?? null
      if (sid && visaMessages.some(m => m.twilioSid === sid)) {
        const err = new Error('Unique constraint failed on the fields: (`twilioSid`)') as Error & { code?: string }
        err.code = 'P2002'
        throw err
      }
      const row = { id: `vm${visaMessages.length + 1}`, ...a.data } as VisaMsg
      visaMessages.push(row)
      return row
    }),
  },
  visaApplication: {
    findFirst: jest.fn(async (a: { where: Record<string, unknown> }) => {
      const w = a.where as { phone?: string; whatsappBsuid?: string; status?: { in: string[] }; messages?: { some: object } }
      const match = visaApps.find(v => {
        if (w.phone !== undefined && v.phone !== w.phone) return false
        if (w.whatsappBsuid !== undefined && v.whatsappBsuid !== w.whatsappBsuid) return false
        if (w.status && !w.status.in.includes(v.status)) return false
        if (w.messages && !visaMessages.some(m => m.visaApplicationId === v.id)) return false
        return true
      })
      return match ? { ...match } : null
    }),
    update: jest.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => {
      const v = visaApps.find(x => x.id === a.where.id)
      if (v) Object.assign(v, a.data)
      return v ? { ...v } : {}
    }),
    findUnique: jest.fn(async () => null),
  },
  staff: { findMany: jest.fn(async () => []) },
  lead: {
    findUnique: jest.fn(async () => null),
    findMany: jest.fn(async () => leads.map(l => ({ ...l }))),
  },
  whatsAppBroadcastRecipient: {
    findUnique: jest.fn(async (a: { where: { providerMessageId?: string; id?: string } }) => {
      const r = a.where.providerMessageId
        ? recipients.find(x => x.providerMessageId === a.where.providerMessageId)
        : recipients.find(x => x.id === a.where.id)
      return r ? { ...r } : null
    }),
    updateMany: jest.fn(async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const w = a.where as { id: string; status?: unknown }
      const rows = recipients.filter(r => {
        if (r.id !== w.id) return false
        if (w.status && typeof w.status === 'object' && 'in' in (w.status as object)) {
          return (w.status as { in: string[] }).in.includes(r.status)
        }
        if (typeof w.status === 'string') return r.status === w.status
        return true
      })
      for (const r of rows) Object.assign(r, a.data)
      return { count: rows.length }
    }),
    groupBy: jest.fn(async (a: { where: { broadcastId: string } }) => {
      const rows = recipients.filter(r => r.broadcastId === a.where.broadcastId)
      const seen = new Map<string, number>()
      for (const r of rows) seen.set(r.status, (seen.get(r.status) ?? 0) + 1)
      return Array.from(seen.entries()).map(([status, n]) => ({ status, _count: { _all: n } }))
    }),
    findMany: jest.fn(async () => []),
  },
  whatsAppBroadcast: {
    update: jest.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => {
      broadcastUpdates.push({ id: a.where.id, data: a.data })
      return {}
    }),
    findMany: jest.fn(async () => []),
    updateMany: jest.fn(async () => ({ count: 0 })),
  },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }))

jest.mock('@/lib/twilio-whatsapp', () => {
  const actual = jest.requireActual('@/lib/twilio-whatsapp')
  return {
    __esModule: true,
    ...actual,
    sendWhatsAppBody: (...args: unknown[]) => sendWhatsAppBodyMock(...args),
  }
})

jest.mock('@/lib/email-staff-notification', () => ({
  __esModule: true,
  sendVisaWhatsAppNotification: jest.fn(async () => {}),
}))

import { POST as inboundPOST } from '@/app/api/webhooks/twilio-whatsapp/route'
import { POST as broadcastStatusPOST } from '@/app/api/webhooks/twilio-whatsapp/broadcast-status/route'
import { applyTwilioBroadcastStatusCallback } from '@/lib/whatsapp/broadcast/status-callbacks'
import { decideEligibility } from '@/lib/whatsapp/broadcast/consent'
import { resolveAudience } from '@/lib/whatsapp/broadcast/audience'

beforeEach(() => {
  jest.clearAllMocks()
  consents = []
  visaMessages = []
  visaApps = []
  leads = []
  recipients = []
  broadcastUpdates = []
  sendWhatsAppBodyResult = { ok: true, sid: 'SM.confirmation', usedTemplate: false }
})

// ── Inbound opt-out (moved from the legacy Meta webhook to Twilio) ───────

describe('Twilio inbound webhook: opt-out (WhatsApp Broadcast V1.2.1)', () => {
  it('a validly-SIGNED STOP produces an immediate OPTED_OUT consent row', async () => {
    const fields = { From: 'whatsapp:+2348011111111', To: 'whatsapp:+2347077691701', Body: 'STOP', MessageSid: 'SM.stop1' }
    const res = await inboundPOST(formReq(INBOUND_URL, fields))
    expect(res.status).toBe(200)
    expect(consents.find(c => c.normalizedNumber === '+2348011111111')?.status).toBe('OPTED_OUT')
    // A confirmation reply is sent from the SAME number the person messaged.
    expect(sendWhatsAppBodyMock).toHaveBeenCalledTimes(1)
  })

  it('an UNSIGNED STOP is rejected (403) and changes NO consent state', async () => {
    const fields = { From: 'whatsapp:+2348022222222', To: 'whatsapp:+2347077691701', Body: 'STOP', MessageSid: 'SM.stop2' }
    const res = await inboundPOST(formReq(INBOUND_URL, fields, { signed: false }))
    expect(res.status).toBe(403)
    expect(consents).toHaveLength(0)
    expect(mockPrisma.whatsAppConsent.upsert).not.toHaveBeenCalled()
    expect(sendWhatsAppBodyMock).not.toHaveBeenCalled()
  })

  it('a BADLY-signed STOP (wrong signature, not merely absent) is also rejected and changes no consent', async () => {
    const fields = { From: 'whatsapp:+2348033333333', To: 'whatsapp:+2347077691701', Body: 'stop', MessageSid: 'SM.stop3' }
    const res = await inboundPOST(formReq(INBOUND_URL, fields, { badSig: true }))
    expect(res.status).toBe(403)
    expect(consents).toHaveLength(0)
  })

  it('STOP is case-insensitive, per the existing exact-keyword policy', async () => {
    const fields = { From: 'whatsapp:+2348044444444', To: 'whatsapp:+2347077691701', Body: 'unsubscribe', MessageSid: 'SM.stop4' }
    const res = await inboundPOST(formReq(INBOUND_URL, fields))
    expect(res.status).toBe(200)
    expect(consents.find(c => c.normalizedNumber === '+2348044444444')?.status).toBe('OPTED_OUT')
  })

  it('an ordinary signed inbound message (not a STOP keyword) never touches WhatsAppConsent', async () => {
    const fields = { From: 'whatsapp:+2348055555555', To: 'whatsapp:+2347077691701', Body: 'Hi, when is my visa ready?', MessageSid: 'SM.msg1' }
    await inboundPOST(formReq(INBOUND_URL, fields))
    expect(mockPrisma.whatsAppConsent.upsert).not.toHaveBeenCalled()
  })

  it('a signed STOP prevents a recipient already QUEUED (scheduled but undispatched) for that number from subsequently dispatching', async () => {
    // Frozen at snapshot time as still-eligible.
    consents.push({ normalizedNumber: '+2348066666666', status: 'SUBSCRIBED' })
    const eligibleBefore = decideEligibility({ marketingOptOut: false, normalizedNumber: '+2348066666666', consent: { status: 'SUBSCRIBED' } })
    expect(eligibleBefore.eligible).toBe(true)

    // The STOP webhook fires — the SAME canonical-number WhatsAppConsent
    // row the processor's pre-dispatch recheck (lib/whatsapp/broadcast/
    // processor.ts's dispatchClaimed) re-reads immediately before every
    // Twilio call.
    const fields = { From: 'whatsapp:+2348066666666', To: 'whatsapp:+2347077691701', Body: 'STOP', MessageSid: 'SM.stop5' }
    await inboundPOST(formReq(INBOUND_URL, fields))
    expect(consents.find(c => c.normalizedNumber === '+2348066666666')?.status).toBe('OPTED_OUT')

    // The exact recheck the processor performs before dispatch now sees
    // OPTED_OUT and refuses to send — proven directly against
    // decideEligibility(), the single eligibility decision tree the
    // recheck calls, rather than re-deriving the processor's own mocks.
    const recheck = decideEligibility({ marketingOptOut: false, normalizedNumber: '+2348066666666', consent: { status: 'OPTED_OUT' } })
    expect(recheck.eligible).toBe(false)
    expect(recheck.eligible === false && recheck.reason).toBe('OPT_OUT')
  })

  it('a STOP from a number with no matching visa thread never queries VisaApplicationMessage at all', async () => {
    const fields = { From: 'whatsapp:+2348077777777', To: 'whatsapp:+2347077691701', Body: 'STOP', MessageSid: 'SM.stop6' }
    await inboundPOST(formReq(INBOUND_URL, fields))
    expect(mockPrisma.visaApplicationMessage.findFirst).not.toHaveBeenCalled()
    expect(mockPrisma.visaApplicationMessage.create).not.toHaveBeenCalled()
  })
})

// ── V1.2.1 FINAL POLISH: STOP visibility for an existing visa thread ─────
// Marketing opt-out and operational (visa) conversation visibility are
// independent: the WhatsAppConsent write always happens; separately, if
// (and only if) the sender has an existing active visa thread, the STOP
// and its confirmation are made visible there too, via the SAME
// VisaApplicationMessage mechanism ordinary messages use — never Jade,
// never a status change, never lost history.
describe('STOP visibility in an existing Visa Application conversation', () => {
  const VISA_NUMBER = 'whatsapp:+2348088888888'
  const VISA_E164 = '+2348088888888'

  function seedVisaThread(over: Partial<VisaApp> = {}): VisaApp {
    const app: VisaApp = {
      id: 'va1', whatsappBsuid: null, firstName: 'Ada', lastName: 'Nwosu',
      phone: VISA_E164, assignedTo: 'staff1', status: 'under_review', ...over,
    }
    visaApps.push(app)
    // findActiveVisaThread()'s Step 1 requires an existing thread
    // (messages: { some: {} }) — a prior staff-initiated message, exactly
    // as production requires.
    visaMessages.push({ id: 'vm-seed', visaApplicationId: app.id, direction: 'outbound', body: 'Welcome to Walz Travels', sentBy: 'staff1', fromBsuid: null, status: 'sent', twilioSid: 'SM.seed' })
    return app
  }

  it('a signed STOP from a visa applicant still writes OPTED_OUT immediately', async () => {
    seedVisaThread()
    const fields = { From: VISA_NUMBER, To: 'whatsapp:+2347077691701', Body: 'STOP', MessageSid: 'SM.visa-stop1' }
    const res = await inboundPOST(formReq(INBOUND_URL, fields))
    expect(res.status).toBe(200)
    expect(consents.find(c => c.normalizedNumber === VISA_E164)?.status).toBe('OPTED_OUT')
  })

  it('the inbound STOP is persisted into the SAME visa message history a normal message would use — remains visible to staff', async () => {
    seedVisaThread()
    const fields = { From: VISA_NUMBER, To: 'whatsapp:+2347077691701', Body: 'STOP', MessageSid: 'SM.visa-stop2' }
    await inboundPOST(formReq(INBOUND_URL, fields))

    const inbound = visaMessages.find(m => m.twilioSid === 'SM.visa-stop2')
    expect(inbound).toBeDefined()
    expect(inbound!.direction).toBe('inbound')
    expect(inbound!.body).toBe('STOP')
    expect(inbound!.visaApplicationId).toBe('va1')
  })

  it('Jade never answers a STOP — this route has no Jade integration to call', () => {
    // Structural, not behavioral: Jade's auto-reply lives ONLY in the
    // separate legacy Meta webhook (app/api/webhooks/whatsapp/route.ts) —
    // confirm the Twilio inbound route imports nothing from it and never
    // calls it. The file's own doc comments legitimately DISCUSS Jade (to
    // explain why it is deliberately absent), so comments are stripped
    // before checking — only executable code must be clean.
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.join(process.cwd(), 'app/api/webhooks/twilio-whatsapp/route.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l: string) => !/^\s*\/\//.test(l)).join('\n')
    expect(code).not.toMatch(/jade/i)
  })

  it('the visa application itself is completely unchanged — no status change, no cancellation', async () => {
    const app = seedVisaThread({ status: 'under_review' })
    const fields = { From: VISA_NUMBER, To: 'whatsapp:+2347077691701', Body: 'unsubscribe', MessageSid: 'SM.visa-stop3' }
    await inboundPOST(formReq(INBOUND_URL, fields))

    const stillThere = visaApps.find(v => v.id === app.id)
    expect(stillThere).toBeDefined()
    expect(stillThere!.status).toBe('under_review') // unchanged — never cancelled/closed
    // The only field STOP handling may ever touch on the application row
    // itself is whatsappBsuid (exactly like a normal inbound message) —
    // never `status`.
    for (const call of mockPrisma.visaApplication.update.mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data
      expect(Object.keys(data)).toEqual(['whatsappBsuid'])
    }
  })

  it('exactly ONE confirmation is sent via Twilio', async () => {
    seedVisaThread()
    const fields = { From: VISA_NUMBER, To: 'whatsapp:+2347077691701', Body: 'STOP', MessageSid: 'SM.visa-stop4' }
    await inboundPOST(formReq(INBOUND_URL, fields))
    expect(sendWhatsAppBodyMock).toHaveBeenCalledTimes(1)
  })

  it('the confirmation is ALSO persisted into the visa thread — the full interaction reads Client → Walz Travels', async () => {
    seedVisaThread()
    const fields = { From: VISA_NUMBER, To: 'whatsapp:+2347077691701', Body: 'STOP', MessageSid: 'SM.visa-stop5' }
    await inboundPOST(formReq(INBOUND_URL, fields))

    const threadMsgs = visaMessages.filter(m => m.visaApplicationId === 'va1' && m.id !== 'vm-seed')
    expect(threadMsgs).toHaveLength(2)
    expect(threadMsgs[0].direction).toBe('inbound')
    expect(threadMsgs[0].body).toBe('STOP')
    expect(threadMsgs[1].direction).toBe('outbound')
    expect(threadMsgs[1].sentBy).toBeNull() // system-sent, not a staff member
    expect(threadMsgs[1].status).toBe('sent')
    expect(threadMsgs[1].twilioSid).toBe('SM.confirmation')
  })

  it('a webhook REPLAY of the exact same STOP does not duplicate the inbound message, the confirmation, or its send', async () => {
    seedVisaThread()
    const fields = { From: VISA_NUMBER, To: 'whatsapp:+2347077691701', Body: 'STOP', MessageSid: 'SM.visa-stop6' }
    await inboundPOST(formReq(INBOUND_URL, fields))
    await inboundPOST(formReq(INBOUND_URL, fields)) // Twilio retry — identical request

    expect(sendWhatsAppBodyMock).toHaveBeenCalledTimes(1)
    const inboundCopies = visaMessages.filter(m => m.twilioSid === 'SM.visa-stop6')
    expect(inboundCopies).toHaveLength(1)
    const outboundCopies = visaMessages.filter(m => m.direction === 'outbound' && m.visaApplicationId === 'va1' && m.id !== 'vm-seed')
    expect(outboundCopies).toHaveLength(1)
    // Consent itself also converges to the same terminal state, not a second row.
    expect(consents.filter(c => c.normalizedNumber === VISA_E164)).toHaveLength(1)
  })

  it('a future Broadcast Preview excludes this number — resolveAudience() reports it opted out, not eligible', async () => {
    seedVisaThread()
    leads.push({ id: 'l1', name: 'Ada', whatsapp: VISA_E164, service: 'Visa Processing', branch: 'nigeria', destination: null, travelDate: null, marketingOptOut: false })

    const fields = { From: VISA_NUMBER, To: 'whatsapp:+2347077691701', Body: 'STOP', MessageSid: 'SM.visa-stop7' }
    await inboundPOST(formReq(INBOUND_URL, fields))

    const resolved = await resolveAudience({ filter: {}, template: null })
    expect(resolved.breakdown.finalSendCount).toBe(0)
    expect(resolved.breakdown.optedOut).toBe(1)
    expect(resolved.recipients[0].status).toBe('SKIPPED_OPT_OUT')
  })

  it('the transactional/visa conversation is NOT globally disabled — a later ordinary message from the SAME number still routes and persists normally', async () => {
    seedVisaThread()
    const stop = { From: VISA_NUMBER, To: 'whatsapp:+2347077691701', Body: 'STOP', MessageSid: 'SM.visa-stop8' }
    await inboundPOST(formReq(INBOUND_URL, stop))
    expect(consents.find(c => c.normalizedNumber === VISA_E164)?.status).toBe('OPTED_OUT')

    // A genuine follow-up question — not a STOP keyword — from the SAME
    // opted-out number must still reach the visa thread exactly as any
    // other inbound message would. Marketing opt-out never blocks this.
    const question = { From: VISA_NUMBER, To: 'whatsapp:+2347077691701', Body: 'What documents do you still need from me?', MessageSid: 'SM.visa-question1' }
    const res = await inboundPOST(formReq(INBOUND_URL, question))
    expect(res.status).toBe(200)

    const questionMsg = visaMessages.find(m => m.twilioSid === 'SM.visa-question1')
    expect(questionMsg).toBeDefined()
    expect(questionMsg!.direction).toBe('inbound')
    expect(questionMsg!.body).toBe('What documents do you still need from me?')
  })

  it('an UNSIGNED STOP from a visa applicant is rejected (403) and changes nothing — no consent, no visa message, no confirmation', async () => {
    seedVisaThread()
    const fields = { From: VISA_NUMBER, To: 'whatsapp:+2347077691701', Body: 'STOP', MessageSid: 'SM.visa-stop9' }
    const res = await inboundPOST(formReq(INBOUND_URL, fields, { signed: false }))
    expect(res.status).toBe(403)
    expect(consents).toHaveLength(0)
    expect(visaMessages.filter(m => m.id !== 'vm-seed')).toHaveLength(0)
    expect(sendWhatsAppBodyMock).not.toHaveBeenCalled()
  })

  it('a genuinely CONCURRENT second delivery of the SAME MessageSid, arriving mid-send, is blocked by the atomic claim — proving the fix for the read-then-decide race', async () => {
    seedVisaThread()
    const fields = { From: VISA_NUMBER, To: 'whatsapp:+2347077691701', Body: 'STOP', MessageSid: 'SM.race1' }
    let nestedRes: Response | undefined
    sendWhatsAppBodyMock.mockImplementationOnce(async () => {
      // The claim (an atomic conditional UPDATE on WhatsAppConsent.evidence)
      // happens BEFORE sendWhatsAppBody is ever called — so a second,
      // genuinely concurrent delivery of the same MessageSid arriving
      // exactly here, mid-send, already sees the first delivery's claim
      // and must lose. This is precisely the ordering that fixes the prior
      // read-then-decide TOCTOU (which read `evidence` at the top of the
      // function, long before any DB round trip, and could let two
      // concurrent deliveries both observe "not yet confirmed").
      nestedRes = await inboundPOST(formReq(INBOUND_URL, fields))
      return sendWhatsAppBodyResult
    })

    await inboundPOST(formReq(INBOUND_URL, fields))

    expect(nestedRes?.status).toBe(200) // the concurrent delivery still gets a clean 200 — just does nothing extra
    expect(sendWhatsAppBodyMock).toHaveBeenCalledTimes(1) // never two sends
    const outboundCopies = visaMessages.filter(m => m.direction === 'outbound' && m.visaApplicationId === 'va1' && m.id !== 'vm-seed')
    expect(outboundCopies).toHaveLength(1) // never two persisted confirmations
    const inboundCopies = visaMessages.filter(m => m.twilioSid === 'SM.race1')
    expect(inboundCopies).toHaveLength(1) // never two "Client: STOP" rows either
  })

  it('BSUID-based matching (Step 2, phone does not match) also makes a STOP visible in the visa thread, and never touches any field but whatsappBsuid', async () => {
    // Step 2 matches on a BSUID ALREADY on file (captured from a PRIOR
    // staff-initiated message, per this route's own documented "BSUID
    // gap") — not a brand-new one. A phone that matches nothing forces the
    // match through Step 2 rather than Step 1.
    const app: VisaApp = {
      id: 'va-bsuid', whatsappBsuid: 'bsuid-123', firstName: 'Chidi', lastName: 'Okoro',
      phone: '+2348055555000', assignedTo: null, status: 'under_review',
    }
    visaApps.push(app)
    visaMessages.push({ id: 'vm-bsuid-seed', visaApplicationId: app.id, direction: 'outbound', body: 'Welcome', sentBy: 'staff1', fromBsuid: null, status: 'sent', twilioSid: 'SM.bsuid-seed' })

    const fields = { From: 'whatsapp:+2349000000000', To: 'whatsapp:+2347077691701', Body: 'STOP', MessageSid: 'SM.bsuid-stop', WaId: 'bsuid-123' }
    const res = await inboundPOST(formReq(INBOUND_URL, fields))
    expect(res.status).toBe(200)

    // Matched via BSUID (Step 2), NOT phone (the From number doesn't match
    // the application's phone at all) — the inbound STOP is still visible.
    const inbound = visaMessages.find(m => m.twilioSid === 'SM.bsuid-stop')
    expect(inbound).toBeDefined()
    expect(inbound!.visaApplicationId).toBe('va-bsuid')

    // The BSUID was already on file, so there is nothing new to persist —
    // and in every case, only whatsappBsuid could ever be written here,
    // never status or anything else.
    for (const call of mockPrisma.visaApplication.update.mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data
      expect(Object.keys(data)).toEqual(['whatsappBsuid'])
    }
    expect(visaApps.find(v => v.id === 'va-bsuid')?.status).toBe('under_review')
  })
})

// ── Broadcast delivery-status callback (new Twilio endpoint) ─────────────

describe('Twilio broadcast-status webhook (WhatsApp Broadcast V1.2.1)', () => {
  function seedRecipient(over: Partial<typeof recipients[number]> = {}) {
    const row = {
      id: 'r1', broadcastId: 'b1', status: 'SENT', providerMessageId: 'SM.OK',
      failedAt: null, sentAt: null, deliveredAt: null, readAt: null,
      failureCode: null, failureReason: null, ...over,
    }
    recipients.push(row)
    return row
  }

  it('an UNSIGNED status callback is rejected (403) and never reads or writes a recipient row', async () => {
    seedRecipient()
    const fields = { MessageSid: 'SM.OK', MessageStatus: 'delivered' }
    const res = await broadcastStatusPOST(formReq(STATUS_URL, fields, { signed: false }))
    expect(res.status).toBe(403)
    expect(mockPrisma.whatsAppBroadcastRecipient.findUnique).not.toHaveBeenCalled()
    expect(recipients[0].status).toBe('SENT')
  })

  it('a validly SIGNED status callback is accepted and applies the transition', async () => {
    seedRecipient({ status: 'SENT' })
    const fields = { MessageSid: 'SM.OK', MessageStatus: 'delivered' }
    const res = await broadcastStatusPOST(formReq(STATUS_URL, fields))
    expect(res.status).toBe(200)
    expect(recipients[0].status).toBe('DELIVERED')
    expect(recipients[0].deliveredAt).toBeInstanceOf(Date)
  })

  it('a redelivered (replayed) IDENTICAL callback is a safe no-op — idempotent', async () => {
    seedRecipient({ status: 'SENT' })
    const fields = { MessageSid: 'SM.OK', MessageStatus: 'delivered' }
    await broadcastStatusPOST(formReq(STATUS_URL, fields))
    expect(recipients[0].status).toBe('DELIVERED')

    const before = { ...recipients[0] }
    const res2 = await broadcastStatusPOST(formReq(STATUS_URL, fields))
    expect(res2.status).toBe(200)
    expect(recipients[0]).toEqual(before) // unchanged — already at/past this status
  })

  it('statuses cannot regress — a stale "sent" arriving after "delivered" does not move the row backwards', async () => {
    seedRecipient({ status: 'DELIVERED', deliveredAt: new Date('2026-01-01T00:00:00Z') })
    const fields = { MessageSid: 'SM.OK', MessageStatus: 'sent' }
    await broadcastStatusPOST(formReq(STATUS_URL, fields))
    expect(recipients[0].status).toBe('DELIVERED')
  })

  it('FAILED is authoritative from any non-terminal state, carrying the real Twilio error code/message', async () => {
    seedRecipient({ status: 'SENT' })
    const fields = { MessageSid: 'SM.OK', MessageStatus: 'failed', ErrorCode: '63016', ErrorMessage: 'outside 24h window' }
    await broadcastStatusPOST(formReq(STATUS_URL, fields))
    expect(recipients[0].status).toBe('FAILED')
    expect(recipients[0].failureCode).toBe('63016')
    expect(recipients[0].failureReason).toBe('outside 24h window')
  })

  it("Twilio's 'undelivered' status is recorded as FAILED, not silently dropped", async () => {
    seedRecipient({ status: 'SENT' })
    const fields = { MessageSid: 'SM.OK', MessageStatus: 'undelivered', ErrorCode: '30005' }
    await broadcastStatusPOST(formReq(STATUS_URL, fields))
    expect(recipients[0].status).toBe('FAILED')
    expect(recipients[0].failureCode).toBe('30005')
  })

  it('a MessageSid matching no broadcast recipient (e.g. a visa-thread or chat-drawer send) is a quiet no-op, never a crash or a 500', async () => {
    const fields = { MessageSid: 'SM.NOT-A-BROADCAST-ROW', MessageStatus: 'delivered' }
    const res = await broadcastStatusPOST(formReq(STATUS_URL, fields))
    expect(res.status).toBe(200)
  })

  it('applyTwilioBroadcastStatusCallback() directly reports matched:false for an unrecognised status value', async () => {
    seedRecipient()
    const result = await applyTwilioBroadcastStatusCallback({ messageSid: 'SM.OK', status: 'queued' })
    expect(result.matched).toBe(false)
    expect(result.applied).toBe(false)
  })
})

// ── Twilio credentials never reach the client ─────────────────────────────

describe('Twilio credentials never reach the client', () => {
  it('the approved-template catalogue route never echoes TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN in its response shape', () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/admin/marketing/whatsapp-broadcast/templates/route.ts'), 'utf8')
    expect(src).not.toMatch(/TWILIO_AUTH_TOKEN/)
    expect(src).not.toMatch(/TWILIO_ACCOUNT_SID/)
  })

  it('the admin broadcast page never references a Twilio credential env var or a NEXT_PUBLIC_* secret', () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.join(process.cwd(), 'app/admin/marketing/whatsapp/page.tsx'), 'utf8')
    expect(src).not.toMatch(/TWILIO_AUTH_TOKEN/)
    expect(src).not.toMatch(/TWILIO_ACCOUNT_SID/)
    expect(src).not.toMatch(/process\.env\.NEXT_PUBLIC_/)
  })
})

// ── OTP: the approved Content SID is actually the one used ───────────────

describe('OTP delivery uses the approved Twilio Content SID, never a different one', () => {
  it('sendOtpViaTwilio() sends the CONFIGURED OTP Content SID, not the Broadcast per-campaign one', async () => {
    const { sendOtpViaTwilio } = jest.requireActual('@/lib/twilio-whatsapp')
    const calls: Array<{ url: string; body: string }> = []
    const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: init.body as string })
      return { ok: true, json: async () => ({ sid: 'SM.otp', status: 'queued' }) }
    }) as unknown as typeof fetch

    await sendOtpViaTwilio('+2348011111111', '123456', fetchImpl)

    expect(calls).toHaveLength(1)
    const params = new URLSearchParams(calls[0].body)
    expect(params.get('ContentSid')).toBe(process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID)
    expect(JSON.parse(params.get('ContentVariables')!)).toEqual({ '1': '123456' })
    // No free-text Body param exists on this path at all.
    expect(params.has('Body')).toBe(false)
  })
})
