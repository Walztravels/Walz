/**
 * Recruitment Hub — Release 10 (analytics, retention, compliance).
 *
 * Covers: retention window configuration and cutoff math, the report-only
 * retention guarantee (no automatic deletion anywhere), anonymization
 * semantics (PII scrubbed, files removed, anonymous skeletons kept,
 * talent-pool members refused, double-erasure refused, audited), the
 * typed ERASE confirmation on the API, analytics aggregation privacy,
 * and dashboard/nav wiring.
 */

import fs from 'fs'
import path from 'path'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const candidates = new Map<string, Record<string, unknown>>()
const poolEntries = new Set<string>()
const auditRows: Array<{ action: string }> = []
const txOps: string[] = []
const removedPaths: string[] = []

const track = (name: string) => jest.fn(async (args: unknown) => { txOps.push(name); return args })

const db = {
  candidate: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => candidates.get(where.id) ?? null),
    findMany:   jest.fn(async () => []),
    update:     track('candidate.update'),
  },
  talentPoolEntry: {
    findUnique: jest.fn(async ({ where }: { where: { candidateId: string } }) =>
      poolEntries.has(where.candidateId) ? { id: 'p1' } : null),
    findMany: jest.fn(async () => []),
  },
  candidateDocument:  { deleteMany: track('documents.deleteMany') },
  candidateNote:      { deleteMany: track('notes.deleteMany') },
  applicationAnswer:  { deleteMany: track('answers.deleteMany') },
  aiScreeningResult:  { deleteMany: track('screenings.deleteMany') },
  aiInterview:        { deleteMany: track('aiInterviews.deleteMany') },
  jobOffer:           { updateMany: track('offers.updateMany') },
  jobApplication:     { updateMany: track('applications.updateMany') },
  activityLog: {
    create: jest.fn(async ({ data }: { data: { action: string } }) => { auditRows.push(data); return data }),
  },
  $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: db, prisma: db }))

const removeMock = jest.fn(async (paths: string[]) => { removedPaths.push(...paths); return { error: null } })
jest.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ storage: { from: () => ({ remove: removeMock }) } }),
}))

import { retentionMonths, retentionCutoff, anonymizeCandidate, DEFAULT_RETENTION_MONTHS } from '@/lib/recruitment/compliance'

const manager = { id: 's1', email: 'manager@walztravels.com', name: 'Manager' }
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

beforeEach(() => {
  candidates.clear(); poolEntries.clear()
  auditRows.length = 0; txOps.length = 0; removedPaths.length = 0
  delete process.env.RECRUITMENT_RETENTION_MONTHS
  jest.clearAllMocks()
})

// ── Retention window ──────────────────────────────────────────────────────────

describe('retention window', () => {
  it('defaults to 24 months and honours a sane env override', () => {
    expect(retentionMonths()).toBe(DEFAULT_RETENTION_MONTHS)
    process.env.RECRUITMENT_RETENTION_MONTHS = '12'
    expect(retentionMonths()).toBe(12)
    process.env.RECRUITMENT_RETENTION_MONTHS = '0'
    expect(retentionMonths()).toBe(24)
    process.env.RECRUITMENT_RETENTION_MONTHS = 'forever'
    expect(retentionMonths()).toBe(24)
  })
  it('computes the cutoff by subtracting the window', () => {
    const now = new Date('2026-09-08T12:00:00Z')
    expect(retentionCutoff(now).toISOString().slice(0, 7)).toBe('2024-09')
  })
})

// ── Anonymization ─────────────────────────────────────────────────────────────

describe('anonymizeCandidate', () => {
  function seed(over: Record<string, unknown> = {}) {
    const row = {
      id: 'cand_1', email: 'ada@example.com',
      documents: [{ id: 'd1', storagePath: 'cv/1.pdf' }, { id: 'd2', storagePath: 'cv/2.pdf' }],
      applications: [{ id: 'app_1' }, { id: 'app_2' }],
      ...over,
    }
    candidates.set(row.id as string, row)
    return row
  }

  it('deletes files, scrubs PII atomically, and audits', async () => {
    seed()
    const res = await anonymizeCandidate(manager, 'cand_1')
    expect(res).toEqual({ ok: true, erasedDocuments: 2 })
    expect(removedPaths).toEqual(['cv/1.pdf', 'cv/2.pdf'])
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    for (const op of ['documents.deleteMany', 'notes.deleteMany', 'answers.deleteMany',
                      'screenings.deleteMany', 'aiInterviews.deleteMany',
                      'offers.updateMany', 'applications.updateMany', 'candidate.update']) {
      expect(txOps).toContain(op)
    }
    expect(auditRows.some(a => a.action === 'Recruitment: Candidate Anonymized')).toBe(true)
  })

  it('anonymizes identity with a synthetic non-deliverable address', async () => {
    seed()
    await anonymizeCandidate(manager, 'cand_1')
    const updateCall = db.candidate.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(updateCall.data.email).toBe('anonymized-cand_1@removed.invalid')
    expect(updateCall.data.firstName).toBe('Removed')
    expect(updateCall.data.phone).toBeNull()
    expect(updateCall.data.linkedinUrl).toBeNull()
  })

  it('refuses missing, already-anonymized and talent-pool candidates', async () => {
    expect(await anonymizeCandidate(manager, 'ghost')).toMatchObject({ ok: false, status: 404 })
    seed({ id: 'cand_2', email: 'anonymized-cand_2@removed.invalid' })
    expect(await anonymizeCandidate(manager, 'cand_2')).toMatchObject({ ok: false, status: 409 })
    seed({ id: 'cand_3' })
    poolEntries.add('cand_3')
    expect(await anonymizeCandidate(manager, 'cand_3'))
      .toMatchObject({ ok: false, status: 409, error: expect.stringContaining('talent pool') })
  })

  it('a failed file delete never blocks the database scrub', async () => {
    removeMock.mockRejectedValueOnce(new Error('storage down'))
    seed()
    const res = await anonymizeCandidate(manager, 'cand_1')
    expect(res).toEqual({ ok: true, erasedDocuments: 1 })
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })
})

// ── No automatic deletion ─────────────────────────────────────────────────────

describe('report-only retention', () => {
  it('the compliance lib and route contain no scheduler and delete only via the explicit action', () => {
    for (const file of ['lib/recruitment/compliance.ts', 'app/api/admin/recruitment/compliance/route.ts']) {
      const src = read(file)
      expect(src).not.toMatch(/cron|setInterval|setTimeout/i)
    }
    const route = read('app/api/admin/recruitment/compliance/route.ts')
    expect(route).toContain("body.action !== 'anonymize'")
    expect(route).toContain("body.confirm !== 'ERASE'")
    expect(route).toContain("hasRecruitmentPermission(session, 'recruitment.settings.manage')")
    expect(route).toContain('{ status: 401 }')
  })
  it('the compliance page requires typing ERASE and links no bulk action', () => {
    const page = read('app/admin/recruitment/compliance/page.tsx')
    expect(page).toContain("prompt(")
    expect(page).toContain("!== 'ERASE'")
    expect(page).toContain('cannot be undone')
    expect(page).not.toMatch(/erase all|bulk/i)
  })
})

// ── Analytics ─────────────────────────────────────────────────────────────────

describe('analytics route', () => {
  const src = read('app/api/admin/recruitment/analytics/route.ts')
  it('is authenticated and returns aggregates only', () => {
    expect(src).toContain('getAdminSession')
    expect(src).toContain("hasRecruitmentPermission(session, 'recruitment.analytics.view')")
    expect(src).toContain('groupBy')
    // no candidate identity fields selected anywhere
    expect(src).not.toMatch(/firstName|lastName|email: true|phone/)
  })
  it('computes time-to-hire from stage history, not guesses', () => {
    expect(src).toContain("toKey: 'hired'")
    expect(src).toContain('avgTimeToHireDays')
  })
})

// ── Dashboard & nav wiring ────────────────────────────────────────────────────

describe('overview dashboard', () => {
  it('renders live analytics and links every shipped area', () => {
    const page = read('app/admin/recruitment/page.tsx')
    expect(page).toContain('/api/admin/recruitment/analytics')
    for (const href of ['/admin/recruitment/jobs', '/admin/recruitment/templates',
                        '/admin/recruitment/talent-pool', '/admin/recruitment/compliance']) {
      expect(page).toContain(href)
    }
    expect(page).toContain('Pipeline by job')
  })
  it('compliance appears in the admin nav', () => {
    expect(read('lib/admin/permissions.ts')).toContain('/admin/recruitment/compliance')
  })
})
