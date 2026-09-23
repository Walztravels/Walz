/**
 * WhatsApp Broadcast V1.2 — Export Contacts (CSV).
 *
 * Separate file from whatsapp-broadcast-v12.test.ts so its admin-session /
 * RBAC / export-log mock shape for @/lib/db and @/lib/admin-auth never
 * collides with that file's.
 */

interface MockLead {
  id: string; name: string | null; whatsapp: string | null; service: string | null
  branch: string | null; destination: string | null; travelDate: string | null; marketingOptOut: boolean
}

let leadStore: MockLead[] = []
let consentStore: Array<{ normalizedNumber: string; status: string; consentedAt: Date | null; optedOutAt: Date | null }> = []
const exportLogs: Array<{ staffId: string; staffEmail: string; recipientCount: number; summary: unknown; ipAddress: string | null }> = []

const mockPrisma = {
  lead: {
    // Returns the FULL mock row regardless of the caller's `select` — this
    // one function backs both resolveMultiSourceAudience()'s internal
    // lookup (which needs name/whatsapp/marketingOptOut/etc.) and the
    // export route's own narrower service-only lookup; a real Prisma call
    // would honor `select`, but returning extra unused fields is harmless
    // to a caller that only destructures the ones it declared.
    findMany: jest.fn(async (args: { where: { id: { in: string[] } } }) =>
      leadStore.filter(l => args.where.id.in.includes(l.id)).map(l => ({ ...l })),
    ),
  },
  visaApplication: {
    findMany: jest.fn(async () => []),
  },
  whatsAppConsent: {
    findMany: jest.fn(async (args: { where: { normalizedNumber: { in: string[] } } }) =>
      consentStore.filter(c => args.where.normalizedNumber.in.includes(c.normalizedNumber)),
    ),
  },
  whatsAppContactExportLog: {
    create: jest.fn(async (args: { data: typeof exportLogs[number] }) => {
      exportLogs.push(args.data)
      return { id: 'log-1', exportedAt: new Date(), ...args.data }
    }),
  },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }))

let session: { id: string; email: string; role: string; permissions: Record<string, boolean> } | null = null
jest.mock('@/lib/admin-auth', () => ({
  __esModule: true,
  getAdminSession: jest.fn(async () => session),
}))

import { can } from '@/lib/permissions-registry'
import { POST as exportPOST } from '@/app/api/admin/marketing/whatsapp-broadcast/export/route'

function req(body: unknown): Request {
  return new Request('http://localhost/api/admin/marketing/whatsapp-broadcast/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.7' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  leadStore = []
  consentStore = []
  exportLogs.length = 0
  session = null
})

describe('POST /api/admin/marketing/whatsapp-broadcast/export — RBAC', () => {
  it('401s when there is no admin session', async () => {
    const res = await exportPOST(req({ selection: {} }) as never)
    expect(res.status).toBe(401)
  })

  it('403s a staff member who lacks marketing_whatsapp_export, even one who CAN send broadcasts', async () => {
    session = { id: 'staff-1', email: 'staff@walztravels.com', role: 'travel_consultant', permissions: { marketing_whatsapp_broadcast: true, marketing_whatsapp_export: false } }
    const res = await exportPOST(req({ selection: {} }) as never)
    expect(res.status).toBe(403)
  })

  it('is a SEPARATE permission from marketing_whatsapp_broadcast', () => {
    expect(can({ role: 'x', permissions: { marketing_whatsapp_broadcast: true } }, 'marketing_whatsapp_export')).toBe(false)
    expect(can({ role: 'x', permissions: { marketing_whatsapp_export: true } }, 'marketing_whatsapp_export')).toBe(true)
  })

  it('super_admin is always allowed, matching every other broadcast route', async () => {
    session = { id: 'staff-1', email: 'admin@walztravels.com', role: 'super_admin', permissions: {} }
    const res = await exportPOST(req({ selection: {} }) as never)
    expect(res.status).toBe(200)
  })
})

describe('POST /api/admin/marketing/whatsapp-broadcast/export — CSV + audit', () => {
  beforeEach(() => {
    session = { id: 'staff-1', email: 'staff@walztravels.com', role: 'travel_consultant', permissions: { marketing_whatsapp_export: true } }
  })

  it('produces the required columns in the CSV header', async () => {
    const res = await exportPOST(req({ selection: {} }) as never)
    const text = await res.text()
    const header = text.split('\n')[0]
    expect(header).toBe(
      'name,whatsapp_number,source,source_reference,country,service,consent_status,consent_date,opt_out_status,opt_out_date',
    )
  })

  it('exports a selected Lead with real name/number/source/service/consent columns', async () => {
    leadStore = [{ id: 'l1', name: 'Chidi Okafor', whatsapp: '+2348012345678', service: 'Flights', branch: 'nigeria', destination: null, travelDate: null, marketingOptOut: false }]
    consentStore = [{ normalizedNumber: '+2348012345678', status: 'SUBSCRIBED', consentedAt: new Date('2026-01-01T00:00:00Z'), optedOutAt: null }]

    const res = await exportPOST(req({ selection: { leadIds: ['l1'] } }) as never)
    const rows = (await res.text()).split('\n')
    expect(rows[1]).toContain('Chidi Okafor')
    expect(rows[1]).toContain('+2348012345678')
    expect(rows[1]).toContain('NG') // derived country
    expect(rows[1]).toContain('Flights')
    expect(rows[1]).toContain('SUBSCRIBED')
    expect(rows[1]).toContain('NOT_OPTED_OUT')
  })

  it('includes an opted-out contact too — export is a directory, not an eligibility filter', async () => {
    leadStore = [{ id: 'l2', name: 'Blocked Person', whatsapp: '+2348099999999', service: 'Hotels', branch: 'nigeria', destination: null, travelDate: null, marketingOptOut: false }]
    consentStore = [{ normalizedNumber: '+2348099999999', status: 'OPTED_OUT', consentedAt: null, optedOutAt: new Date('2026-02-02T00:00:00Z') }]

    const res = await exportPOST(req({ selection: { leadIds: ['l2'] } }) as never)
    const rows = (await res.text()).split('\n')
    expect(rows).toHaveLength(2) // header + the one opted-out contact, not silently dropped
    expect(rows[1]).toContain('OPTED_OUT')
  })

  it('never includes a VisaApplication field beyond name/reference/country/service', async () => {
    const res = await exportPOST(req({ selection: {} }) as never)
    const columns = (await res.text()).split('\n')[0].split(',')
    for (const forbidden of ['passport', 'destination_iso2', 'visa_type', 'application_status', 'arrival_date', 'assigned_to', 'branch']) {
      expect(columns).not.toContain(forbidden)
    }
    expect(columns).toEqual([
      'name', 'whatsapp_number', 'source', 'source_reference', 'country', 'service',
      'consent_status', 'consent_date', 'opt_out_status', 'opt_out_date',
    ])
  })

  it('audit-logs every export: who, when (implicitly), how many rows, a summary — never the exported rows', async () => {
    leadStore = [{ id: 'l1', name: 'Chidi Okafor', whatsapp: '+2348012345678', service: 'Flights', branch: 'nigeria', destination: null, travelDate: null, marketingOptOut: false }]
    await exportPOST(req({ selection: { leadIds: ['l1'] } }) as never)

    expect(exportLogs).toHaveLength(1)
    expect(exportLogs[0].staffId).toBe('staff-1')
    expect(exportLogs[0].staffEmail).toBe('staff@walztravels.com')
    expect(exportLogs[0].recipientCount).toBe(1)
    expect(JSON.stringify(exportLogs[0].summary)).not.toContain('Chidi')
    expect(JSON.stringify(exportLogs[0].summary)).not.toContain('+2348012345678')
  })

  it('exporting never writes to whatsAppConsent — it is read-only', async () => {
    await exportPOST(req({ selection: {} }) as never)
    expect((mockPrisma.whatsAppConsent as unknown as { upsert?: unknown }).upsert).toBeUndefined()
  })

  it('defuses CSV formula injection in an attacker-influenced name field (OWASP CSV Injection)', async () => {
    leadStore = [{ id: 'l3', name: '=cmd|\'/c calc\'!A1', whatsapp: '+2348055555555', service: null, branch: 'nigeria', destination: null, travelDate: null, marketingOptOut: false }]
    const res = await exportPOST(req({ selection: { leadIds: ['l3'] } }) as never)
    const row = (await res.text()).split('\n')[1]
    expect(row.startsWith('=')).toBe(false)
    expect(row).toContain("'=cmd")
  })
})
