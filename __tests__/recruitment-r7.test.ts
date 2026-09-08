/**
 * Recruitment Hub — Release 7 (secure AI screening interviews).
 *
 * Covers: seed question set (10 questions), token security (hashed,
 * expiring, never stored raw), candidate state minimization, answer
 * submission flow (validation, progression, completion), consent gating
 * and open-interview guard on invites, human-review flow, prohibited-
 * modality invariants (no audio/video/facial/emotion/accent anywhere),
 * route security and migration invariants.
 */

import fs from 'fs'
import path from 'path'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const interviews = new Map<string, Record<string, unknown>>()
let seq = 0

const db = {
  aiInterview: {
    findUnique: jest.fn(async ({ where }: { where: { tokenHash?: string; id?: string } }) => {
      const rows = [...interviews.values()]
      const row = where.tokenHash
        ? rows.find(r => r.tokenHash === where.tokenHash)
        : rows.find(r => r.id === where.id)
      return row ? { ...row } : null
    }),
    findFirst: jest.fn(async ({ where }: { where: { applicationId: string; status?: { in: string[] } } }) => {
      const row = [...interviews.values()].find(r =>
        r.applicationId === where.applicationId &&
        (!where.status || where.status.in.includes(r.status as string)))
      return row ? { id: row.id } : null
    }),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `iv_${++seq}`, currentIndex: 0, transcript: [], status: 'invited', startedAt: null, ...data }
      interviews.set(row.id as string, row)
      return { id: row.id }
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = interviews.get(where.id)
      if (row) Object.assign(row, data)
      return row
    }),
  },
  aiInterviewQuestionSet: { findUnique: jest.fn() },
  jobApplication: { findUnique: jest.fn() },
  jobOpening:     { findUnique: jest.fn(async () => ({ title: 'Sales Rep' })) },
  activityLog:    { create: jest.fn(async (x: unknown) => x) },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: db, prisma: db }))

const anthropicCreate = jest.fn(async () => ({
  content: [{ type: 'text', text: '{"summary":"Solid answers.","highlights":["3 years sales"]}' }],
}))
jest.mock('@/lib/anthropic', () => ({ getAnthropic: () => ({ messages: { create: anthropicCreate } }) }))

import {
  SALES_MARKETING_QUESTIONS, newInterviewToken, validQuestions, candidateState,
  submitInterviewAnswer, inviteAiInterview, isExpired, AI_INTERVIEW_NOTICE,
} from '@/lib/recruitment/ai-interview'
import { hashToken } from '@/lib/recruitment/applications'

const manager = { id: 's1', email: 'manager@walztravels.com', name: 'Manager' }
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

beforeEach(() => {
  interviews.clear()
  jest.clearAllMocks()
})

// ── Seed questions ────────────────────────────────────────────────────────────

describe('Sales & Marketing seed questions', () => {
  it('has exactly 10 valid questions covering the required themes', () => {
    expect(SALES_MARKETING_QUESTIONS.questions).toHaveLength(10)
    expect(validQuestions(SALES_MARKETING_QUESTIONS.questions)).not.toBeNull()
    const all = SALES_MARKETING_QUESTIONS.questions.map(q => q.question).join(' ').toLowerCase()
    for (const theme of ['commission', 'sales', 'travel', 'follow up', 'client']) {
      expect(all).toContain(theme)
    }
  })
  it('is seeded idempotently by the migration with a stable id', () => {
    const sql = read('prisma/migrations/recruitment_r7_ai_interviews.sql')
    expect(sql).toContain("'qs_sales_marketing_rep'")
    expect(sql).toContain('ON CONFLICT ("id") DO NOTHING')
    for (const q of SALES_MARKETING_QUESTIONS.questions) expect(sql).toContain(`"key":"${q.key}"`)
  })
})

// ── Token security ────────────────────────────────────────────────────────────

describe('interview tokens', () => {
  it('are long, random, hashed and expiring', () => {
    const a = newInterviewToken()
    const b = newInterviewToken()
    expect(a.token).not.toBe(b.token)
    expect(a.token.length).toBeGreaterThanOrEqual(32)
    expect(a.hash).toBe(hashToken(a.token))
    expect(a.hash).not.toContain(a.token)
    const days = (a.expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(13.9)
    expect(days).toBeLessThan(14.1)
  })
  it('expiry check works', () => {
    expect(isExpired({ tokenExpiresAt: new Date(Date.now() - 1000) })).toBe(true)
    expect(isExpired({ tokenExpiresAt: new Date(Date.now() + 1000) })).toBe(false)
  })
})

// ── Candidate state minimization ──────────────────────────────────────────────

describe('candidateState', () => {
  const base = {
    id: 'iv', status: 'in_progress', tokenExpiresAt: new Date(), applicationId: 'app',
    questions: [{ key: 'a', question: 'QA' }, { key: 'b', question: 'QB' }],
    transcript: [], currentIndex: 1,
  }
  it('exposes only progress and the current question', () => {
    const state = candidateState(base)
    expect(state).toEqual({ status: 'in_progress', total: 2, index: 1, question: 'QB' })
    expect(Object.keys(state).sort()).toEqual(['index', 'question', 'status', 'total'])
  })
  it('exposes no question after completion or cancellation', () => {
    expect(candidateState({ ...base, status: 'completed', currentIndex: 2 }).question).toBeNull()
    expect(candidateState({ ...base, status: 'cancelled' }).question).toBeNull()
  })
})

// ── Answer submission flow ────────────────────────────────────────────────────

describe('submitInterviewAnswer', () => {
  function seed(over: Record<string, unknown> = {}) {
    const { token, hash, expiresAt } = newInterviewToken()
    const row = {
      id: `iv_${++seq}`, applicationId: 'app_1', tokenHash: hash, tokenExpiresAt: expiresAt,
      status: 'invited', currentIndex: 0, transcript: [], startedAt: null,
      questions: [{ key: 'a', question: 'QA' }, { key: 'b', question: 'QB' }],
      ...over,
    }
    interviews.set(row.id as string, row)
    return { token, row }
  }

  it('records answers, advances, and completes on the last question', async () => {
    const { token, row } = seed()
    expect(await submitInterviewAnswer(token, 'First answer')).toEqual({ ok: true, completed: false })
    let saved = interviews.get(row.id as string)!
    expect(saved.status).toBe('in_progress')
    expect(saved.currentIndex).toBe(1)
    expect((saved.transcript as unknown[]).length).toBe(1)

    expect(await submitInterviewAnswer(token, 'Second answer')).toEqual({ ok: true, completed: true })
    saved = interviews.get(row.id as string)!
    expect(saved.status).toBe('completed')
    // advisory summary generated at completion, best-effort
    expect(anthropicCreate).toHaveBeenCalledTimes(1)
    expect(saved.aiSummary).toBe('Solid answers.')
  })

  it('rejects invalid tokens, empty and oversized answers', async () => {
    const { token } = seed()
    expect(await submitInterviewAnswer('bogus-token-bogus-token', 'x')).toMatchObject({ ok: false, status: 404 })
    expect(await submitInterviewAnswer(token, '   ')).toMatchObject({ ok: false, status: 400 })
    expect(await submitInterviewAnswer(token, 'x'.repeat(5001))).toMatchObject({ ok: false, status: 400 })
  })

  it('refuses expired, cancelled and completed interviews', async () => {
    const { token: t1 } = seed({ tokenExpiresAt: new Date(Date.now() - 1000) })
    expect(await submitInterviewAnswer(t1, 'a')).toMatchObject({ ok: false, status: 410 })
    const { token: t2 } = seed({ status: 'cancelled' })
    expect(await submitInterviewAnswer(t2, 'a')).toMatchObject({ ok: false, status: 410 })
    const { token: t3 } = seed({ status: 'completed', currentIndex: 2 })
    expect(await submitInterviewAnswer(t3, 'a')).toMatchObject({ ok: false, status: 409 })
  })

  it('a summary failure never fails the candidate submission', async () => {
    anthropicCreate.mockRejectedValueOnce(new Error('api down'))
    const { token } = seed({ questions: [{ key: 'a', question: 'QA' }] })
    expect(await submitInterviewAnswer(token, 'only answer')).toEqual({ ok: true, completed: true })
  })
})

// ── Invites ───────────────────────────────────────────────────────────────────

describe('inviteAiInterview', () => {
  const application = {
    id: 'app_1', reference: 'WALZ-CAREERS-2026-ABCDEF', status: 'active',
    consentAiVersion: '2026-09', candidate: { email: 'c@x.com', firstName: 'Ada' },
  }

  it('creates an invited interview with hashed token and seed questions', async () => {
    db.jobApplication.findUnique.mockResolvedValueOnce(application)
    const res = await inviteAiInterview(manager, 'app_1', null)
    expect(res).toMatchObject({ ok: true, candidateEmail: 'c@x.com', firstName: 'Ada' })
    if (res.ok) {
      const row = interviews.get(res.interviewId)!
      expect(row.tokenHash).toBe(hashToken(res.token))
      expect((row.questions as unknown[]).length).toBe(10)
      expect(row.invitedBy).toBe('manager@walztravels.com')
    }
  })

  it('refuses candidates without recorded AI consent', async () => {
    db.jobApplication.findUnique.mockResolvedValueOnce({ ...application, consentAiVersion: null })
    expect(await inviteAiInterview(manager, 'app_1', null))
      .toMatchObject({ ok: false, status: 400, error: expect.stringContaining('consent') })
  })

  it('refuses withdrawn applications and duplicate open invites', async () => {
    db.jobApplication.findUnique.mockResolvedValueOnce({ ...application, status: 'withdrawn' })
    expect(await inviteAiInterview(manager, 'app_1', null)).toMatchObject({ ok: false, status: 400 })

    db.jobApplication.findUnique.mockResolvedValueOnce(application)
    interviews.set('open1', { id: 'open1', applicationId: 'app_1', status: 'invited' })
    expect(await inviteAiInterview(manager, 'app_1', null)).toMatchObject({ ok: false, status: 409 })
  })
})

// ── Prohibited modalities & disclosure ────────────────────────────────────────

describe('text-only, disclosed, human-reviewed', () => {
  const files = [
    'lib/recruitment/ai-interview.ts',
    'app/careers/interview/[token]/page.tsx',
    'app/api/careers/interview/[token]/route.ts',
    'components/admin/recruitment/AiInterviewSection.tsx',
  ]
  it.each(files)('%s has no audio/video capture capability', file => {
    const src = read(file)
    // real capture APIs/elements only — the files legitimately *mention*
    // these modalities in their "we do not do this" disclosures
    expect(src).not.toMatch(/getUserMedia|MediaRecorder|mediaDevices|webcam|<video|<audio|captureStream/)
  })
  it('the candidate notice states the AI role and the human-decision rule', () => {
    expect(AI_INTERVIEW_NOTICE).toContain('does not make hiring decisions')
    expect(AI_INTERVIEW_NOTICE).toContain('No audio or video is recorded')
    expect(AI_INTERVIEW_NOTICE).toContain('accommodation')
  })
  it('the interview flow never touches pipeline stage or application status', () => {
    const lib = read('lib/recruitment/ai-interview.ts')
    expect(lib).not.toMatch(/stageKey/)
    expect(lib).not.toMatch(/jobApplication\.update/)
  })
})

// ── Route security ────────────────────────────────────────────────────────────

describe('routes', () => {
  it('admin route authenticates, authorizes and never returns the raw token after creation', () => {
    const src = read('app/api/admin/recruitment/applications/[id]/ai-interview/route.ts')
    expect(src).toContain('getAdminSession')
    expect(src).toContain('{ status: 401 }')
    expect(src).toContain("hasRecruitmentPermission(session, 'recruitment.interviews.manage')")
    // the GET select exposes no token fields
    expect(src.slice(src.indexOf('findMany'), src.indexOf('// POST'))).not.toContain('tokenHash')
    expect(src).toContain('emailed')
  })
  it('public route is rate-limited and returns minimal state', () => {
    const src = read('app/api/careers/interview/[token]/route.ts')
    expect(src).toContain('rateLimit')
    expect(src).toContain('{ status: 429 }')
    expect(src).toContain('candidateState')
    expect(src).not.toMatch(/lastName|email:|phone|coverLetter/)
  })
})

// ── Migration invariants ──────────────────────────────────────────────────────

describe('recruitment_r7 migration', () => {
  const sql = read('prisma/migrations/recruitment_r7_ai_interviews.sql')
  it('creates both tables idempotently with a unique token hash', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "AiInterviewQuestionSet"')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "AiInterview"')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "AiInterview_tokenHash_key"')
    expect(sql).toContain('ON DELETE CASCADE')
  })
})
