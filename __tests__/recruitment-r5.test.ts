/**
 * Recruitment Hub — Release 5 (interview plans, scheduling, scorecards).
 *
 * Covers: seed scorecard weights, criteria validation, score submission
 * (completeness, bounds, weighted overall), interview input validation,
 * route security (session-derived reviewer identity, one scorecard per
 * reviewer, post-commit candidate notification), no prohibited evaluation
 * dimensions, and migration invariants.
 */

import fs from 'fs'
import path from 'path'

import {
  SALES_MARKETING_SCORECARD, validateCriteria, scoreSubmission,
  validateInterviewInput, INTERVIEW_KINDS, INTERVIEW_STATUSES, RECOMMENDATIONS,
} from '@/lib/recruitment/interviews'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── Seed scorecard ────────────────────────────────────────────────────────────

describe('Sales & Marketing Representative seed scorecard', () => {
  it('has exactly the specified criteria and weights, summing to 100', () => {
    const weights = Object.fromEntries(SALES_MARKETING_SCORECARD.criteria.map(c => [c.key, c.weight]))
    expect(weights).toEqual({
      communication: 20, sales_experience: 20, persuasion: 20,
      client_sourcing: 15, travel_industry: 10, follow_up: 10,
      commission_understanding: 5,
    })
    expect(SALES_MARKETING_SCORECARD.criteria.reduce((s, c) => s + c.weight, 0)).toBe(100)
    expect(validateCriteria(SALES_MARKETING_SCORECARD.criteria)).toBe(true)
  })
  it('is seeded by the migration with a stable id, idempotently', () => {
    const sql = read('prisma/migrations/recruitment_r5_interviews_scorecards.sql')
    expect(sql).toContain("'sc_sales_marketing_rep'")
    expect(sql).toContain('ON CONFLICT ("id") DO NOTHING')
    for (const c of SALES_MARKETING_SCORECARD.criteria) {
      expect(sql).toContain(`"key":"${c.key}"`)
      expect(sql).toContain(`"weight":${c.weight}`)
    }
  })
})

// ── Criteria validation ───────────────────────────────────────────────────────

describe('validateCriteria', () => {
  it('rejects weights that do not sum to 100, duplicates, and bad shapes', () => {
    expect(validateCriteria([{ key: 'a', label: 'A', weight: 50 }])).toBe(false)
    expect(validateCriteria([
      { key: 'a', label: 'A', weight: 50 }, { key: 'a', label: 'A2', weight: 50 },
    ])).toBe(false)
    expect(validateCriteria([{ key: '', label: 'A', weight: 100 }])).toBe(false)
    expect(validateCriteria([{ key: 'a', label: 'A', weight: 0 }])).toBe(false)
    expect(validateCriteria([])).toBe(false)
    expect(validateCriteria('nope')).toBe(false)
  })
  it('accepts a valid set', () => {
    expect(validateCriteria([
      { key: 'a', label: 'A', weight: 60 }, { key: 'b', label: 'B', weight: 40 },
    ])).toBe(true)
  })
})

// ── Score submission ──────────────────────────────────────────────────────────

describe('scoreSubmission', () => {
  const criteria = [
    { key: 'a', label: 'A', weight: 60 },
    { key: 'b', label: 'B', weight: 40 },
  ]
  it('computes the weighted overall on a 0–100 scale', () => {
    // all 5s → 100; all 1s → 0; all 3s → 50
    expect(scoreSubmission(criteria, [{ key: 'a', score: 5 }, { key: 'b', score: 5 }]))
      .toMatchObject({ ok: true, overall: 100 })
    expect(scoreSubmission(criteria, [{ key: 'a', score: 1 }, { key: 'b', score: 1 }]))
      .toMatchObject({ ok: true, overall: 0 })
    expect(scoreSubmission(criteria, [{ key: 'a', score: 3 }, { key: 'b', score: 3 }]))
      .toMatchObject({ ok: true, overall: 50 })
    // a=5 (60), b=1 (0) → 60
    expect(scoreSubmission(criteria, [{ key: 'a', score: 5 }, { key: 'b', score: 1 }]))
      .toMatchObject({ ok: true, overall: 60 })
  })
  it('applies the seed weights correctly', () => {
    const perfectSales = SALES_MARKETING_SCORECARD.criteria.map(c => ({ key: c.key, score: 5 }))
    expect(scoreSubmission(SALES_MARKETING_SCORECARD.criteria, perfectSales))
      .toMatchObject({ ok: true, overall: 100 })
  })
  it('requires every criterion scored exactly once, 1–5, known keys only', () => {
    expect(scoreSubmission(criteria, [{ key: 'a', score: 5 }])).toMatchObject({ ok: false })
    expect(scoreSubmission(criteria, [{ key: 'a', score: 5 }, { key: 'a', score: 4 }])).toMatchObject({ ok: false })
    expect(scoreSubmission(criteria, [{ key: 'a', score: 6 }, { key: 'b', score: 3 }])).toMatchObject({ ok: false })
    expect(scoreSubmission(criteria, [{ key: 'a', score: 0 }, { key: 'b', score: 3 }])).toMatchObject({ ok: false })
    expect(scoreSubmission(criteria, [{ key: 'zzz', score: 3 }])).toMatchObject({ ok: false })
    expect(scoreSubmission(criteria, 'nope')).toMatchObject({ ok: false })
  })
  it('trims and caps per-criterion comments', () => {
    const res = scoreSubmission(criteria, [
      { key: 'a', score: 4, comment: `  ${'x'.repeat(2000)}  ` }, { key: 'b', score: 4 },
    ])
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.scores[0].comment).toHaveLength(1000)
  })
})

// ── Interview input validation ────────────────────────────────────────────────

describe('validateInterviewInput', () => {
  it('applies defaults and validates kinds, durations, dates', () => {
    expect(validateInterviewInput({})).toMatchObject({ ok: true, value: { kind: 'video', durationMins: 45 } })
    expect(validateInterviewInput({ kind: 'seance' })).toMatchObject({ ok: false })
    expect(validateInterviewInput({ durationMins: 3 })).toMatchObject({ ok: false })
    expect(validateInterviewInput({ durationMins: 999 })).toMatchObject({ ok: false })
    expect(validateInterviewInput({ scheduledAt: 'not-a-date' })).toMatchObject({ ok: false })
    const ok = validateInterviewInput({ kind: 'phone', scheduledAt: '2026-10-01T10:00:00Z', interviewers: ['a@walz.com', 'not-an-email', 42] })
    expect(ok).toMatchObject({ ok: true })
    if (ok.ok) expect(ok.value.interviewers).toEqual(['a@walz.com'])
  })
  it('exposes closed vocabularies', () => {
    expect([...INTERVIEW_KINDS]).toEqual(['phone', 'video', 'onsite'])
    expect([...INTERVIEW_STATUSES]).toEqual(['scheduled', 'completed', 'cancelled', 'no_show'])
    expect([...RECOMMENDATIONS]).toEqual(['strong_yes', 'yes', 'neutral', 'no', 'strong_no'])
  })
})

// ── Route invariants ──────────────────────────────────────────────────────────

describe('interview route security', () => {
  const routes = [
    'app/api/admin/recruitment/applications/[id]/interviews/route.ts',
    'app/api/admin/recruitment/interviews/[id]/route.ts',
    'app/api/admin/recruitment/interviews/[id]/scorecards/route.ts',
    'app/api/admin/recruitment/scorecard-templates/route.ts',
  ]
  it.each(routes)('%s authenticates, authorizes and is dynamic', route => {
    const src = read(route)
    expect(src).toContain('getAdminSession')
    expect(src).toContain('{ status: 401 }')
    expect(src).toContain('hasRecruitmentPermission')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
  })

  it('scorecard reviewer identity comes from the session, never the client', () => {
    const src = read('app/api/admin/recruitment/interviews/[id]/scorecards/route.ts')
    expect(src).toContain('reviewerEmail:  session.email')
    expect(src).not.toMatch(/reviewerEmail:\s*body/)
    expect(src).toContain('interviewId_reviewerEmail')     // one per reviewer, enforced
    expect(src).toContain('{ status: 409 }')
    expect(src).toContain('scoreSubmission')               // overall computed server-side
  })

  it('candidate notification is opt-in and sent only after the interview is committed', () => {
    const src = read('app/api/admin/recruitment/applications/[id]/interviews/route.ts')
    expect(src.indexOf('prisma.interview.create')).toBeLessThan(src.indexOf('notifyCandidate === true'))
    expect(src).toContain('notify failed')                 // send failure never rolls back
    expect(src).toContain("from 'Walz Travels <hello@walztravels.com>'".replace("from '", "'")) // sender constant
  })

  it('template creation enforces weight validity', () => {
    const src = read('app/api/admin/recruitment/scorecard-templates/route.ts')
    expect(src).toContain('validateCriteria')
    expect(src).toContain("hasRecruitmentPermission(session, 'recruitment.settings.manage')")
  })
})

// ── Prohibited evaluation dimensions ──────────────────────────────────────────

describe('no prohibited evaluation dimensions', () => {
  const files = [
    'lib/recruitment/interviews.ts',
    'components/admin/recruitment/InterviewsSection.tsx',
    'prisma/migrations/recruitment_r5_interviews_scorecards.sql',
  ]
  it.each(files)('%s scores job-relevant criteria only', file => {
    const src = read(file)
    expect(src).not.toMatch(/facial|appearance.scor|emotion.detect|accent.scor|age.scor|gender|ethnicit/i)
  })
})

// ── UI wiring ─────────────────────────────────────────────────────────────────

describe('interviews UI', () => {
  it('is embedded in the application detail page', () => {
    const src = read('app/admin/recruitment/applications/[id]/page.tsx')
    expect(src).toContain('InterviewsSection')
    expect(src).toContain('applicationId={app.id}')
  })
  it('the section schedules, updates status and submits scorecards via real APIs', () => {
    const src = read('components/admin/recruitment/InterviewsSection.tsx')
    expect(src).toContain('/interviews')
    expect(src).toContain("method: 'PATCH'")
    expect(src).toContain('/scorecards')
    expect(src).toContain('notifyCandidate')
    expect(src).toContain('never replace')
  })
})

// ── Migration invariants ──────────────────────────────────────────────────────

describe('recruitment_r5 migration', () => {
  const sql = read('prisma/migrations/recruitment_r5_interviews_scorecards.sql')
  it('creates all three tables idempotently with the reviewer-uniqueness index', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "ScorecardTemplate"')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "Interview"')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "InterviewScorecard"')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "InterviewScorecard_interviewId_reviewerEmail_key"')
    expect(sql).toContain('ON DELETE CASCADE')
  })
})
