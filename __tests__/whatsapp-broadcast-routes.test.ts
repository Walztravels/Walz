/**
 * WhatsApp Broadcast V1 — the admin API surface.
 *
 * RBAC on every route, the readiness probe's PRESENT/MISSING contract,
 * the schedule endpoint's snapshot + double-submit + confirmation guards,
 * cancellation, and the Jade-cannot-send invariant.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

/**
 * Source text with comments removed. Several of these modules DISCUSS the
 * anti-patterns they avoid (the removed NEXT_PUBLIC_WA_TOKEN, the 1:1 send
 * route they deliberately do not wrap), so a pin asserting "this is not
 * done" must look at executable code only.
 */
const readCode = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !/^\s*\/\//.test(l))
    .join('\n')

// ── Mocks ───────────────────────────────────────────────────────────────

const mockSession = jest.fn()
jest.mock('@/lib/admin-auth', () => ({
  __esModule: true,
  getAdminSession: () => mockSession(),
}))

jest.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }))

interface Bcast {
  id: string
  name: string
  message: string
  status: string
  targetFilter: Record<string, string>
  contentSid: string | null
  contentVariables: unknown
  scheduledAt: Date | null
  recipientCount: number
  skippedCount: number
  failedCount: number
  queuedAt: Date | null
  snapshotAt: Date | null
  approvedBy: string | null
  audienceSnapshot: unknown
  cancelledAt: Date | null
  cancelledBy: string | null
}

let broadcasts: Bcast[] = []
let leads: Array<Record<string, unknown>> = []
let consents: Array<{ normalizedNumber: string; status: string }> = []
let createdRecipients: Array<Record<string, unknown>> = []
let recipientRows: Array<Record<string, unknown>> = []

const mockPrisma = {
  whatsAppBroadcast: {
    findMany: jest.fn(async () => broadcasts.map(b => ({ ...b }))),
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
      const w = a.where as { id: string; status?: unknown }
      const rows = broadcasts.filter(b => {
        if (b.id !== w.id) return false
        if (w.status && typeof w.status === 'object' && 'in' in (w.status as object)) {
          return ((w.status as { in: string[] }).in).includes(b.status)
        }
        if (typeof w.status === 'string') return b.status === w.status
        return true
      })
      for (const r of rows) Object.assign(r, a.data)
      return { count: rows.length }
    }),
  },
  whatsAppBroadcastRecipient: {
    createMany: jest.fn(async (a: { data: Array<Record<string, unknown>> }) => {
      createdRecipients.push(...a.data)
      return { count: a.data.length }
    }),
    updateMany: jest.fn(async () => ({ count: 0 })),
    groupBy: jest.fn(async () => {
      const seen = new Map<string, number>()
      for (const r of recipientRows) seen.set(String(r.status), (seen.get(String(r.status)) ?? 0) + 1)
      return Array.from(seen.entries()).map(([status, n]) => ({ status, failureCode: null, _count: { _all: n } }))
    }),
    findMany: jest.fn(async () => []),
  },
  lead: { findMany: jest.fn(async () => leads.map(l => ({ ...l }))) },
  whatsAppConsent: {
    findMany: jest.fn(async (a: { where: { normalizedNumber: { in: string[] } } }) =>
      consents.filter(c => a.where.normalizedNumber.in.includes(c.normalizedNumber)),
    ),
  },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }))

import { GET as readinessGET } from '@/app/api/admin/marketing/whatsapp-broadcast/readiness/route'
import { GET as listGET, POST as createPOST, PATCH as editPATCH } from '@/app/api/admin/marketing/whatsapp-broadcast/route'
import { POST as previewPOST } from '@/app/api/admin/marketing/whatsapp-broadcast/preview/route'
import { POST as schedulePOST } from '@/app/api/admin/marketing/whatsapp-broadcast/[id]/schedule/route'
import { POST as cancelPOST } from '@/app/api/admin/marketing/whatsapp-broadcast/[id]/cancel/route'

const SUPER = { email: 'boss@walztravels.com', role: 'super_admin', permissions: {} }
const ALLOWED = { email: 'mkt@walztravels.com', role: 'senior_manager', permissions: { marketing_whatsapp_broadcast: true } }
const WRONG_ROLE = { email: 'sales@walztravels.com', role: 'sales_rep', permissions: { manage_marketing: true } }

const req = (body?: unknown) =>
  ({ json: async () => (body === undefined ? (() => { throw new Error('no body') })() : body) }) as never

function lead(over: Record<string, unknown> = {}) {
  return {
    id: 'l1', name: 'Ada', whatsapp: '+2348011111111', service: 'Visa Processing',
    branch: 'nigeria', destination: 'London', travelDate: 'July', marketingOptOut: false, ...over,
  }
}

// A syntactically-valid-looking approved Content SID (HX + 32 hex chars) —
// matches lib/whatsapp/broadcast/template.ts's CONTENT_SID_RE.
const TEST_CONTENT_SID = 'HX' + '2'.repeat(32)

function bcast(over: Partial<Bcast> = {}): Bcast {
  return {
    id: 'b1', name: 'Campaign', message: 'internal', status: 'DRAFT', targetFilter: {},
    contentSid: TEST_CONTENT_SID, contentVariables: {},
    scheduledAt: null, recipientCount: 0, skippedCount: 0, failedCount: 0,
    queuedAt: null, snapshotAt: null, approvedBy: null, audienceSnapshot: null,
    cancelledAt: null, cancelledBy: null, ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  broadcasts = []; leads = []; consents = []; createdRecipients = []; recipientRows = []
  mockSession.mockResolvedValue(SUPER)
  // WhatsApp Broadcast V1.2.1: readiness/send-gating now checks Twilio's
  // credentials, not Meta's — see lib/whatsapp/config.ts.
  process.env.TWILIO_ACCOUNT_SID = 'AC-test'
  process.env.TWILIO_AUTH_TOKEN = 'tok'
  process.env.TWILIO_WHATSAPP_PRIMARY_FROM = '+12317902336'
  process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID = 'HX' + '4'.repeat(32)
})

// ── RBAC ────────────────────────────────────────────────────────────────

describe('RBAC — the pre-existing marketing_whatsapp_broadcast permission', () => {
  const calls: Array<[string, () => Promise<Response>]> = [
    ['readiness',  () => readinessGET() as unknown as Promise<Response>],
    ['list',       () => listGET() as unknown as Promise<Response>],
    ['create',     () => createPOST(req({ name: 'n', message: 'm' })) as unknown as Promise<Response>],
    ['edit',       () => editPATCH(req({ id: 'b1', name: 'x' })) as unknown as Promise<Response>],
    ['preview',    () => previewPOST(req({ targetFilter: {} })) as unknown as Promise<Response>],
    ['schedule',   () => schedulePOST(req({ mode: 'send' }), { params: { id: 'b1' } }) as unknown as Promise<Response>],
    ['cancel',     () => cancelPOST(req(), { params: { id: 'b1' } }) as unknown as Promise<Response>],
  ]

  it.each(calls)('%s rejects an unauthenticated caller with 401', async (_n, call) => {
    mockSession.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
  })

  it.each(calls)('%s rejects a wrong-role caller with 403', async (_n, call) => {
    mockSession.mockResolvedValue(WRONG_ROLE)
    expect((await call()).status).toBe(403)
  })

  it('a staff member holding the permission is admitted', async () => {
    mockSession.mockResolvedValue(ALLOWED)
    expect((await (readinessGET() as unknown as Promise<Response>)).status).toBe(200)
  })

  it('super_admin bypasses, exactly as can() does elsewhere', async () => {
    mockSession.mockResolvedValue(SUPER)
    expect((await (readinessGET() as unknown as Promise<Response>)).status).toBe(200)
  })

  it('every broadcast route goes through the same single gate', () => {
    for (const f of [
      'app/api/admin/marketing/whatsapp-broadcast/route.ts',
      'app/api/admin/marketing/whatsapp-broadcast/readiness/route.ts',
      'app/api/admin/marketing/whatsapp-broadcast/preview/route.ts',
      'app/api/admin/marketing/whatsapp-broadcast/[id]/route.ts',
      'app/api/admin/marketing/whatsapp-broadcast/[id]/schedule/route.ts',
      'app/api/admin/marketing/whatsapp-broadcast/[id]/cancel/route.ts',
    ]) {
      expect(read(f)).toContain('requireBroadcastAccess')
    }
    // And that gate reuses the existing helper, inventing no new scheme.
    const rbac = read('lib/whatsapp/broadcast/rbac.ts')
    expect(rbac).toContain("from '@/lib/permissions-registry'")
    expect(rbac).toContain("can(session, BROADCAST_PERMISSION)")
    expect(rbac).toContain("'marketing_whatsapp_broadcast'")
    // The permission predates this feature.
    expect(read('lib/permissions-registry.ts')).toContain('marketing_whatsapp_broadcast')
  })
})

// ── Readiness ───────────────────────────────────────────────────────────

describe('the readiness endpoint', () => {
  it('reports PRESENT/MISSING without leaking any value', async () => {
    process.env.TWILIO_AUTH_TOKEN = 'super-secret-token-value'
    const res = (await (readinessGET() as unknown as Promise<Response>))
    const body = await res.json()

    expect(body.canSend).toBe(true)
    expect(body.canReceiveStatusCallbacks).toBe(true)
    expect(body.canSendOtp).toBe(true)
    expect(body.checks).toEqual({
      twilioAccountSid: 'PRESENT', twilioAuthToken: 'PRESENT',
      primarySender: 'PRESENT', otpContentSid: 'PRESENT',
    })
    expect(body.missing).toEqual([])
    expect(JSON.stringify(body)).not.toContain('super-secret-token-value')
    expect(JSON.stringify(body)).not.toContain('AC-test')
    expect(JSON.stringify(body)).not.toContain('+12317902336')
    expect(JSON.stringify(body)).not.toContain(process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID)
  })

  it('names the MISSING variables only, never a value', async () => {
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
    const body = await (await (readinessGET() as unknown as Promise<Response>)).json()

    expect(body.canSend).toBe(false)
    expect(body.canReceiveStatusCallbacks).toBe(false)
    expect(body.canSendOtp).toBe(false)
    expect(body.checks.twilioAuthToken).toBe('MISSING')
    // Only the two credential vars are missing here — PRIMARY_FROM/
    // OTP_CONTENT_SID are still configured by beforeEach in this test.
    expect(body.missing.sort()).toEqual(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'])
  })

  it('a missing primary sender alone makes canSend false, distinctly named in `missing`, without touching the OTP-specific check', async () => {
    process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID = 'HX' + '6'.repeat(32)
    delete process.env.TWILIO_WHATSAPP_PRIMARY_FROM
    const body = await (await (readinessGET() as unknown as Promise<Response>)).json()

    expect(body.canSend).toBe(false)
    expect(body.canSendOtp).toBe(false) // OTP needs canSend too — never independently true
    expect(body.checks.primarySender).toBe('MISSING')
    expect(body.checks.otpContentSid).toBe('PRESENT')
    expect(body.missing).toEqual(['TWILIO_WHATSAPP_PRIMARY_FROM'])
  })

  it('a missing OTP Content SID makes ONLY canSendOtp false — Broadcast (canSend) is unaffected', async () => {
    delete process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID
    const body = await (await (readinessGET() as unknown as Promise<Response>)).json()

    expect(body.canSend).toBe(true)
    expect(body.canSendOtp).toBe(false)
    expect(body.checks.otpContentSid).toBe('MISSING')
    expect(body.missing).toEqual(['TWILIO_WHATSAPP_OTP_CONTENT_SID'])
  })

  // WhatsApp Broadcast V1.2.1: the old Meta-specific
  // WHATSAPP_APP_SECRET/META_APP_SECRET fallback this test covered lived
  // in the now-removed getMetaAppSecret() — Twilio signs with the SAME
  // Auth Token used to send, so there is no second credential or fallback
  // left to test here. See lib/whatsapp/config.ts's canReceiveStatusCallbacks
  // doc comment. Coverage of the app/api/webhooks/whatsapp/route.ts legacy
  // Meta webhook's OWN (untouched, unrelated) app-secret fallback is not
  // this file's concern.

  it('never claims template approval was verified structurally — that can only be confirmed against a live account', async () => {
    const body = await (await (readinessGET() as unknown as Promise<Response>)).json()
    expect(body.templateApprovalVerified).toBe(false)
  })

  it('no NEXT_PUBLIC_* variable is read anywhere in the feature', () => {
    for (const f of [
      'app/admin/marketing/whatsapp/page.tsx',
      'lib/whatsapp/config.ts',
      'lib/whatsapp/broadcast/sender.ts',
      'app/api/admin/marketing/whatsapp-broadcast/readiness/route.ts',
    ]) {
      expect(readCode(f)).not.toMatch(/process\.env\.NEXT_PUBLIC_/)
    }
    // And the old fake banner variable is gone from executable code.
    const page = readCode('app/admin/marketing/whatsapp/page.tsx')
    expect(page).not.toContain('NEXT_PUBLIC_WA_TOKEN')
    expect(page).not.toContain('WHATSAPP_TOKEN')
  })
})

// ── CRUD guards ─────────────────────────────────────────────────────────

describe('campaign CRUD refuses to be a send trigger', () => {
  it('POST always creates a DRAFT and ignores a client recipientCount', async () => {
    const res = (await (createPOST(req({
      name: 'n', message: 'm', status: 'SENDING', recipientCount: 99999,
    })) as unknown as Promise<Response>))
    const { broadcast } = await res.json()
    expect(res.status).toBe(201)
    expect(broadcast.status).toBe('DRAFT')
    expect(broadcast.recipientCount).toBe(0)
  })

  it('POST rejects an invalid template rather than storing it', async () => {
    const res = (await (createPOST(req({
      name: 'n', message: 'm', contentSid: 'not-a-valid-sid',
    })) as unknown as Promise<Response>))
    expect(res.status).toBe(422)
    expect((await res.json()).details.length).toBeGreaterThan(0)
  })

  it('PATCH can no longer set an arbitrary status string', async () => {
    broadcasts = [bcast()]
    await (editPATCH(req({ id: 'b1', status: 'COMPLETED', name: 'renamed' })) as unknown as Promise<Response>)
    expect(broadcasts[0].status).toBe('DRAFT')
    expect(broadcasts[0].name).toBe('renamed')
    expect(read('app/api/admin/marketing/whatsapp-broadcast/route.ts'))
      .toContain('there is intentionally no `status` branch')
  })

  it('PATCH refuses to edit a campaign whose audience is already snapshotted', async () => {
    broadcasts = [bcast({ status: 'QUEUED' })]
    const res = (await (editPATCH(req({ id: 'b1', name: 'sneaky' })) as unknown as Promise<Response>))
    expect(res.status).toBe(409)
    expect(broadcasts[0].name).toBe('Campaign')
  })
})

// ── Schedule: snapshot, template blocking, double-submit ────────────────

describe('schedule — the snapshot and its guards', () => {
  beforeEach(() => {
    broadcasts = [bcast()]
    leads = [lead({ id: 'l1', whatsapp: '+2348011111111' }), lead({ id: 'l2', whatsapp: '+2348022222222' })]
    consents = [{ normalizedNumber: '+2348011111111', status: 'SUBSCRIBED' }]
  })

  it('writes ONE recipient row per matched lead and queues the broadcast', async () => {
    const res = (await (schedulePOST(req({ mode: 'send' }), { params: { id: 'b1' } }) as unknown as Promise<Response>))
    expect(res.status).toBe(200)

    expect(createdRecipients).toHaveLength(2)
    expect(createdRecipients.filter(r => r.status === 'QUEUED')).toHaveLength(1)
    expect(createdRecipients.filter(r => r.status === 'SKIPPED_NO_CONSENT')).toHaveLength(1)
    expect(broadcasts[0].status).toBe('QUEUED')
    expect(broadcasts[0].snapshotAt).toBeInstanceOf(Date)
    expect(broadcasts[0].approvedBy).toBe('boss@walztravels.com')
    // createMany is called with skipDuplicates so the DB unique index
    // degrades to a no-op rather than a 500.
    expect(mockPrisma.whatsAppBroadcastRecipient.createMany.mock.calls[0][0].skipDuplicates).toBe(true)
  })

  it('freezes the audience breakdown onto the broadcast', async () => {
    await (schedulePOST(req({ mode: 'send' }), { params: { id: 'b1' } }) as unknown as Promise<Response>)
    const snap = broadcasts[0].audienceSnapshot as { totalMatched: number; eligible: number; missingConsent: number }
    expect(snap.totalMatched).toBe(2)
    expect(snap.eligible).toBe(1)
    expect(snap.missingConsent).toBe(1)
  })

  it('the processor never RE-RESOLVES the audience — the snapshot cannot expand', () => {
    const p = read('lib/whatsapp/broadcast/processor.ts')
    // WhatsApp Broadcast V1.2 added a pre-dispatch consent RECHECK
    // (lib/whatsapp/broadcast/processor.ts's dispatchClaimed): immediately
    // before the Meta call, it re-reads WhatsAppConsent/Lead/VisaApplication
    // by the ALREADY-FROZEN ids on the recipient row, so someone who opted
    // out after scheduling is excluded rather than sent to. That is a
    // narrow eligibility RECHECK of one known row — not audience expansion.
    // The guarantee this test actually protects is that the processor never
    // finds NEW recipients or re-derives template params from live data,
    // which is why it must never call the plural, audience-resolving
    // `findMany` on Lead, and must never call `resolveAudience`/
    // `resolveMultiSourceAudience` at all.
    expect(p).not.toMatch(/prisma\.lead\.findMany/)
    expect(p).not.toMatch(/prisma\.visaApplication\.findMany/)
    expect(p).not.toContain('resolveAudience')
    expect(p).not.toContain('resolveMultiSourceAudience')
    // The recheck reads a SINGLE already-known row by id — never a query
    // that could return a different or additional set of recipients.
    expect(p).toMatch(/prisma\.lead\.findUnique\(\{\s*where: \{ id: row\.leadId \}/)
    expect(p).toMatch(/prisma\.whatsAppConsent\.findUnique\(\{\s*where: \{ normalizedNumber: row\.normalizedNumber \}/)
    // Its scan is keyed on existing rows only.
    expect(p).toContain('broadcastId: broadcast.id,')
    expect(p).toContain("status: 'QUEUED',")
  })

  it('a SECOND schedule attempt is rejected — the double-submit guard', async () => {
    const first = (await (schedulePOST(req({ mode: 'send' }), { params: { id: 'b1' } }) as unknown as Promise<Response>))
    expect(first.status).toBe(200)
    createdRecipients = []

    const second = (await (schedulePOST(req({ mode: 'send' }), { params: { id: 'b1' } }) as unknown as Promise<Response>))
    expect(second.status).toBe(409)
    expect(createdRecipients).toHaveLength(0)
  })

  it('a MISSING template blocks scheduling with a clear, non-degrading error', async () => {
    broadcasts = [bcast({ contentSid: null })]
    const res = (await (schedulePOST(req({ mode: 'send' }), { params: { id: 'b1' } }) as unknown as Promise<Response>))
    const body = await res.json()
    expect(res.status).toBe(422)
    expect(body.note).toContain('no free-text fallback')
    expect(createdRecipients).toHaveLength(0)
    expect(broadcasts[0].status).toBe('DRAFT')
  })

  it('a MALFORMED template blocks scheduling', async () => {
    broadcasts = [bcast({ contentSid: 'not-a-valid-sid' })]
    const res = (await (schedulePOST(req({ mode: 'send' }), { params: { id: 'b1' } }) as unknown as Promise<Response>))
    expect(res.status).toBe(422)
    expect(createdRecipients).toHaveLength(0)
  })

  it('an audience with NOBODY consented cannot be queued', async () => {
    consents = []
    const res = (await (schedulePOST(req({ mode: 'send' }), { params: { id: 'b1' } }) as unknown as Promise<Response>))
    const body = await res.json()
    expect(res.status).toBe(422)
    expect(body.error).toMatch(/consent/i)
    expect(body.breakdown.missingConsent).toBe(2)
    expect(createdRecipients).toHaveLength(0)
    expect(broadcasts[0].status).toBe('DRAFT')
  })

  it('refuses to queue when the server has no send credentials', async () => {
    delete process.env.TWILIO_AUTH_TOKEN
    const res = (await (schedulePOST(req({ mode: 'send' }), { params: { id: 'b1' } }) as unknown as Promise<Response>))
    expect(res.status).toBe(503)
    expect((await res.json()).missing).toContain('TWILIO_AUTH_TOKEN')
  })

  it('a stale confirmed count is refused — the audience is re-checked server-side', async () => {
    const res = (await (schedulePOST(req({ mode: 'send', confirmedCount: 47 }), { params: { id: 'b1' } }) as unknown as Promise<Response>))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.confirmedCount).toBe(47)
    expect(body.currentCount).toBe(1)
    expect(createdRecipients).toHaveLength(0)
  })

  it('a matching confirmed count proceeds', async () => {
    const res = (await (schedulePOST(req({ mode: 'send', confirmedCount: 1 }), { params: { id: 'b1' } }) as unknown as Promise<Response>))
    expect(res.status).toBe(200)
  })

  it('schedule mode requires a FUTURE time', async () => {
    const past = (await (schedulePOST(
      req({ mode: 'schedule', scheduledAt: '2020-01-01T00:00:00.000Z' }), { params: { id: 'b1' } }) as unknown as Promise<Response>))
    expect(past.status).toBe(400)

    const future = new Date(Date.now() + 3600_000).toISOString()
    const ok = (await (schedulePOST(
      req({ mode: 'schedule', scheduledAt: future }), { params: { id: 'b1' } }) as unknown as Promise<Response>))
    expect(ok.status).toBe(200)
    expect(broadcasts[0].status).toBe('SCHEDULED')
    expect(broadcasts[0].queuedAt).toBeNull()
  })

  it('404s an unknown broadcast', async () => {
    const res = (await (schedulePOST(req({ mode: 'send' }), { params: { id: 'nope' } }) as unknown as Promise<Response>))
    expect(res.status).toBe(404)
  })
})

// ── Cancellation ────────────────────────────────────────────────────────

describe('cancellation', () => {
  it('cancels a SCHEDULED broadcast and parks its queued recipients', async () => {
    broadcasts = [bcast({ status: 'SCHEDULED' })]
    const res = (await (cancelPOST(req(), { params: { id: 'b1' } }) as unknown as Promise<Response>))
    expect(res.status).toBe(200)
    expect(broadcasts[0].status).toBe('CANCELLED')
    expect(broadcasts[0].cancelledBy).toBe('boss@walztravels.com')
    expect(mockPrisma.whatsAppBroadcastRecipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { broadcastId: 'b1', status: 'QUEUED' } }),
    )
  })

  it('cancels a QUEUED broadcast', async () => {
    broadcasts = [bcast({ status: 'QUEUED' })]
    expect((await (cancelPOST(req(), { params: { id: 'b1' } }) as unknown as Promise<Response>)).status).toBe(200)
    expect(broadcasts[0].status).toBe('CANCELLED')
  })

  it('REFUSES to cancel once sending has begun', async () => {
    broadcasts = [bcast({ status: 'SENDING' })]
    const res = (await (cancelPOST(req(), { params: { id: 'b1' } }) as unknown as Promise<Response>))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already started sending/)
    expect(broadcasts[0].status).toBe('SENDING')
  })

  it('refuses to cancel a DRAFT or a finished campaign', async () => {
    for (const status of ['DRAFT', 'COMPLETED', 'FAILED', 'CANCELLED']) {
      broadcasts = [bcast({ status })]
      expect((await (cancelPOST(req(), { params: { id: 'b1' } }) as unknown as Promise<Response>)).status).toBe(409)
    }
  })
})

// ── Safety: Jade cannot send ────────────────────────────────────────────

describe('Jade can never trigger a send', () => {
  it('no Jade module references any broadcast module, model or endpoint', () => {
    const roots = ['lib/jade', 'lib/team', 'lib/portal', 'app/api/jade']
    const files: string[] = []
    const walk = (dir: string) => {
      const abs = path.join(process.cwd(), dir)
      if (!fs.existsSync(abs)) return
      for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        const rel = path.join(dir, e.name)
        if (e.isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(e.name)) files.push(rel)
      }
    }
    roots.forEach(walk)
    expect(files.length).toBeGreaterThan(5)   // the sweep really ran

    const forbidden = [
      'whatsapp-broadcast',
      'whatsAppBroadcast',
      'WhatsAppBroadcast',
      'whatsapp/broadcast',
      'marketing/whatsapp',
    ]
    const hits = files.flatMap(f => {
      const s = read(f)
      return forbidden.filter(t => s.includes(t)).map(t => `${f}: ${t}`)
    })
    expect(hits).toEqual([])
  })

  it('this feature adds no Jade-callable tool and no arbitrary-fetch surface', () => {
    for (const f of [
      'lib/whatsapp/broadcast/processor.ts',
      'lib/whatsapp/broadcast/sender.ts',
      'lib/whatsapp/broadcast/audience.ts',
      'app/api/admin/marketing/whatsapp-broadcast/[id]/schedule/route.ts',
    ]) {
      const s = read(f)
      expect(s).not.toContain('input_schema')
      expect(s).not.toContain('tool_choice')
      expect(s).not.toMatch(/JADE_[A-Z_]*TOOL/)
    }
    // The destination URL is hard-coded in the shared Twilio helper —
    // nothing Jade (or any other caller) supplies reaches it.
    expect(read('lib/twilio-whatsapp.ts'))
      .toContain('https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json')
  })

  it('the only send path is a CRON_SECRET-gated route over already-approved rows', () => {
    const cron = read('app/api/cron/whatsapp-broadcast/route.ts')
    expect(cron).toContain('`Bearer ${process.env.CRON_SECRET}`')
    expect(cron).toContain('{ status: 401 }')
    expect(cron).toContain('processWhatsAppBroadcasts')
    // No admin route calls the sender directly.
    for (const f of [
      'app/api/admin/marketing/whatsapp-broadcast/route.ts',
      'app/api/admin/marketing/whatsapp-broadcast/[id]/schedule/route.ts',
      'app/api/admin/marketing/whatsapp-broadcast/preview/route.ts',
    ]) {
      expect(read(f)).not.toContain('sendBroadcastTemplate')
      expect(read(f)).not.toContain('graph.facebook.com')
    }
  })
})

// ── Protected workstreams ───────────────────────────────────────────────

describe('protected workstreams are untouched', () => {
  // WhatsApp Broadcast V1.2.1: a provider audit found Broadcast/OTP had
  // been built against direct Meta Cloud API credentials while the rest of
  // Walz's WhatsApp infrastructure already ran through Twilio, and this
  // release corrected that — so "Twilio is nowhere in the broadcast path"
  // is now the WRONG invariant; the codebase deliberately inverted it. The
  // invariant actually worth protecting going forward is the opposite one:
  // no direct Meta Cloud API call is left anywhere in the broadcast path.
  it('no direct Meta Cloud API call remains anywhere in the broadcast path — Twilio is now the sole provider', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      const abs = path.join(process.cwd(), dir)
      for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        const rel = path.join(dir, e.name)
        if (e.isDirectory()) walk(rel, out)
        else if (/\.tsx?$/.test(e.name)) out.push(rel)
      }
      return out
    }
    const files = [
      ...walk('lib/whatsapp'),
      'app/api/cron/whatsapp-broadcast/route.ts',
      'app/admin/marketing/whatsapp/page.tsx',
    ]
    for (const f of files) {
      // readCode() strips comments — this file's own header and
      // lib/whatsapp/broadcast/sender.ts's header legitimately DISCUSS the
      // replaced graph.facebook.com sender in prose; only executable code
      // must be clean.
      expect(readCode(f)).not.toContain('graph.facebook.com')
    }
  })

  it('the Jade daily-brief WhatsApp cron is a separate caller of the SAME shared Twilio helper, not something this feature wraps or depends on', () => {
    // Both Broadcast and the Jade daily brief now call
    // lib/twilio-whatsapp.ts — that is REUSE of one shared credential/send
    // helper, not a dependency between the two features. Neither imports
    // the other.
    for (const f of ['lib/whatsapp/broadcast/sender.ts', 'lib/whatsapp/broadcast/processor.ts']) {
      expect(read(f)).not.toContain('jade-brief-whatsapp')
      expect(read(f)).not.toContain('lib/jade/brief-email')
    }
    const brief = read('app/api/cron/jade-brief-whatsapp/route.ts')
    expect(brief).not.toContain('whatsapp/broadcast')
    expect(brief).not.toContain('whatsAppBroadcast')
  })

  it('the 1:1 Inbox send route is not imported or wrapped by this feature', () => {
    for (const f of ['lib/whatsapp/broadcast/sender.ts', 'lib/whatsapp/broadcast/processor.ts', 'lib/whatsapp/config.ts']) {
      expect(readCode(f)).not.toContain('admin/messages/send')
      expect(readCode(f)).not.toContain('@/lib/supabase')
    }
  })
})
