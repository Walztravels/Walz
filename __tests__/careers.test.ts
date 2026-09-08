/**
 * Careers management + careers inbound email flow.
 *
 * Covers: admin CRUD auth/validation, active-toggle vs public query,
 * transactional reorder, deterministic public ordering, seed fidelity
 * (all four originals, exact text + order), inbound auth (fail-closed,
 * timing-safe), first-contact thread creation, careers category, dedupe,
 * notification target + STRICT call ordering, DB-failure → no notification,
 * HTML escaping, attachment metadata, and supplier-route independence.
 */

import fs from 'fs'
import path from 'path'

// ── Mocks ─────────────────────────────────────────────────────────────────────

let session: { email: string } | null = { email: 'admin@walztravels.com' }
jest.mock('@/lib/admin-auth', () => ({
  getAdminSession: jest.fn(async () => session),
}))

const callLog: string[] = []
const db = {
  jobOpening: {
    findMany:  jest.fn(),
    create:    jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'job_new', ...data })),
    update:    jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ id: where.id, ...data })),
  },
  emailMessage: {
    findFirst: jest.fn(async () => null),
  },
  emailThread: {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      callLog.push('db:createThread')
      return { id: 'thread_1', ...data }
    }),
  },
  supplier:        { findFirst: jest.fn() },
  supplierMessage: { findFirst: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(async (ops: unknown[]) => { callLog.push('db:transaction'); return ops }),
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: db, prisma: db }))

const sendMock = jest.fn(async () => { callLog.push('resend:send'); return { error: null } })
jest.mock('@/lib/resend', () => ({ getResend: () => ({ emails: { send: sendMock } }) }))

const uploadMock = jest.fn(async () => ({ error: null }))
jest.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: () => ({ data: { publicUrl: 'https://storage/email-attachments/cv.pdf' } }),
      }),
    },
  }),
}))

import { validateOpening, JOB_TYPES } from '@/lib/careers'
import { GET as listOpenings, POST as createOpening } from '@/app/api/admin/careers/route'
import { PATCH as patchOpening } from '@/app/api/admin/careers/[id]/route'
import { POST as reorderOpenings } from '@/app/api/admin/careers/reorder/route'
import { POST as careersInbound } from '@/app/api/admin/careers/inbound/route'
import type { NextRequest } from 'next/server'

const jsonReq = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://x/api', {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  }) as unknown as NextRequest

beforeEach(() => {
  jest.clearAllMocks()
  callLog.length = 0
  session = { email: 'admin@walztravels.com' }
  process.env.RESEND_INBOUND_SECRET = 'inbound-secret-1'
  db.emailMessage.findFirst.mockResolvedValue(null)
  db.emailThread.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    callLog.push('db:createThread')
    return { id: 'thread_1', ...data }
  })
})

// ── CRUD ──────────────────────────────────────────────────────────────────────

describe('careers CRUD', () => {
  it('authorized admin can create an opening (createdBy recorded)', async () => {
    const res = await createOpening(jsonReq({
      title: 'Operations Coordinator', type: 'Part-time', location: 'Lagos', description: 'Coordinate operations.',
    }))
    expect(res.status).toBe(200)
    const call = db.jobOpening.create.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(call.data.createdBy).toBe('admin@walztravels.com')
    expect(call.data.type).toBe('Part-time')
  })

  it('unauthorized users cannot access any CRUD operation', async () => {
    session = null
    expect((await listOpenings()).status).toBe(401)
    expect((await createOpening(jsonReq({}))).status).toBe(401)
    expect((await patchOpening(jsonReq({}), { params: { id: 'x' } })).status).toBe(401)
    expect((await reorderOpenings(jsonReq({ order: [] }))).status).toBe(401)
    expect(db.jobOpening.create).not.toHaveBeenCalled()
  })

  it('invalid type and empty required fields are rejected', () => {
    expect(validateOpening({ title: '', type: 'Full-time', location: 'x', description: 'y' }).ok).toBe(false)
    expect(validateOpening({ title: 'x', type: 'Internship', location: 'x', description: 'y' }).ok).toBe(false)
    expect(validateOpening({ title: 'x', type: 'Full-time', location: '  ', description: 'y' }).ok).toBe(false)
    expect(validateOpening({ title: 'x', type: 'Full-time', location: 'x', description: '' }).ok).toBe(false)
    expect(validateOpening({ title: 'x', type: 'Full-time', location: 'x', description: 'y', sortOrder: -1 }).ok).toBe(false)
    expect(validateOpening({ title: 'x', type: 'Full-time', location: 'x', description: 'y', isActive: 'yes' }).ok).toBe(false)
    expect(JOB_TYPES).toEqual(['Full-time', 'Contract', 'Part-time'])
  })

  it('server rejects invalid create payloads with 400', async () => {
    const res = await createOpening(jsonReq({ title: 'X', type: 'Gig', location: 'L', description: 'D' }))
    expect(res.status).toBe(400)
    expect(db.jobOpening.create).not.toHaveBeenCalled()
  })

  it('toggling inactive keeps the record (PATCH, never DELETE) — admin list still shows it', async () => {
    const res = await patchOpening(jsonReq({ isActive: false }), { params: { id: 'job_1' } })
    expect(res.status).toBe(200)
    const call = db.jobOpening.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(call.data).toEqual({ isActive: false })
    // Admin list query includes inactive records (no isActive filter)
    db.jobOpening.findMany.mockResolvedValue([])
    await listOpenings()
    const listArgs = db.jobOpening.findMany.mock.calls[0][0] as { where?: unknown }
    expect(listArgs.where).toBeUndefined()
  })

  it('reordering runs in a single transaction', async () => {
    const res = await reorderOpenings(jsonReq({ order: [
      { id: 'a', sortOrder: 1 }, { id: 'b', sortOrder: 2 }, { id: 'c', sortOrder: 3 },
    ] }))
    expect(res.status).toBe(200)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    const ops = db.$transaction.mock.calls[0][0] as unknown[]
    expect(ops.length).toBe(3)
  })

  it('reorder rejects malformed entries without touching the database', async () => {
    const res = await reorderOpenings(jsonReq({ order: [{ id: 'a', sortOrder: -2 }] }))
    expect(res.status).toBe(400)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

// ── Public page query + seed fidelity ─────────────────────────────────────────

describe('public careers page', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'app/careers/page.tsx'), 'utf-8')

  it('public query excludes non-published listings with deterministic ordering', () => {
    // Upgraded by Recruitment Hub R1: publicJobWhere() = status 'published'
    // AND not past deadline — strictly stronger than the old isActive filter.
    expect(src).toContain('publicJobWhere()')
    expect(src).toMatch(/orderBy:\s*\[\{ sortOrder: 'asc' \}, \{ createdAt: 'asc' \}\]/)
  })

  it('page revalidates so admin changes appear without a redeploy', () => {
    expect(src).toContain('export const revalidate = 60')
  })

  it('renders a polished empty state instead of a broken section', () => {
    expect(src).toContain('No open positions right now')
  })

  it('Apply CTA targets careers@walztravels.com with the job title in the subject', () => {
    expect(src).toContain('mailto:careers@walztravels.com?subject=')
    expect(src).toContain('Application for ${title}')
    expect(src).toContain('mailto:careers@walztravels.com?subject=Speculative%20Application')
  })

  const ORIGINALS = [
    ['Visa Application Specialist', 'Full-time', 'London, UK (Hybrid)',
      'Prepare visa applications, liaise with embassies and coach clients through the interview process. 2+ years visa processing experience required.'],
    ['Travel Consultant', 'Full-time', 'Remote (UK/Nigeria)',
      'Research and book bespoke itineraries for our clients. Strong knowledge of Sabre GDS or Amadeus and luxury travel experience preferred.'],
    ['Customer Success Agent', 'Full-time', 'Remote',
      'First point of contact for clients via WhatsApp and email. Resolve booking queries, escalate issues and ensure every client has an exceptional experience.'],
    ['Frontend Engineer', 'Contract', 'Remote',
      'Build and maintain walztravels.com — Next.js 14, TypeScript, Tailwind, GSAP. You\\\'ll work directly with the founding team.'],
  ] as const

  it('fallback preserves all four originals verbatim, in order (page never empty pre-migration)', () => {
    let lastIndex = -1
    for (const [title, , , description] of ORIGINALS) {
      const i = src.indexOf(`title: '${title}'`)
      expect(i).toBeGreaterThan(lastIndex)   // original order preserved
      lastIndex = i
      expect(src).toContain(description.replace("\\\\'", "\\'"))
    }
  })

  it('migration seeds the same four with matching order and exact text', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'prisma/migrations/add_job_openings_and_seed_existing_careers.sql'), 'utf-8')
    expect(sql).toContain("'Visa Application Specialist', 'Full-time', 'London, UK (Hybrid)'")
    expect(sql).toContain("'Travel Consultant', 'Full-time', 'Remote (UK/Nigeria)'")
    expect(sql).toContain("'Customer Success Agent', 'Full-time', 'Remote'")
    expect(sql).toContain("'Frontend Engineer', 'Contract', 'Remote'")
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING')   // idempotent
    // Order 1..4 matches the original array order
    expect(sql.indexOf('Visa Application Specialist')).toBeLessThan(sql.indexOf('Travel Consultant'))
    expect(sql.indexOf('Travel Consultant')).toBeLessThan(sql.indexOf('Customer Success Agent'))
    expect(sql.indexOf('Customer Success Agent')).toBeLessThan(sql.indexOf('Frontend Engineer'))
    // Exact wording incl. punctuation (SQL-escaped apostrophe)
    expect(sql).toContain("You''ll work directly with the founding team.")
  })
})

// ── Careers inbound ───────────────────────────────────────────────────────────

const VALID_INBOUND = {
  from: 'Applicant Name <applicant@example.com>',
  to: 'careers@walztravels.com',
  subject: 'Application for Travel Consultant',
  text: 'I would like to apply for the Travel Consultant role.',
  html: '<p>I would like to apply…</p>',
  headers: [{ name: 'Message-ID', value: '<msg-123@mail.example.com>' }],
}
const AUTH = { 'x-resend-inbound-secret': 'inbound-secret-1' }

describe('careers inbound endpoint', () => {
  it('missing or incorrect secret returns 401; absent env fails closed', async () => {
    expect((await careersInbound(jsonReq(VALID_INBOUND))).status).toBe(401)
    expect((await careersInbound(jsonReq(VALID_INBOUND, { 'x-resend-inbound-secret': 'wrong' }))).status).toBe(401)
    delete process.env.RESEND_INBOUND_SECRET
    expect((await careersInbound(jsonReq(VALID_INBOUND, AUTH))).status).toBe(401)
    expect(db.emailThread.create).not.toHaveBeenCalled()
  })

  it('valid payload from a first-contact sender creates one careers thread + inbound message atomically', async () => {
    const res  = await careersInbound(jsonReq(VALID_INBOUND, AUTH))
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.threadId).toBe('thread_1')
    expect(db.emailThread.create).toHaveBeenCalledTimes(1)
    const arg = db.emailThread.create.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.category).toBe('careers')                       // Phase 7 category
    expect(arg.data.subject).toBe('Application for Travel Consultant')
    const msg = (arg.data.messages as { create: Record<string, unknown> }).create
    expect(msg.direction).toBe('inbound')
    expect(msg.from).toBe('applicant@example.com')
    expect(msg.fromName).toBe('Applicant Name')
    expect(msg.resendId).toBe('careers:msg-123@mail.example.com')
    // No supplier machinery involved at all
    expect(db.supplier.findFirst).not.toHaveBeenCalled()
    expect(db.supplierMessage.findFirst).not.toHaveBeenCalled()
    expect(db.supplierMessage.update).not.toHaveBeenCalled()
  })

  it('notification goes to contact@walztravels.com with the deep thread link', async () => {
    await careersInbound(jsonReq(VALID_INBOUND, AUTH))
    expect(sendMock).toHaveBeenCalledTimes(1)
    const mail = sendMock.mock.calls[0][0] as { to: string; subject: string; html: string }
    expect(mail.to).toBe('contact@walztravels.com')
    expect(mail.subject).toBe('New job application: Application for Travel Consultant')
    expect(mail.html).toContain('/admin/email?thread=thread_1&category=careers')
    expect(mail.html).toContain('applicant@example.com')
  })

  it('STRICT ordering: notification is sent only AFTER the Email Hub commit', async () => {
    await careersInbound(jsonReq(VALID_INBOUND, AUTH))
    expect(callLog).toEqual(['db:createThread', 'resend:send'])
  })

  it('a database failure results in a retryable 500 and NO notification call', async () => {
    db.emailThread.create.mockRejectedValueOnce(new Error('db down'))
    const res = await careersInbound(jsonReq(VALID_INBOUND, AUTH))
    expect(res.status).toBe(500)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('duplicate Resend delivery creates no duplicate thread, message or notification', async () => {
    db.emailMessage.findFirst.mockResolvedValueOnce({ id: 'm1', threadId: 'thread_1' } as never)
    const res  = await careersInbound(jsonReq(VALID_INBOUND, AUTH))
    const data = await res.json()
    expect(res.status).toBe(200)          // success so Resend stops retrying
    expect(data.duplicate).toBe(true)
    expect(db.emailThread.create).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('malformed sender is acknowledged safely without storing anything', async () => {
    const res  = await careersInbound(jsonReq({ ...VALID_INBOUND, from: 'not-an-email' }, AUTH))
    const data = await res.json()
    expect(data.ok).toBe(false)
    expect(db.emailThread.create).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('applicant-controlled HTML cannot inject markup into the notification', async () => {
    await careersInbound(jsonReq({
      ...VALID_INBOUND,
      subject: '<script>alert(1)</script>',
      text: '<img src=x onerror=alert(1)> hello',
    }, AUTH))
    const mail = sendMock.mock.calls[0][0] as { html: string }
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).not.toContain('<img src=x')
    expect(mail.html).toContain('&lt;script&gt;')
  })

  it('attachment metadata is stored on the Email Hub message', async () => {
    await careersInbound(jsonReq({
      ...VALID_INBOUND,
      attachments: [{ filename: 'cv.pdf', content_type: 'application/pdf', content: Buffer.from('PDF').toString('base64') }],
    }, AUTH))
    const arg = db.emailThread.create.mock.calls[0][0] as { data: { messages: { create: { attachments: Array<Record<string, unknown>> } } } }
    const atts = arg.data.messages.create.attachments
    expect(atts).toHaveLength(1)
    expect(atts[0].filename).toBe('cv.pdf')
    expect(atts[0].contentType).toBe('application/pdf')
    expect(atts[0].stored).toBe(true)
    expect(atts[0].url).toContain('email-attachments')
    const mail = sendMock.mock.calls[0][0] as { html: string }
    expect(mail.html).toContain('Attachments')
  })

  it('a failed attachment upload keeps the email and records the failure visibly', async () => {
    uploadMock.mockResolvedValueOnce({ error: { message: 'bucket missing' } } as never)
    const res = await careersInbound(jsonReq({
      ...VALID_INBOUND,
      attachments: [{ filename: 'cv.pdf', content_type: 'application/pdf', content: Buffer.from('PDF').toString('base64') }],
    }, AUTH))
    expect(res.status).toBe(200)
    const arg = db.emailThread.create.mock.calls[0][0] as { data: { messages: { create: { attachments: Array<Record<string, unknown>> } } } }
    expect(arg.data.messages.create.attachments[0].stored).toBe(false)
    expect(arg.data.messages.create.attachments[0].error).toBe('storage failed')
  })

  it('supplier inbound route is untouched and keeps its own matching logic', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/suppliers/inbound/route.ts'), 'utf-8')
    expect(src).toContain('supplierMessage.findFirst')
    expect(src).toContain('In-Reply-To')
    expect(src).not.toContain('careers')
    const careersSrc = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/careers/inbound/route.ts'), 'utf-8')
    // No supplier CODE usage (prose in comments explaining the separation is fine)
    expect(careersSrc).not.toMatch(/prisma\.supplier|SupplierMessage|supplierId/)
    expect(careersSrc).toContain('timingSafeEqual')
  })
})
