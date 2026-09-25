/** SMS_CUSTOMER_CARE web consent grant — append-only, no anonymous re-grant. In-memory fake DB. */

type Rec = { id: string; normalizedNumber: string; purpose: string; status: string; revokedAt: Date | null; ipAddress: string | null; userAgent: string | null; evidence: string | null; consentedAt: Date | null; source: string }
const db: { records: Rec[]; events: Array<Record<string, unknown>> } = { records: [], events: [] }
const mockPrisma: Record<string, unknown> = {
  consentRecord: {
    findUnique: jest.fn(async ({ where }: { where: { normalizedNumber_purpose: { normalizedNumber: string; purpose: string } } }) =>
      db.records.find((r) => r.normalizedNumber === where.normalizedNumber_purpose.normalizedNumber && r.purpose === where.normalizedNumber_purpose.purpose) ?? null),
    create: jest.fn(async ({ data }: { data: Omit<Rec, 'id'> }) => { const r = { id: `r${db.records.length + 1}`, ...data } as Rec; db.records.push(r); return r }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Rec> }) => Object.assign(db.records.find((r) => r.id === where.id)!, data)),
  },
  consentEvent: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { db.events.push(data); return data }) },
}
mockPrisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(mockPrisma)
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import { POST } from '@/app/api/consent/sms-customer-care/route'
import { isGranted } from '@/lib/consent/purposes'

let n = 0
function post(phone = '+12317902336', ip = `192.0.2.${++n}`, ua = 'ua-1') {
  const h = new Map([['x-forwarded-for', ip], ['user-agent', ua]])
  return POST({ headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null }, json: async () => ({ phone, consent: true, capturePage: '/sms-consent', evidence: 'ev-' + ip }) } as unknown as Parameters<typeof POST>[0])
}

beforeEach(() => { db.records.length = 0; db.events.length = 0 })

describe('applySmsCustomerCareGrant via the consent route', () => {
  it('first tick creates a GRANTED row and a GRANTED event', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ recorded: true, purpose: 'SMS_CUSTOMER_CARE', status: 'GRANTED' })
    expect(db.records).toHaveLength(1)
    expect(db.records[0]).toMatchObject({ status: 'GRANTED', purpose: 'SMS_CUSTOMER_CARE', normalizedNumber: '+12317902336', revokedAt: null })
    expect(db.events).toEqual([expect.objectContaining({ eventType: 'GRANTED', toStatus: 'GRANTED', fromStatus: null })])
  })

  it('second tick on GRANTED leaves original evidence untouched and appends an event', async () => {
    await post('+12317902336', '192.0.2.201', 'ua-first')
    const before = { ...db.records[0] }
    const res = await post('+12317902336', '192.0.2.202', 'ua-second')
    await expect(res.json()).resolves.toEqual({ recorded: true, purpose: 'SMS_CUSTOMER_CARE', status: 'GRANTED' })
    expect(db.records).toHaveLength(1)
    expect(db.records[0]).toEqual(before)
    expect(db.events).toHaveLength(2)
    expect(db.events[1]).toMatchObject({ eventType: 'GRANTED', ipAddress: '192.0.2.202', userAgent: 'ua-second' })
  })

  it('tick on REVOKED -> PREVIOUSLY_OPTED_OUT, row unchanged, REGRANT_BLOCKED event appended', async () => {
    const revokedAt = new Date('2026-01-01T00:00:00Z')
    db.records.push({ id: 'r0', normalizedNumber: '+12317902336', purpose: 'SMS_CUSTOMER_CARE', status: 'REVOKED', revokedAt, ipAddress: 'orig', userAgent: 'orig', evidence: 'orig', consentedAt: new Date('2025-01-01'), source: 'x' })
    const before = { ...db.records[0] }
    const res = await post()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ recorded: false, reason: 'PREVIOUSLY_OPTED_OUT' })
    expect(db.records[0]).toEqual(before)
    expect(db.records[0].revokedAt).toBe(revokedAt)
    expect(db.events).toEqual([expect.objectContaining({ eventType: 'REGRANT_BLOCKED', fromStatus: 'REVOKED', toStatus: 'REVOKED' })])
  })

  it('national-format number keeps the existing INVALID_NUMBER response and writes nothing', async () => {
    const res = await post('08031234567')
    await expect(res.json()).resolves.toEqual({ recorded: false, reason: 'INVALID_NUMBER' })
    expect(db.records).toHaveLength(0)
    expect(db.events).toHaveLength(0)
  })

  it('a write failure still returns 500 WRITE_FAILED', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    ;(mockPrisma.consentRecord as { findUnique: jest.Mock }).findUnique.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'P1001' }))
    const res = await post()
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ recorded: false, reason: 'WRITE_FAILED' })
  })
})

describe('isGranted', () => {
  it('is false when revokedAt is set, even if status says GRANTED', () => {
    expect(isGranted({ status: 'GRANTED', purpose: 'SMS_CUSTOMER_CARE', revokedAt: new Date() }, 'SMS_CUSTOMER_CARE')).toBe(false)
    expect(isGranted({ status: 'GRANTED', purpose: 'SMS_CUSTOMER_CARE', revokedAt: null }, 'SMS_CUSTOMER_CARE')).toBe(true)
    expect(isGranted({ status: 'GRANTED', purpose: 'SMS_CUSTOMER_CARE' }, 'SMS_CUSTOMER_CARE')).toBe(true)
  })
})
