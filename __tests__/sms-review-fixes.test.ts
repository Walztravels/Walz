/** Regression tests for the independent-review fixes. No network; DB + Twilio mocked. */

type Row = Record<string, any> & { id: string }
const rows: Row[] = []
const mockPrisma: any = {
  smsMessage: {
    create: jest.fn(async ({ data }: any) => {
      if (rows.some((r) => r.idempotencyKey && r.idempotencyKey === data.idempotencyKey)) {
        throw Object.assign(new Error('unique'), { code: 'P2002' })
      }
      const r = { id: `m${rows.length + 1}`, twilioMessageSid: null, ...data }
      rows.push(r)
      return r
    }),
    findUnique: jest.fn(async ({ where }: any) => rows.find((r) => r.idempotencyKey === where.idempotencyKey) ?? null),
    update: jest.fn(async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id)!, data)),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
  },
  consentRecord: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  consentEvent: { create: jest.fn() },
}
mockPrisma.$transaction = async (cb: any) => cb(mockPrisma)
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }))
jest.mock('@/lib/inbox/client-identity', () => ({ findCredibleDuplicate: jest.fn() }))

const mockGate = jest.fn()
const mockRevoke = jest.fn()
const mockRecord = jest.fn()
jest.mock('@/lib/sms/consent', () => ({
  ...jest.requireActual('@/lib/sms/consent'),
  hasSmsCustomerCareConsent: (...a: unknown[]) => mockGate(...a),
  revokeSmsCustomerCare: (...a: unknown[]) => mockRevoke(...a),
  recordProviderSmsEvent: (...a: unknown[]) => mockRecord(...a),
}))

import { sendCustomerCareSms } from '@/lib/sms/sender'
import { applySmsStatusUpdate } from '@/lib/sms/status'
import { processInboundSms } from '@/lib/sms/inbound'
import { applySmsCustomerCareGrant } from '@/lib/sms/consent'
import { normalizeSmsNumber } from '@/lib/sms/normalize'

const SVC = 'MG' + 'b'.repeat(32)
const fetchMock = jest.fn()
beforeEach(() => {
  process.env.TWILIO_ACCOUNT_SID = 'ACtest'
  process.env.TWILIO_AUTH_TOKEN = 'tok'
  process.env.TWILIO_SMS_CUSTOMER_CARE_MESSAGING_SERVICE_SID = SVC
  jest.clearAllMocks()
  rows.length = 0
  mockGate.mockResolvedValue({ allowed: true, reason: 'OK', e164: '+12317902336' })
  mockRevoke.mockResolvedValue('REVOKED')
  mockRecord.mockResolvedValue('RECORDED')
  fetchMock.mockReset()
  ;(globalThis as any).fetch = fetchMock
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => { jest.useRealTimers() })

const msg = (o: Record<string, unknown> = {}) => ({
  recipient: '+12317902336', message: 'Hello', classification: 'SMS_CUSTOMER_CARE', idempotencyKey: 'k1', ...o,
})

describe('(1) sender clamps unexpected Twilio status', () => {
  it("'scheduled' -> stored as queued, ok:true, SID kept, row not failed", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: 'SM77', status: 'scheduled' }) })
    const r = await sendCustomerCareSms(msg())
    expect(r).toMatchObject({ ok: true, duplicate: false, twilioMessageSid: 'SM77', status: 'queued' })
    expect(rows[0]).toMatchObject({ status: 'queued', twilioMessageSid: 'SM77' })
    expect(rows[0].errorCode).toBeUndefined()
  })
})

describe('(2) idempotency key conflict', () => {
  it('different recipient or body -> IDEMPOTENCY_KEY_CONFLICT, no Twilio call; identical replay -> duplicate', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: 'SM1', status: 'queued' }) })
    await sendCustomerCareSms(msg())
    expect(fetchMock).toHaveBeenCalledTimes(1)

    mockGate.mockResolvedValue({ allowed: true, reason: 'OK', e164: '+12317902337' })
    expect(await sendCustomerCareSms(msg({ recipient: '+12317902337' })))
      .toEqual({ ok: false, refused: true, reason: 'IDEMPOTENCY_KEY_CONFLICT' })
    expect(await sendCustomerCareSms(msg({ message: 'Different body' })))
      .toEqual({ ok: false, refused: true, reason: 'IDEMPOTENCY_KEY_CONFLICT' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    expect(await sendCustomerCareSms(msg())).toMatchObject({ ok: true, duplicate: true, twilioMessageSid: 'SM1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('(3) status SID race', () => {
  it('SID not yet written: retries once after ~500ms and applies', async () => {
    jest.useFakeTimers()
    mockPrisma.smsMessage.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
    mockPrisma.smsMessage.findFirst.mockResolvedValue(null)
    const p = applySmsStatusUpdate({ messageSid: 'SMx', status: 'delivered' })
    await jest.advanceTimersByTimeAsync(499)
    expect(mockPrisma.smsMessage.updateMany).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(2)
    await expect(p).resolves.toBe('applied')
    expect(mockPrisma.smsMessage.updateMany).toHaveBeenCalledTimes(2)
  })
  it('row with that SID exists (terminal/stale): noop immediately, no wait, no retry', async () => {
    jest.useFakeTimers()
    mockPrisma.smsMessage.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.smsMessage.findFirst.mockResolvedValue({ id: 'm1' })
    await expect(applySmsStatusUpdate({ messageSid: 'SMx', status: 'sent' })).resolves.toBe('noop')
    expect(mockPrisma.smsMessage.updateMany).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })
  it('unknown SID both times: noop after one retry', async () => {
    jest.useFakeTimers()
    mockPrisma.smsMessage.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.smsMessage.findFirst.mockResolvedValue(null)
    const p = applySmsStatusUpdate({ messageSid: 'SMy', status: 'delivered' })
    await jest.advanceTimersByTimeAsync(600)
    await expect(p).resolves.toBe('noop')
    expect(mockPrisma.smsMessage.updateMany).toHaveBeenCalledTimes(2)
  })
})

describe('(4) inbound identity resolution only for ordinary messages', () => {
  const base = { messageSid: 'SMin1', from: '+12317902336' }
  it.each(['STOP', 'START', 'HELP'])('%s: resolver not called, clientId null', async (body) => {
    const resolveClientId = jest.fn().mockResolvedValue('user-1')
    await processInboundSms({ ...base, messageSid: 'SM' + body, body, resolveClientId })
    expect(resolveClientId).not.toHaveBeenCalled()
    expect(mockPrisma.smsMessage.create.mock.calls[0][0].data.clientId).toBeNull()
  })
  it('ordinary message: resolver called and clientId stored', async () => {
    const resolveClientId = jest.fn().mockResolvedValue('user-1')
    await processInboundSms({ ...base, body: 'Where is my ticket?', resolveClientId })
    expect(resolveClientId).toHaveBeenCalledWith('+12317902336')
    expect(mockPrisma.smsMessage.create.mock.calls[0][0].data.clientId).toBe('user-1')
  })
})

describe('(5) grant is guarded against a STOP landing after the read', () => {
  it('P2025 on the guarded update -> REGRANT_BLOCKED, event appended, row not granted', async () => {
    const existing = { id: 'c1', status: 'NOT_GRANTED', revokedAt: null }
    mockPrisma.consentRecord.findUnique.mockResolvedValue(existing)
    mockPrisma.consentRecord.update.mockRejectedValue(Object.assign(new Error('not found'), { code: 'P2025' }))
    const out = await applySmsCustomerCareGrant({
      e164: '+12317902336', source: 's', capturePage: null, disclosureVersion: 'v', ipAddress: null, userAgent: null, evidence: null,
    })
    expect(out).toBe('REGRANT_BLOCKED')
    expect(mockPrisma.consentRecord.update.mock.calls[0][0].where).toMatchObject({ id: 'c1', revokedAt: null })
    expect(mockPrisma.consentEvent.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.consentEvent.create.mock.calls[0][0].data.eventType).toBe('REGRANT_BLOCKED')
    expect(mockPrisma.consentRecord.create).not.toHaveBeenCalled()
    expect(existing.status).toBe('NOT_GRANTED')
  })
})

describe('(6) normalizeSmsNumber strictness', () => {
  it.each(['+1 231 790 2336 x5', '+1231790233a6', '+1231790(2336)#'])('%s -> INVALID', (raw) => {
    expect(normalizeSmsNumber(raw)).toEqual({ ok: false, reason: 'INVALID' })
  })
  it.each(['+1 (231) 790-2336', '0012317902336'])('%s -> +12317902336', (raw) => {
    expect(normalizeSmsNumber(raw)).toEqual({ ok: true, e164: '+12317902336' })
  })
})
