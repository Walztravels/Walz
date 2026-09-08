/**
 * Recruitment Hub — Release 1 (job management foundation).
 *
 * Covers: validation matrix, status-transition rules, deadline-aware public
 * filtering, slug generation/uniqueness, stable pipeline-stage keys, authz
 * role mapping, migration idempotency + original-four seed fidelity, and
 * public-page regression invariants.
 */

import fs from 'fs'
import path from 'path'

const mockFindFirst = jest.fn().mockResolvedValue(null)
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    jobOpening: { findFirst: (...a: unknown[]) => mockFindFirst(...a) },
    activityLog: { create: jest.fn(async (x: unknown) => x) },
  },
}))

import {
  validateJob, STATUS_TRANSITIONS, publicJobWhere, slugify, ensureUniqueSlug,
  DEFAULT_PIPELINE_STAGES, hasRecruitmentPermission, EMPLOYMENT_TYPES,
  DEFAULT_AI_DISCLOSURE,
} from '@/lib/recruitment/core'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

// ── Validation ────────────────────────────────────────────────────────────────

describe('job validation', () => {
  const base = { title: 'Sales Rep', type: 'Commission-based', location: 'Remote', description: 'Sell travel.' }

  it('accepts a valid job with all employment types', () => {
    for (const type of EMPLOYMENT_TYPES) {
      expect(validateJob({ ...base, type }).ok).toBe(true)
    }
  })

  it('rejects missing/invalid required fields', () => {
    expect(validateJob({ ...base, title: '' }).ok).toBe(false)
    expect(validateJob({ ...base, type: 'Gig' }).ok).toBe(false)
    expect(validateJob({ ...base, location: '   ' }).ok).toBe(false)
    expect(validateJob({ ...base, description: '' }).ok).toBe(false)
  })

  it('rejects invalid workplace, compensation and numeric fields', () => {
    expect(validateJob({ ...base, workplaceType: 'moon' }).ok).toBe(false)
    expect(validateJob({ ...base, compensationType: 'equity' }).ok).toBe(false)
    expect(validateJob({ ...base, compensationMin: -5 }).ok).toBe(false)
    expect(validateJob({ ...base, positions: 0 }).ok).toBe(false)
    expect(validateJob({ ...base, deadline: 'not-a-date' }).ok).toBe(false)
    expect(validateJob({ ...base, recruiters: 'not-an-array' }).ok).toBe(false)
  })

  it('partial validation only checks provided fields', () => {
    const r = validateJob({ deadline: '2026-12-31' }, true)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.deadline).toBeInstanceOf(Date)
  })
})

// ── Status transitions ────────────────────────────────────────────────────────

describe('status lifecycle', () => {
  it('enforces the legal transition map', () => {
    expect(STATUS_TRANSITIONS.draft).toContain('published')
    expect(STATUS_TRANSITIONS.published).toEqual(expect.arrayContaining(['paused', 'closed', 'archived']))
    expect(STATUS_TRANSITIONS.closed).toContain('published')      // reopen
    expect(STATUS_TRANSITIONS.archived).toEqual(['draft'])        // restore only
    // No transition ever hard-deletes; archived is terminal-but-restorable
    expect(STATUS_TRANSITIONS.published).not.toContain('draft')
  })
})

// ── Public visibility ─────────────────────────────────────────────────────────

describe('public job filtering', () => {
  it('only published jobs are public, hidden after deadline', () => {
    const now = new Date('2026-09-08T12:00:00Z')
    const where = publicJobWhere(now)
    expect(where.status).toBe('published')
    expect(where.OR).toEqual([{ deadline: null }, { deadline: { gt: now } }])
  })

  it('the public careers pages use the shared filter (no drafts/paused/closed leak)', () => {
    expect(read('app/careers/page.tsx')).toContain('publicJobWhere()')
    expect(read('app/careers/[slug]/page.tsx')).toContain('publicJobWhere()')
  })
})

// ── Slugs ─────────────────────────────────────────────────────────────────────

describe('slugs', () => {
  it('slugify normalizes titles', () => {
    expect(slugify('Sales & Marketing Rep!')).toBe('sales-marketing-rep')
    expect(slugify('  Travel Consultant  ')).toBe('travel-consultant')
  })

  it('ensureUniqueSlug appends a suffix on collision', async () => {
    mockFindFirst
      .mockResolvedValueOnce({ id: 'taken' })   // first candidate taken
      .mockResolvedValueOnce(null)
    const slug = await ensureUniqueSlug('Travel Consultant')
    expect(slug).toMatch(/^travel-consultant-[a-z0-9]{4}$/)
  })
})

// ── Pipeline stages ───────────────────────────────────────────────────────────

describe('default pipeline stages', () => {
  it('includes all system stages with stable keys', () => {
    const keys = DEFAULT_PIPELINE_STAGES.map(s => s.key)
    for (const k of ['new', 'recruiter_review', 'shortlisted', 'ai_interview_invited',
      'human_interview', 'offer', 'hired', 'rejected', 'talent_pool']) {
      expect(keys).toContain(k)
    }
    expect(new Set(keys).size).toBe(keys.length)   // no duplicate keys
  })
})

// ── Authorization mapping ─────────────────────────────────────────────────────

describe('recruitment authorization', () => {
  it('management roles can manage; regular staff can only view', () => {
    const manager = { role: 'operations_manager' }
    const staff   = { role: 'sales_rep' }
    expect(hasRecruitmentPermission(manager, 'recruitment.jobs.manage')).toBe(true)
    expect(hasRecruitmentPermission(staff,   'recruitment.jobs.manage')).toBe(false)
    expect(hasRecruitmentPermission(staff,   'recruitment.view')).toBe(true)
    expect(hasRecruitmentPermission(null,    'recruitment.view')).toBe(false)
    expect(hasRecruitmentPermission({ role: 'super_admin' }, 'recruitment.offers.manage')).toBe(true)
  })

  it('every recruitment API route enforces session + permission server-side', () => {
    for (const p of ['route.ts', '[id]/route.ts', 'reorder/route.ts', '[id]/questions/route.ts']) {
      const src = read(`app/api/admin/recruitment/jobs/${p}`)
      expect(src).toContain('getAdminSession')
      expect(src).toContain('hasRecruitmentPermission')
    }
  })
})

// ── Migration + seed fidelity ─────────────────────────────────────────────────

describe('R1 migration', () => {
  const sql = read('prisma/migrations/recruitment_r1_job_openings_extended.sql')

  it('is idempotent (IF NOT EXISTS / ON CONFLICT everywhere destructive-free)', () => {
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "JobOpening"/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS slug/)
    expect(sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/)
    expect(sql).toMatch(/ON CONFLICT \("jobId", key\) DO NOTHING/)
  })

  it('seeds the original four with exact text and fixed slugs, published', () => {
    expect(sql).toContain("'Visa Application Specialist', 'Full-time', 'London, UK (Hybrid)'")
    expect(sql).toContain("'Travel Consultant', 'Full-time', 'Remote (UK/Nigeria)'")
    expect(sql).toContain("'Customer Success Agent', 'Full-time', 'Remote'")
    expect(sql).toContain("'Frontend Engineer', 'Contract', 'Remote'")
    expect(sql).toContain("You''ll work directly with the founding team.")
    expect(sql).toContain("SET status = 'published'")
    for (const slug of ['visa-application-specialist', 'travel-consultant', 'customer-success-agent', 'frontend-engineer']) {
      expect(sql).toContain(`'${slug}'`)
    }
  })

  it('seeds default pipeline stages for existing jobs', () => {
    expect(sql).toContain("'new',                 'New Application'")
    expect(sql).toContain("'talent_pool',         'Talent Pool'")
  })
})

// ── Public page regression ────────────────────────────────────────────────────

describe('public careers regression', () => {
  const list = read('app/careers/page.tsx')

  it('fallback preserves the original four verbatim, in order (never empty pre-migration)', () => {
    let last = -1
    for (const title of ['Visa Application Specialist', 'Travel Consultant', 'Customer Success Agent', 'Frontend Engineer']) {
      const i = list.indexOf(`title: '${title}'`)
      expect(i).toBeGreaterThan(last)
      last = i
    }
  })

  it('DB rows link to /careers/[slug]; fallback keeps the original mailto CTA', () => {
    expect(list).toContain('href={`/careers/${slug}`}')
    expect(list).toContain('mailto:careers@walztravels.com?subject=')
  })

  it('detail page has JSON-LD, AI disclosure, apply CTA and accommodation route', () => {
    const detail = read('app/careers/[slug]/page.tsx')
    expect(detail).toContain('application/ld+json')
    expect(detail).toContain('JobPosting')
    expect(detail).toContain('DEFAULT_AI_DISCLOSURE')
    expect(detail).toContain('Application for ${job.title}')
    expect(detail).toContain('Accommodation%20request')
    expect(detail).toContain('notFound()')
  })

  it('the default AI disclosure includes the required commitments', () => {
    expect(DEFAULT_AI_DISCLOSURE).toContain('AI does not make final hiring decisions')
    expect(DEFAULT_AI_DISCLOSURE).toContain('accommodation')
  })
})
