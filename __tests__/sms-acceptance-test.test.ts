/** Owner SMS acceptance-test trigger: real route + real runner + real sender; fake DB, mocked fetch. */

type Row = Record<string, any> & { id: string }
const mockRows: Row[] = []
const mockAudit: Record<string, any>[] = []
let mockConsentRow: Record<string, any> | null = null
let mockAuditFails = false

const mockPrisma: any = {
  smsMessage: {
    create: jest.fn(async ({ data }: any) => {
      if (mockRows.some((r) => r.idempotencyKey === data.idempotencyKey)) {
        throw Object.assign(new Error('unique'), { code: 'P2002' })
      }
      const r = { id: `m${mockRows.length + 1}`, twilioMessageSid: null, createdAt: new Date(), ...data }
      mockRows.push(r)
      return r
    }),
    findUnique: jest.fn(async ({ where }: any) => mockRows.find((r) => r.idempotencyKey === where.idempotencyKey) ?? null),
    update: jest.fn(async ({ where, data }: any) => Object.assign(mockRows.find((r) => r.id === where.id)!, data)),
    count: jest.fn(async ({ where }: any) =>
      mockRows.filter((r) => r.contextRef === where.contextRef && r.createdAt >= where.createdAt.gte).length),
  },
  activityLog: {
    create: jest.fn((args: any) => {
      if (mockAuditFails) return Promise.reject(Object.assign(new Error('db down'), { code: 'P1001' }))
      mockAudit.push(args.data)
      return Promise.resolve(args.data)
    }),
  },
  consentRecord: { findUnique: jest.fn(async () => mockConsentRow) },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }))
jest.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }) },
}))
const mockSession = jest.fn()
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: (...a: unknown[]) => mockSession(...a) }))

import fs from 'fs'
import path from 'path'
import { GET, POST } from '@/app/api/admin/settings/sms-test/route'
import {
  SMS_ACCEPTANCE_TEST_MESSAGE, ACCEPTANCE_TEST_MAX_PER_WINDOW,
} from '@/lib/sms/acceptance-test'

const SVC = 'MG' + 'c'.repeat(32)
const ACCT = 'ACsecretaccountsid0123456789abcdef'
const TOKEN = 'supersecrettoken_9f8e7d'
const PHONE = '+12317902336'
const FULL_SID = 'SM0123456789abcdef0123456789abcdef'
const fetchMock = jest.fn()
const ENV_KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_SMS_CUSTOMER_CARE_MESSAGING_SERVICE_SID', 'TWILIO_MESSAGING_SERVICE_SID']
const saved: Record<string, string | undefined> = {}

const SUPER = { id: 'staff-1', name: 'Owner', email: 'owner@x.com', role: 'super_admin', staffRole: 'super_admin' }
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const req = (body: unknown) => ({
  json: async () => { if (body === undefined) throw new Error('bad'); return body },
  headers: { get: (h: string) => (h === 'x-forwarded-for' ? '1.2.3.4, 5.6.7.8' : h === 'user-agent' ? 'jest' : null) },
}) as any
const post = (phone: unknown, clientKey: unknown = uuid(1), extra: Record<string, unknown> = {}) =>
  POST(req({ phone, clientKey, ...extra }))
const grantedConsent = (over: Record<string, any> = {}) => ({
  purpose: 'SMS_CUSTOMER_CARE', status: 'GRANTED', revokedAt: null, normalizedNumber: PHONE, ...over,
})
function twilioOk() {
  return { ok: true, status: 201, json: async () => ({ sid: FULL_SID, status: 'queued' }) }
}

beforeEach(() => {
  ENV_KEYS.forEach((k) => { saved[k] = process.env[k] })
  process.env.TWILIO_ACCOUNT_SID = ACCT
  process.env.TWILIO_AUTH_TOKEN = TOKEN
  process.env.TWILIO_SMS_CUSTOMER_CARE_MESSAGING_SERVICE_SID = SVC
  delete process.env.TWILIO_MESSAGING_SERVICE_SID
  jest.clearAllMocks()
  mockRows.length = 0
  mockAudit.length = 0
  mockAuditFails = false
  mockConsentRow = grantedConsent()
  mockSession.mockResolvedValue(SUPER)
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(twilioOk())
  ;(globalThis as any).fetch = fetchMock
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] })
})

const noWrites = () => {
  expect(fetchMock).not.toHaveBeenCalled()
  expect(mockPrisma.smsMessage.create).not.toHaveBeenCalled()
  expect(mockPrisma.activityLog.create).not.toHaveBeenCalled()
}

describe('1. unauthenticated', () => {
  it('401 on POST and GET, nothing sent or written', async () => {
    mockSession.mockResolvedValue(null)
    expect((await post(PHONE)).status).toBe(401)
    expect((await GET()).status).toBe(401)
    noWrites()
  })
  it('session lookup throwing fails closed as 401', async () => {
    mockSession.mockRejectedValue(new Error('boom'))
    expect((await post(PHONE)).status).toBe(401)
    noWrites()
  })
})

describe('2. non-super-admin', () => {
  const cases: [string, Record<string, string>][] = [
    ['sales_rep', { role: 'sales_rep', staffRole: 'sales_rep' }],
    ['operations_manager', { role: 'operations_manager', staffRole: 'operations_manager' }],
    ['general_manager', { role: 'general_manager', staffRole: 'general_manager' }],
    ['legacy admin', { role: 'admin', staffRole: 'admin' }],
    ['role super_admin only', { role: 'super_admin', staffRole: 'sales_rep' }],
    ['staffRole super_admin only', { role: 'admin', staffRole: 'super_admin' }],
  ]
  it.each(cases)('%s -> 403 on POST and GET', async (_n, s) => {
    mockSession.mockResolvedValue({ ...SUPER, ...s })
    expect((await post(PHONE)).status).toBe(403)
    expect((await GET()).status).toBe(403)
    noWrites()
  })
})

describe('3. genuine super_admin happy path', () => {
  it('one Twilio call, exact params, safe response', async () => {
    const res = await post(PHONE)
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/^https:\/\/api\.twilio\.com\/.*\/Messages\.json$/)
    const p = new URLSearchParams(init.body as string)
    expect(p.get('To')).toBe(PHONE)
    expect(p.get('To')).not.toContain('whatsapp:')
    expect(p.get('MessagingServiceSid')).toBe(SVC)
    expect(p.get('Body')).toBe(SMS_ACCEPTANCE_TEST_MESSAGE)
    expect(p.has('From')).toBe(false)

    const json = await res.json()
    expect(json).toMatchObject({
      accepted: true, recipientMasked: '+1••••2336', messageId: 'm1',
      twilioSidMasked: 'SM••••cdef', status: 'queued', duplicate: false,
    })
    const s = JSON.stringify(json)
    for (const secret of [PHONE, '2317902336', TOKEN, ACCT, FULL_SID, SVC]) expect(s).not.toContain(secret)
  })
  it('GET returns readiness with presence only, never values', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.readiness).toMatchObject({ ready: true, twilioAccountSid: 'PRESENT', twilioAuthToken: 'PRESENT', messagingServiceSid: 'PRESENT' })
    const s = JSON.stringify(j)
    for (const secret of [TOKEN, ACCT, SVC]) expect(s).not.toContain(secret)
  })
})

describe('4. consent refusals', () => {
  it.each([
    ['missing', null, /has not given SMS customer-care consent/],
    ['revoked', grantedConsent({ status: 'REVOKED', revokedAt: new Date() }), /opted out/],
    ['wrong purpose', grantedConsent({ purpose: 'MARKETING' }), /not for customer-care SMS/],
  ])('%s -> accepted:false, no fetch', async (_n, row, re) => {
    mockConsentRow = row as any
    const res = await post(PHONE)
    const j = await res.json()
    expect(j.accepted).toBe(false)
    expect(j.message).toMatch(re as RegExp)
    expect(j.messageId).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockPrisma.smsMessage.create).not.toHaveBeenCalled()
  })
})

describe('5. invalid numbers', () => {
  it.each(['abc', '', '08031234567', 'whatsapp:+12317902336'])('%j -> 400', async (n) => {
    const res = await post(n)
    expect(res.status).toBe(400)
    noWrites()
  })
  it('non-string phone -> 400', async () => {
    expect((await post(12317902336 as any)).status).toBe(400)
    noWrites()
  })
  it('unparseable body -> 400', async () => {
    expect((await POST(req(undefined))).status).toBe(400)
    noWrites()
  })
})

describe('6. classification / message cannot be overridden', () => {
  it('extra body fields are ignored', async () => {
    const res = await post(PHONE, uuid(1), {
      classification: 'SMS_MARKETING', message: 'Buy now! 50% off', contextRef: 'x', to: '+19995550000',
      audience: 'all', recipients: ['+19995550001', '+19995550002'], schedule: '2030-01-01', body: 'evil', From: '+1000',
    })
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const p = new URLSearchParams(fetchMock.mock.calls[0][1].body as string)
    expect(p.get('Body')).toBe(SMS_ACCEPTANCE_TEST_MESSAGE)
    expect(p.get('To')).toBe(PHONE)
    expect(p.has('From')).toBe(false)
    expect(mockRows).toHaveLength(1)
    expect(mockRows[0]).toMatchObject({ classification: 'SMS_CUSTOMER_CARE', phone: PHONE, body: SMS_ACCEPTANCE_TEST_MESSAGE })
    expect(mockRows[0].contextRef).toBe('acceptance_test:staff-1')
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Buy now')
  })
  it('route source reads only phone and clientKey from the body', () => {
    const src = strip(read('app/api/admin/settings/sms-test/route.ts'))
    expect(src).toMatch(/const \{ phone, clientKey \} = body as/)
    expect(src).not.toMatch(/\bbody\s*\.\s*\w|\bbody\s*\[/)
    expect(src).not.toMatch(/formData|searchParams|nextUrl/)
  })
})

describe('7. duplicates and cap', () => {
  it('same clientKey twice -> one provider call, second duplicate:true', async () => {
    const a = await (await post(PHONE, uuid(7))).json()
    const b = await (await post(PHONE, uuid(7))).json()
    expect(a.duplicate).toBe(false)
    expect(b).toMatchObject({ accepted: true, duplicate: true, messageId: a.messageId })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it.each([['absent', undefined], ['malformed', 'not-a-uuid'], ['empty', ''], ['number', 5]])('%s clientKey -> 400, no send', async (_n, k) => {
    const res = await POST(req({ phone: PHONE, ...(k === undefined ? {} : { clientKey: k }) }))
    expect(res.status).toBe(400)
    noWrites()
  })
  it('different keys are separate attempts, 6th within window is 429', async () => {
    for (let i = 1; i <= ACCEPTANCE_TEST_MAX_PER_WINDOW; i++) {
      expect((await post(PHONE, uuid(i))).status).toBe(200)
    }
    expect(fetchMock).toHaveBeenCalledTimes(ACCEPTANCE_TEST_MAX_PER_WINDOW)
    const res = await post(PHONE, uuid(99))
    expect(res.status).toBe(429)
    expect(fetchMock).toHaveBeenCalledTimes(ACCEPTANCE_TEST_MAX_PER_WINDOW)
    expect(mockRows).toHaveLength(ACCEPTANCE_TEST_MAX_PER_WINDOW)
  })
  it('cap is per staff member', async () => {
    for (let i = 1; i <= 5; i++) await post(PHONE, uuid(i))
    mockSession.mockResolvedValue({ ...SUPER, id: 'staff-2' })
    expect((await post(PHONE, uuid(50))).status).toBe(200)
  })
})

describe('8. missing config', () => {
  it('no SMS messaging service SID -> CONFIG_MISSING, no fetch', async () => {
    delete process.env.TWILIO_SMS_CUSTOMER_CARE_MESSAGING_SERVICE_SID
    const j = await (await post(PHONE)).json()
    expect(j.accepted).toBe(false)
    expect(j.reason).toBe('CONFIG_MISSING')
    expect(j.message).toMatch(/not fully configured/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('only the WhatsApp TWILIO_MESSAGING_SERVICE_SID does not enable it', async () => {
    delete process.env.TWILIO_SMS_CUSTOMER_CARE_MESSAGING_SERVICE_SID
    process.env.TWILIO_MESSAGING_SERVICE_SID = SVC
    const j = await (await post(PHONE)).json()
    expect(j.reason).toBe('CONFIG_MISSING')
    expect(fetchMock).not.toHaveBeenCalled()
    const g = await (await GET()).json()
    expect(g.readiness.ready).toBe(false)
    expect(g.readiness.messagingServiceSid).toBe('MISSING')
  })
})

describe('9. audit', () => {
  it('sent attempt writes one ActivityLog with masked detail and message id', async () => {
    await post(PHONE)
    expect(mockAudit).toHaveLength(1)
    expect(mockAudit[0]).toMatchObject({
      action: 'SMS_ACCEPTANCE_TEST', staffId: 'staff-1', module: 'settings', entityType: 'SmsMessage', entityId: 'm1',
    })
    expect(mockAudit[0].detail).toContain('+1••••2336')
    const s = JSON.stringify(mockAudit)
    for (const secret of [PHONE, '2317902336', TOKEN, ACCT, FULL_SID, SVC]) expect(s).not.toContain(secret)
  })
  it('refused attempt is audited too (no entityId), still masked', async () => {
    mockConsentRow = null
    await post(PHONE)
    expect(mockAudit).toHaveLength(1)
    expect(mockAudit[0]).toMatchObject({ action: 'SMS_ACCEPTANCE_TEST', entityId: null })
    expect(mockAudit[0].detail).toContain('+1••••2336')
    expect(JSON.stringify(mockAudit)).not.toContain('2317902336')
  })
  it('a failing audit write does not turn a sent message into an error', async () => {
    mockAuditFails = true
    const res = await post(PHONE)
    expect(res.status).toBe(200)
    expect((await res.json()).accepted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('provider failure: accepted:false with record id, no secrets', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ code: 21211, message: `bad ${TOKEN}` }) })
    const res = await post(PHONE)
    const j = await res.json()
    expect(j).toMatchObject({ accepted: false, reason: 'PROVIDER_ERROR', messageId: 'm1' })
    expect(JSON.stringify(j)).not.toContain(TOKEN)
    expect(JSON.stringify(mockAudit)).not.toContain(TOKEN)
    expect(mockRows[0].status).toBe('failed')
  })
})

function read(p: string) { return fs.readFileSync(path.join(process.cwd(), p), 'utf8') }
function strip(s: string) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

describe('10. no bulk/audience capability (source level)', () => {
  const files = [
    'app/api/admin/settings/sms-test/route.ts',
    'lib/sms/acceptance-test.ts',
    'app/admin/settings/sms-test/page.tsx',
  ]
  const words = ['csv', 'upload', 'bulk', 'audience', 'schedule', 'recipients', 'marketing', 'broadcast']
  it.each(files)('%s has no forbidden words or WhatsApp imports', (f) => {
    const src = strip(read(f)).toLowerCase()
    for (const w of words) expect(src).not.toContain(w)
    expect(src).not.toMatch(/lib\/whatsapp/)
    expect(src).not.toMatch(/twilio-whatsapp/)
  })
  const page = strip(read('app/admin/settings/sms-test/page.tsx'))
  it('page: no textarea/message input, exactly one input, no auto-send', () => {
    expect(page).not.toMatch(/<textarea/i)
    expect((page.match(/<input\b/g) ?? []).length).toBe(1)
    const eff = page.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[\]\)/)![1]
    expect(eff).not.toMatch(/POST/)
    expect(eff).not.toMatch(/method/)
    expect(page).toMatch(/JSON\.stringify\(\{ phone: pending\.e164, clientKey: pending\.key \}\)/)
  })
})

describe('12. settings tile', () => {
  it('links to /admin/settings/sms-test', () => {
    expect(strip(read('app/admin/settings/page.tsx'))).toContain("href: '/admin/settings/sms-test'")
  })
})
