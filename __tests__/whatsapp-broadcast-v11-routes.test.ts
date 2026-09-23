/**
 * WhatsApp Broadcast V1.1 — the new admin API surface.
 *
 * RBAC on every new route (reusing V1's `marketing_whatsapp_broadcast`
 * permission — no new permission is invented), the SELECTION-not-gated-by-
 * consent contract of the two pickers, the manual validator writing
 * nothing, the multi-source snapshot with provenance, and snapshot
 * immutability across all three sources.
 */

const mockSession = jest.fn()
jest.mock('@/lib/admin-auth', () => ({ __esModule: true, getAdminSession: () => mockSession() }))
jest.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }))

interface Bcast {
  id: string
  name: string
  message: string
  status: string
  targetFilter: Record<string, string>
  audienceSelection: Record<string, unknown>
  contentSid: string | null
  contentVariables: unknown
  templateCategory: string | null
  scheduledAt: Date | null
  recipientCount: number
  skippedCount: number
  failedCount: number
  queuedAt: Date | null
  snapshotAt: Date | null
  approvedBy: string | null
  audienceSnapshot: unknown
}

let broadcasts: Bcast[] = []
let leads: Array<Record<string, unknown>> = []
let visaApps: Array<Record<string, unknown>> = []
let consents: Array<{ normalizedNumber: string; status: string }> = []
let createdRecipients: Array<Record<string, unknown>> = []

const leadCount = jest.fn()
const visaCount = jest.fn()
const consentFindMany = jest.fn()
const consentCreate = jest.fn()
const leadCreate = jest.fn()

function matchWhere(rows: Array<Record<string, unknown>>, where: Record<string, unknown>) {
  return rows.filter(r =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'OR') return true
      if (v && typeof v === 'object' && 'in' in (v as object)) {
        return ((v as { in: unknown[] }).in ?? []).includes(r[k])
      }
      return r[k] === v
    }),
  )
}

const mockPrisma = {
  whatsAppBroadcast: {
    findUnique: jest.fn(async (a: { where: { id: string } }) => {
      const b = broadcasts.find(x => x.id === a.where.id)
      return b ? { ...b } : null
    }),
    create: jest.fn(async (a: { data: Record<string, unknown> }) => {
      const b = { id: `b${broadcasts.length + 1}`, ...a.data } as unknown as Bcast
      broadcasts.push(b)
      return { ...b }
    }),
    update: jest.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => {
      const b = broadcasts.find(x => x.id === a.where.id)
      if (b) Object.assign(b, a.data)
      return b ? { ...b } : null
    }),
    updateMany: jest.fn(async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const allowed = (a.where.status as { in?: string[] })?.in
      const b = broadcasts.find(x => x.id === a.where.id)
      if (!b) return { count: 0 }
      if (allowed && !allowed.includes(b.status)) return { count: 0 }
      if (typeof a.where.status === 'string' && b.status !== a.where.status) return { count: 0 }
      Object.assign(b, a.data)
      return { count: 1 }
    }),
  },
  whatsAppBroadcastRecipient: {
    createMany: jest.fn(async (a: { data: Array<Record<string, unknown>> }) => {
      createdRecipients.push(...a.data)
      return { count: a.data.length }
    }),
    groupBy: jest.fn(async () => []),
    findMany: jest.fn(async () => []),
  },
  lead: {
    findMany: jest.fn(async (a: { where: Record<string, unknown>; take?: number }) =>
      matchWhere(leads, a.where ?? {}).slice(0, a.take ?? undefined).map(r => ({ ...r })),
    ),
    count: jest.fn(async (a: { where: Record<string, unknown> }) => {
      leadCount(a)
      return matchWhere(leads, a.where ?? {}).length
    }),
    create: leadCreate,
  },
  visaApplication: {
    findMany: jest.fn(async (a: { where: Record<string, unknown>; take?: number }) =>
      matchWhere(visaApps, a.where ?? {}).slice(0, a.take ?? undefined).map(r => ({ ...r })),
    ),
    count: jest.fn(async (a: { where: Record<string, unknown> }) => {
      visaCount(a)
      return matchWhere(visaApps, a.where ?? {}).length
    }),
  },
  whatsAppConsent: {
    findMany: jest.fn(async (a: { where: { normalizedNumber: { in: string[] } } }) => {
      consentFindMany(a)
      return consents.filter(c => a.where.normalizedNumber.in.includes(c.normalizedNumber)).map(c => ({ ...c }))
    }),
    create: consentCreate,
    upsert: jest.fn(),
  },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }))

jest.mock('@/lib/whatsapp/config', () => ({
  __esModule: true,
  getWhatsAppReadiness: () => ({ canSend: true, canReceiveStatusCallbacks: true, checks: {}, missing: [] }),
}))

import { NextRequest } from 'next/server'
import { GET as leadsSearch } from '@/app/api/admin/marketing/whatsapp-broadcast/recipients/leads/route'
import { GET as visaSearch } from '@/app/api/admin/marketing/whatsapp-broadcast/recipients/visa-applications/route'
import { POST as manualCheck } from '@/app/api/admin/marketing/whatsapp-broadcast/recipients/manual/route'
import { POST as previewRoute } from '@/app/api/admin/marketing/whatsapp-broadcast/preview/route'
import { POST as createBroadcast } from '@/app/api/admin/marketing/whatsapp-broadcast/route'
import { POST as scheduleRoute } from '@/app/api/admin/marketing/whatsapp-broadcast/[id]/schedule/route'

const SUPER = { email: 'boss@walz.com', role: 'super_admin', permissions: {} }
const NO_PERM = { email: 'nobody@walz.com', role: 'agent', permissions: {} }

const req = (url: string) => new NextRequest(new URL(url, 'https://walz.test'))
const post = (url: string, body: unknown) =>
  new NextRequest(new URL(url, 'https://walz.test'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  jest.clearAllMocks()
  broadcasts = []
  leads = []
  visaApps = []
  consents = []
  createdRecipients = []
  mockSession.mockResolvedValue(SUPER)
})

// ── RBAC ────────────────────────────────────────────────────────────────

describe('RBAC on every V1.1 route', () => {
  const routes: Array<[string, () => Promise<Response>]> = [
    ['recipients/leads', () => leadsSearch(req('/api/admin/marketing/whatsapp-broadcast/recipients/leads')) as Promise<Response>],
    ['recipients/visa-applications', () => visaSearch(req('/api/admin/marketing/whatsapp-broadcast/recipients/visa-applications')) as Promise<Response>],
    ['recipients/manual', () => manualCheck(post('/api/admin/marketing/whatsapp-broadcast/recipients/manual', { blob: '' })) as Promise<Response>],
  ]

  it.each(routes)('%s returns 401 with no session', async (_n, call) => {
    mockSession.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
  })

  it.each(routes)('%s returns 403 without the broadcast permission', async (_n, call) => {
    mockSession.mockResolvedValue(NO_PERM)
    expect((await call()).status).toBe(403)
  })

  it.each(routes)('%s allows a permitted session', async (_n, call) => {
    mockSession.mockResolvedValue(SUPER)
    expect((await call()).status).toBe(200)
  })

  it('reuses V1s permission key and invents none', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BROADCAST_PERMISSION } = require('@/lib/whatsapp/broadcast/rbac')
    expect(BROADCAST_PERMISSION).toBe('marketing_whatsapp_broadcast')
  })
})

// ── SELECTION is not gated by consent ───────────────────────────────────

describe('pickers return SELECTABLE records regardless of consent', () => {
  it('leads search returns opted-out and unconsented leads, labelled', async () => {
    leads = [
      { id: 'l1', name: 'A', email: null, whatsapp: '+2348011111111', service: 'Visa Processing', branch: 'nigeria', destination: null, marketingOptOut: true, createdAt: new Date() },
      { id: 'l2', name: 'B', email: null, whatsapp: '+2348022222222', service: 'Visa Processing', branch: 'nigeria', destination: null, marketingOptOut: false, createdAt: new Date() },
    ]
    const res = await leadsSearch(req('/api/admin/marketing/whatsapp-broadcast/recipients/leads'))
    const d = await res.json()

    expect(d.leads).toHaveLength(2)
    expect(d.leads.find((l: { id: string }) => l.id === 'l1').optedOut).toBe(true)
    expect(d.leads.every((l: { consentStatus: string }) => l.consentStatus === 'UNKNOWN')).toBe(true)
    expect(d.total).toBe(2)
    expect(d.selectionNotice).toMatch(/regardless of consent/i)
  })

  it('visa search returns opted-out applicants too, and exposes the real filter dimensions', async () => {
    visaApps = [
      { id: 'v1', referenceNumber: 'R1', firstName: 'A', lastName: 'B', phone: '+2348011111111', email: null, destinationIso2: 'GB', visaType: 'tourist', status: 'approved', assignedTo: 'glory', branch: 'nigeria', arrivalDate: null, createdAt: new Date(), marketingOptOut: true },
    ]
    const res = await visaSearch(req('/api/admin/marketing/whatsapp-broadcast/recipients/visa-applications?destinationIso2=GB&status=approved'))
    const d = await res.json()

    expect(d.applications).toHaveLength(1)
    expect(d.applications[0].optedOut).toBe(true)
    expect(d.applications[0].referenceNumber).toBe('R1')
    expect(visaCount).toHaveBeenCalledWith({ where: expect.objectContaining({ destinationIso2: 'GB', status: 'approved' }) })
  })

  it('"select all" counts are real SQL counts, not the page length', async () => {
    leads = Array.from({ length: 7 }, (_, i) => ({
      id: `l${i}`, name: `n${i}`, email: null, whatsapp: `+23480111111${String(i).padStart(2, '0')}`,
      service: 'Visa Processing', branch: 'nigeria', destination: null, marketingOptOut: false, createdAt: new Date(),
    }))
    const res = await leadsSearch(req('/api/admin/marketing/whatsapp-broadcast/recipients/leads?limit=2'))
    const d = await res.json()
    expect(d.leads).toHaveLength(2)
    expect(d.total).toBe(7)
  })
})

// ── Manual validator writes nothing ─────────────────────────────────────

describe('manual number validation', () => {
  it('normalizes server-side and creates NO Lead and NO consent row', async () => {
    const res = await manualCheck(post('/api/admin/marketing/whatsapp-broadcast/recipients/manual', {
      blob: '+234 801 111 1111 | Ada\n08022222222\n+2348011111111',
    }))
    const d = await res.json()

    expect(d.valid).toHaveLength(1)
    expect(d.valid[0].normalizedNumber).toBe('+2348011111111')
    expect(d.valid[0].consentStatus).toBe('UNKNOWN')
    expect(d.invalid).toHaveLength(1)
    expect(d.duplicates).toHaveLength(1)

    expect(leadCreate).not.toHaveBeenCalled()
    expect(consentCreate).not.toHaveBeenCalled()
    expect(mockPrisma.whatsAppConsent.upsert).not.toHaveBeenCalled()
  })

  it('does not accept a client-side validity claim', async () => {
    const res = await manualCheck(post('/api/admin/marketing/whatsapp-broadcast/recipients/manual', {
      entries: [{ number: '08011111111', valid: true, consentStatus: 'SUBSCRIBED' }],
    }))
    const d = await res.json()
    expect(d.valid).toHaveLength(0)
    expect(d.invalid).toHaveLength(1)
  })
})

// ── Preview across three sources ────────────────────────────────────────

describe('preview', () => {
  it('runs the multi-source resolver and returns explained exclusions', async () => {
    leads = [{ id: 'l1', name: 'A', whatsapp: '+2348011111111', service: 'Visa Processing', branch: 'nigeria', destination: null, travelDate: null, marketingOptOut: false }]
    visaApps = [{ id: 'v1', referenceNumber: 'R1', firstName: 'B', lastName: 'C', phone: '+2348022222222', destinationIso2: 'GB', visaType: 'tourist', status: 'approved', arrivalDate: null, marketingOptOut: false }]

    const res = await previewRoute(post('/api/admin/marketing/whatsapp-broadcast/preview', {
      audienceSelection: { leadIds: ['l1'], visaApplicationIds: ['v1'], manualEntries: [{ number: '+2348033333333' }] },
    }))
    const d = await res.json()

    expect(d.multiSource).toBe(true)
    expect(d.breakdown.totalSelected).toBe(3)
    expect(d.breakdown.bySource).toEqual(expect.objectContaining({ LEAD: 1, VISA_APPLICATION: 1, MANUAL: 1 }))
    expect(d.breakdown.finalSendCount).toBe(0)
    expect(d.exclusions.map((x: { reason: string }) => x.reason)).toContain('No recorded consent')
    expect(d.consentNotice).toMatch(/opt-OUT flags/)
  })

  it('a filter-only request still uses V1s single-source path', async () => {
    leads = [{ id: 'l1', name: 'A', whatsapp: '+2348011111111', service: 'Visa Processing', branch: 'nigeria', destination: null, travelDate: null, marketingOptOut: false }]
    const res = await previewRoute(post('/api/admin/marketing/whatsapp-broadcast/preview', {
      targetFilter: { service: 'Visa Processing' },
    }))
    const d = await res.json()
    expect(d.multiSource).toBe(false)
    expect(d.breakdown.totalMatched).toBe(1)
    expect(d.exclusions.length).toBeGreaterThan(0)
  })
})

// ── Snapshot across three sources ───────────────────────────────────────

async function makeBroadcast(selection: Record<string, unknown>, category?: string) {
  const res = await createBroadcast(post('/api/admin/marketing/whatsapp-broadcast', {
    name: 'C', message: 'm',
    audienceSelection: selection,
    contentSid: 'HX' + '1'.repeat(32), variables: {},
    ...(category ? { templateCategory: category } : {}),
  }))
  const d = await res.json()
  return d.broadcast as Bcast
}

describe('multi-source snapshot', () => {
  beforeEach(() => {
    leads = [{ id: 'l1', name: 'A', whatsapp: '+2348011111111', service: 'Visa Processing', branch: 'nigeria', destination: null, travelDate: null, marketingOptOut: false }]
    visaApps = [{ id: 'v1', referenceNumber: 'R1', firstName: 'B', lastName: 'C', phone: '+2348022222222', destinationIso2: 'GB', visaType: 'tourist', status: 'approved', arrivalDate: null, marketingOptOut: false }]
    consents = [
      { normalizedNumber: '+2348011111111', status: 'SUBSCRIBED' },
      { normalizedNumber: '+2348022222222', status: 'SUBSCRIBED' },
      { normalizedNumber: '+2348033333333', status: 'SUBSCRIBED' },
    ]
  })

  it('writes one row per source with provenance and the right foreign keys', async () => {
    const b = await makeBroadcast({
      leadIds: ['l1'], visaApplicationIds: ['v1'],
      manualEntries: [{ number: '+2348033333333', displayName: 'Walk-in' }],
    })
    const res = await scheduleRoute(post(`/x/${b.id}/schedule`, { mode: 'send' }), { params: { id: b.id } })
    expect(res.status).toBe(200)

    expect(createdRecipients).toHaveLength(3)
    const byNumber = Object.fromEntries(createdRecipients.map(r => [r.normalizedNumber as string, r]))

    expect(byNumber['+2348011111111'].sourceType).toBe('LEAD')
    expect(byNumber['+2348011111111'].leadId).toBe('l1')
    expect(byNumber['+2348011111111'].visaApplicationId).toBeNull()

    expect(byNumber['+2348022222222'].sourceType).toBe('VISA_APPLICATION')
    expect(byNumber['+2348022222222'].visaApplicationId).toBe('v1')
    expect(byNumber['+2348022222222'].leadId).toBeNull()

    expect(byNumber['+2348033333333'].sourceType).toBe('MANUAL')
    expect(byNumber['+2348033333333'].displayName).toBe('Walk-in')
    expect(byNumber['+2348033333333'].leadId).toBeNull()
    expect(byNumber['+2348033333333'].visaApplicationId).toBeNull()

    for (const r of createdRecipients) {
      expect(Array.isArray(r.sourceProvenance)).toBe(true)
      expect((r.sourceProvenance as unknown[]).length).toBeGreaterThan(0)
    }
  })

  it('collapses a human contributed by all three sources into ONE snapshot row', async () => {
    visaApps[0].phone = '+2348011111111'
    const b = await makeBroadcast({
      leadIds: ['l1'], visaApplicationIds: ['v1'],
      manualEntries: [{ number: '+2348011111111' }],
    })
    await scheduleRoute(post(`/x/${b.id}/schedule`, { mode: 'send' }), { params: { id: b.id } })

    expect(createdRecipients).toHaveLength(1)
    expect(createdRecipients[0].normalizedNumber).toBe('+2348011111111')
    expect((createdRecipients[0].sourceProvenance as Array<{ type: string }>).map(p => p.type))
      .toEqual(['LEAD', 'VISA_APPLICATION', 'MANUAL'])
    expect(createdRecipients[0].leadId).toBe('l1')
    expect(createdRecipients[0].visaApplicationId).toBe('v1')
  })

  it('SNAPSHOT IMMUTABILITY — later source changes cannot alter a queued campaign', async () => {
    const b = await makeBroadcast({
      leadIds: ['l1'], visaApplicationIds: ['v1'],
      manualEntries: [{ number: '+2348033333333' }],
    })
    await scheduleRoute(post(`/x/${b.id}/schedule`, { mode: 'send' }), { params: { id: b.id } })
    const frozen = createdRecipients.map(r => r.normalizedNumber).sort()
    expect(frozen).toHaveLength(3)

    // Everything that could change afterwards, from every source:
    leads.push({ id: 'l2', name: 'New', whatsapp: '+2348099999999', service: 'Visa Processing', branch: 'nigeria', destination: null, travelDate: null, marketingOptOut: false })
    visaApps.push({ id: 'v2', referenceNumber: 'R2', firstName: 'X', lastName: 'Y', phone: '+2348088888888', destinationIso2: 'GB', visaType: 'tourist', status: 'approved', arrivalDate: null, marketingOptOut: false })
    leads[0].marketingOptOut = true
    consents = []

    // A second schedule attempt is refused outright (already past READY).
    const again = await scheduleRoute(post(`/x/${b.id}/schedule`, { mode: 'send' }), { params: { id: b.id } })
    expect(again.status).toBe(409)
    expect(createdRecipients.map(r => r.normalizedNumber).sort()).toEqual(frozen)
  })

  it('resolves the STORED selection, not anything the schedule request supplies', async () => {
    const b = await makeBroadcast({ leadIds: ['l1'] })
    // A tampered schedule body naming extra recipients and a bypass flag.
    await scheduleRoute(
      post(`/x/${b.id}/schedule`, {
        mode: 'send',
        audienceSelection: { manualEntries: [{ number: '+2348033333333' }] },
        recipients: [{ normalizedNumber: '+2348077777777' }],
        ignoreConsent: true,
      }),
      { params: { id: b.id } },
    )
    expect(createdRecipients.map(r => r.normalizedNumber)).toEqual(['+2348011111111'])
  })

  it('records the template category but sends it through no eligibility path', async () => {
    consents = []   // nobody has consent
    const b = await makeBroadcast({ leadIds: ['l1'] }, 'UTILITY')
    expect(broadcasts[0].templateCategory).toBe('UTILITY')

    // A recorded UTILITY category buys exactly nothing: still refused.
    const res = await scheduleRoute(post(`/x/${b.id}/schedule`, { mode: 'send' }), { params: { id: b.id } })
    expect(res.status).toBe(422)
    expect(createdRecipients).toHaveLength(0)
  })

  it('rejects a category outside Metas real taxonomy rather than storing it', async () => {
    await makeBroadcast({ leadIds: ['l1'] }, 'TRANSACTIONAL_TOTALLY_FINE')
    expect(broadcasts[0].templateCategory).toBeNull()
  })
})

// ── Visa contextual single-recipient flow ───────────────────────────────

describe('visa contextual action', () => {
  it('the lookup-by-id route returns exactly the one applicant, pre-population only', async () => {
    visaApps = [
      { id: 'v1', referenceNumber: 'R1', firstName: 'A', lastName: 'B', phone: '+2348011111111', email: null, destinationIso2: 'GB', visaType: 'tourist', status: 'approved', assignedTo: null, branch: 'nigeria', arrivalDate: null, createdAt: new Date(), marketingOptOut: false },
      { id: 'v2', referenceNumber: 'R2', firstName: 'C', lastName: 'D', phone: '+2348022222222', email: null, destinationIso2: 'US', visaType: 'tourist', status: 'approved', assignedTo: null, branch: 'nigeria', arrivalDate: null, createdAt: new Date(), marketingOptOut: false },
    ]
    const res = await visaSearch(req('/api/admin/marketing/whatsapp-broadcast/recipients/visa-applications?id=v1'))
    const d = await res.json()
    expect(d.applications).toHaveLength(1)
    expect(d.applications[0].id).toBe('v1')
    // Nothing was created and nothing was queued by looking someone up.
    expect(createdRecipients).toHaveLength(0)
    expect(broadcasts).toHaveLength(0)
  })

  it('a one-applicant campaign snapshots exactly one recipient through the SAME pipeline', async () => {
    visaApps = [{ id: 'v1', referenceNumber: 'R1', firstName: 'A', lastName: 'B', phone: '+2348011111111', destinationIso2: 'GB', visaType: 'tourist', status: 'approved', arrivalDate: null, marketingOptOut: false }]
    consents = [{ normalizedNumber: '+2348011111111', status: 'SUBSCRIBED' }]

    const b = await makeBroadcast({ visaApplicationIds: ['v1'] })
    const res = await scheduleRoute(post(`/x/${b.id}/schedule`, { mode: 'send' }), { params: { id: b.id } })

    expect(res.status).toBe(200)
    expect(createdRecipients).toHaveLength(1)
    expect(createdRecipients[0].sourceType).toBe('VISA_APPLICATION')
    // Same table, same statuses, same cron — no second sender exists.
    expect(createdRecipients[0].status).toBe('QUEUED')
  })
})
