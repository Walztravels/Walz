/** A2P CUSTOMER_CARE SMS — outbound sender. Prisma + fetch are mocked; no network. */

type Row = Record<string, unknown> & { id: string }
const mockRows: Row[] = []
const mockPrisma = {
  smsMessage: {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (mockRows.some((r) => r.idempotencyKey === data.idempotencyKey)) {
        throw Object.assign(new Error('unique'), { code: 'P2002' })
      }
      const row = { id: `m${mockRows.length + 1}`, twilioMessageSid: null, ...data } as Row
      mockRows.push(row)
      return row
    }),
    findUnique: jest.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
      mockRows.find((r) => r.idempotencyKey === where.idempotencyKey) ?? null),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const r = mockRows.find((x) => x.id === where.id)!
      Object.assign(r, data)
      return r
    }),
  },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

const mockConsent = jest.fn()
const mockRevoke = jest.fn()
jest.mock('@/lib/sms/consent', () => ({
  hasSmsCustomerCareConsent: (...a: unknown[]) => mockConsent(...a),
  revokeSmsCustomerCare: (...a: unknown[]) => mockRevoke(...a),
}))

import fs from 'fs'
import path from 'path'
import { sendCustomerCareSms } from '@/lib/sms/sender'

const SVC = 'MG' + 'a'.repeat(32)
const fetchMock = jest.fn()
const ENV_KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_SMS_CUSTOMER_CARE_MESSAGING_SERVICE_SID', 'TWILIO_MESSAGING_SERVICE_SID']
const saved: Record<string, string | undefined> = {}

function base(over: Record<string, unknown> = {}) {
  return {
    recipient: '+12317902336', message: 'Your booking is confirmed', classification: 'SMS_CUSTOMER_CARE',
    idempotencyKey: 'k1', contextRef: 'booking:WZ-1', ...over,
  }
}
function ok(sid = 'SM1', status = 'queued') {
  return { ok: true, status: 201, json: async () => ({ sid, status }) }
}

beforeEach(() => {
  ENV_KEYS.forEach((k) => { saved[k] = process.env[k] })
  process.env.TWILIO_ACCOUNT_SID = 'ACtest'
  process.env.TWILIO_AUTH_TOKEN = 'tok'
  process.env.TWILIO_SMS_CUSTOMER_CARE_MESSAGING_SERVICE_SID = SVC
  delete process.env.TWILIO_MESSAGING_SERVICE_SID
  jest.clearAllMocks()
  mockRows.length = 0
  mockConsent.mockResolvedValue({ allowed: true, reason: 'OK', e164: '+12317902336' })
  mockRevoke.mockResolvedValue('REVOKED')
  fetchMock.mockReset()
  ;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] })
})

describe('sendCustomerCareSms — happy path', () => {
  it('makes exactly one Twilio call with a bare E.164 To, the SMS service SID, StatusCallback and no From', async () => {
    fetchMock.mockResolvedValue(ok('SM123', 'queued'))
    const r = await sendCustomerCareSms(base())
    expect(r).toMatchObject({ ok: true, duplicate: false, twilioMessageSid: 'SM123', status: 'queued' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json')
    const p = new URLSearchParams(init.body as string)
    expect(p.get('To')).toBe('+12317902336')
    expect(p.get('To')).not.toContain('whatsapp:')
    expect(p.get('MessagingServiceSid')).toBe(SVC)
    expect(p.get('StatusCallback')).toBe('https://www.walztravels.com/api/webhooks/twilio-sms/status')
    expect(p.has('From')).toBe(false)
    expect(init.headers.Authorization).toMatch(/^Basic /)
    expect(mockRows[0]).toMatchObject({ direction: 'OUTBOUND', status: 'queued', twilioMessageSid: 'SM123', classification: 'SMS_CUSTOMER_CARE', consentPurpose: 'SMS_CUSTOMER_CARE', phone: '+12317902336' })
  })
})

describe('consent gate — Twilio never called', () => {
  const cases: Array<[string, string]> = [
    ['NO_RECORD', 'NO_CONSENT'], ['NUMBER_MISMATCH', 'NO_CONSENT'], ['REVOKED', 'CONSENT_REVOKED'],
    ['NOT_GRANTED', 'CONSENT_NOT_GRANTED'], ['WRONG_PURPOSE', 'CONSENT_WRONG_PURPOSE'],
    ['LOOKUP_FAILED', 'CONSENT_LOOKUP_FAILED'], ['INVALID_NUMBER', 'INVALID_NUMBER'],
  ]
  it.each(cases)('%s -> %s', async (reason, expected) => {
    mockConsent.mockResolvedValue({ allowed: false, reason })
    const r = await sendCustomerCareSms(base())
    expect(r).toEqual({ ok: false, refused: true, reason: expected })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockPrisma.smsMessage.create).not.toHaveBeenCalled()
  })
})

describe('classification / input refusals — Twilio never called', () => {
  it.each(['SMS_MARKETING', 'MARKETING', 'PROMOTIONAL', 'BROADCAST', ' sms_marketing ', 'Marketing', '  broadcast\n', 'promotional'])(
    'forbidden %j', async (c) => {
      expect(await sendCustomerCareSms(base({ classification: c }))).toEqual({ ok: false, refused: true, reason: 'FORBIDDEN_CLASSIFICATION' })
      expect(fetchMock).not.toHaveBeenCalled()
    })
  it('unknown / empty classification is INVALID_CLASSIFICATION; case variants of the allowed class are not accepted', async () => {
    for (const c of ['', 'OTHER', 'sms_customer_care']) {
      expect(await sendCustomerCareSms(base({ classification: c }))).toEqual({ ok: false, refused: true, reason: 'INVALID_CLASSIFICATION' })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('missing idempotency key / empty or long message / bad numbers', async () => {
    expect(await sendCustomerCareSms(base({ idempotencyKey: '  ' }))).toMatchObject({ reason: 'MISSING_IDEMPOTENCY_KEY' })
    expect(await sendCustomerCareSms(base({ idempotencyKey: 'x'.repeat(201) }))).toMatchObject({ reason: 'MISSING_IDEMPOTENCY_KEY' })
    expect(await sendCustomerCareSms(base({ message: '   ' }))).toMatchObject({ reason: 'EMPTY_MESSAGE' })
    expect(await sendCustomerCareSms(base({ message: 'x'.repeat(1601) }))).toMatchObject({ reason: 'MESSAGE_TOO_LONG' })
    expect(await sendCustomerCareSms(base({ recipient: 'garbage' }))).toMatchObject({ reason: 'INVALID_NUMBER' })
    expect(await sendCustomerCareSms(base({ recipient: '08031234567' }))).toMatchObject({ reason: 'INVALID_NUMBER' })
    expect(await sendCustomerCareSms(base({ recipient: 'whatsapp:+12317902336' }))).toMatchObject({ reason: 'INVALID_NUMBER' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockConsent).not.toHaveBeenCalled()
  })
})

describe('config fails closed', () => {
  it.each([
    ['missing service SID', () => delete process.env.TWILIO_SMS_CUSTOMER_CARE_MESSAGING_SERVICE_SID],
    ['invalid service SID', () => { process.env.TWILIO_SMS_CUSTOMER_CARE_MESSAGING_SERVICE_SID = 'not-a-sid' }],
    ['missing account SID', () => delete process.env.TWILIO_ACCOUNT_SID],
    ['missing auth token', () => delete process.env.TWILIO_AUTH_TOKEN],
  ])('%s -> CONFIG_MISSING', async (_n, mutate) => {
    mutate()
    expect(await sendCustomerCareSms(base())).toEqual({ ok: false, refused: true, reason: 'CONFIG_MISSING' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('TWILIO_MESSAGING_SERVICE_SID alone does NOT enable SMS (no fallback)', async () => {
    delete process.env.TWILIO_SMS_CUSTOMER_CARE_MESSAGING_SERVICE_SID
    process.env.TWILIO_MESSAGING_SERVICE_SID = SVC
    expect(await sendCustomerCareSms(base())).toMatchObject({ reason: 'CONFIG_MISSING' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('idempotency (at-most-once)', () => {
  it('same key twice -> one provider call, second is duplicate', async () => {
    fetchMock.mockResolvedValue(ok('SM9', 'queued'))
    const a = await sendCustomerCareSms(base())
    const b = await sendCustomerCareSms(base())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).toMatchObject({ ok: true, duplicate: false })
    expect(b).toMatchObject({ ok: true, duplicate: true, twilioMessageSid: 'SM9', messageId: (a as { messageId: string }).messageId })
  })
})

describe('provider errors', () => {
  it('Twilio error -> row failed, safe message, raw body never persisted', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ code: 30003, message: 'Secret body echo +12317902336 Your booking is confirmed' }) })
    const r = await sendCustomerCareSms(base())
    expect(r).toMatchObject({ ok: false, refused: false, reason: 'PROVIDER_ERROR', errorCode: '30003' })
    expect(mockRows[0]).toMatchObject({ status: 'failed', errorCode: '30003', errorMessageSafe: 'Handset unreachable' })
    const persisted = JSON.stringify(mockPrisma.smsMessage.update.mock.calls)
    expect(persisted).not.toContain('Secret body echo')
    const logged = JSON.stringify((console.error as jest.Mock).mock.calls)
    expect(logged).not.toContain('Secret body echo')
    expect(logged).not.toContain('12317902336')
    expect(logged).not.toContain('tok')
    expect(mockRevoke).not.toHaveBeenCalled()
  })
  it('21610 mirrors the provider opt-out via revokeSmsCustomerCare', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ code: 21610 }) })
    const r = await sendCustomerCareSms(base())
    expect(r).toMatchObject({ reason: 'PROVIDER_ERROR', errorCode: '21610' })
    expect(mockRevoke).toHaveBeenCalledWith({
      e164: '+12317902336', providerMessageSid: `provider_error_21610:${mockRows[0].id}`, source: 'twilio_error_21610',
    })
  })
  it('a failing revoke mirror never breaks the result', async () => {
    mockRevoke.mockRejectedValue(new Error('db'))
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ code: 21610 }) })
    expect(await sendCustomerCareSms(base())).toMatchObject({ reason: 'PROVIDER_ERROR' })
  })
  it('timeout -> failed/TIMEOUT, no retry', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    const r = await sendCustomerCareSms(base())
    expect(r).toMatchObject({ reason: 'PROVIDER_ERROR', errorCode: 'TIMEOUT' })
    expect(mockRows[0]).toMatchObject({ status: 'failed', errorCode: 'TIMEOUT' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('lib/sms is SMS-only (never WhatsApp)', () => {
  const dir = path.join(process.cwd(), 'lib/sms')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'))
  it.each(files)('%s has no twilio-whatsapp import and no whatsapp: literal', (f) => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')   // prose may name the module; code may not
    expect(src).not.toMatch(/twilio-whatsapp/)
    expect(src).not.toMatch(/['"`]whatsapp:/i)
  })
})
