/**
 * Recruitment Hub — Release 6 (human-reviewed AI résumé screening).
 *
 * Covers: response parsing (fences, prose, clamping, bad types), prompt
 * fairness guardrails, consent gating, the never-decides invariants (no
 * stage/status writes anywhere in the screening path), route security and
 * rate limiting, human-review flow, UI advisory labeling, and migration
 * idempotency.
 */

import fs from 'fs'
import path from 'path'

import {
  parseScreeningResponse, buildScreeningUserPrompt,
  SCREENING_SYSTEM_PROMPT, SCREENING_MODEL,
} from '@/lib/recruitment/ai-screening'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── Response parsing ──────────────────────────────────────────────────────────

describe('parseScreeningResponse', () => {
  const good = '{"summary":"Fits well.","strengths":["sales"],"concerns":["no CRM"],"suggestedQuestions":["Tell me…"],"matchScore":72}'

  it('parses plain JSON and fenced JSON', () => {
    expect(parseScreeningResponse(good)).toMatchObject({ summary: 'Fits well.', matchScore: 72 })
    expect(parseScreeningResponse('```json\n' + good + '\n```')).toMatchObject({ matchScore: 72 })
    expect(parseScreeningResponse('Here is my assessment:\n' + good)).toMatchObject({ matchScore: 72 })
  })
  it('clamps the score to 0–100 and tolerates bad types', () => {
    expect(parseScreeningResponse('{"matchScore":250}')).toMatchObject({ matchScore: 100 })
    expect(parseScreeningResponse('{"matchScore":-5}')).toMatchObject({ matchScore: 0 })
    expect(parseScreeningResponse('{"matchScore":"n/a"}')).toMatchObject({ matchScore: null })
    expect(parseScreeningResponse('{"strengths":"not-an-array","summary":42}'))
      .toMatchObject({ strengths: [], summary: '' })
  })
  it('returns null for non-JSON replies', () => {
    expect(parseScreeningResponse('I cannot help with that')).toBeNull()
    expect(parseScreeningResponse('')).toBeNull()
    expect(parseScreeningResponse('{broken')).toBeNull()
  })
  it('caps list lengths and entry sizes', () => {
    const many = JSON.stringify({ strengths: Array.from({ length: 50 }, (_, i) => `s${i}`.repeat(300)) })
    const parsed = parseScreeningResponse(many)
    expect(parsed?.strengths).toHaveLength(10)
    expect(parsed?.strengths[0].length).toBeLessThanOrEqual(500)
  })
})

// ── Prompt guardrails ─────────────────────────────────────────────────────────

describe('screening prompt guardrails', () => {
  it('the system prompt forbids protected characteristics and rejection recommendations', () => {
    expect(SCREENING_SYSTEM_PROMPT).toContain('ADVISORY')
    expect(SCREENING_SYSTEM_PROMPT).toContain('never make hiring decisions')
    expect(SCREENING_SYSTEM_PROMPT).toContain('never recommend rejecting')
    for (const term of ['age', 'gender', 'ethnicity', 'religion', 'disability', 'appearance', 'accent', 'name origin']) {
      expect(SCREENING_SYSTEM_PROMPT.toLowerCase()).toContain(term)
    }
    expect(SCREENING_SYSTEM_PROMPT).toContain('absence of information as unknown, not negative')
  })
  it('uses the claude-haiku-4-5 model', () => {
    expect(SCREENING_MODEL).toBe('claude-haiku-4-5-20251001')
  })
  it('the user prompt contains only job-relevant material and clips fields', () => {
    const prompt = buildScreeningUserPrompt({
      jobTitle: 'Sales Rep', requirements: 'r'.repeat(10_000), description: 'd',
      answers: [{ question: 'Q1', answer: 'A1' }], coverLetter: 'CL', cvText: 'CV',
    })
    expect(prompt).toContain('ROLE: Sales Rep')
    expect(prompt).toContain('Q: Q1')
    expect(prompt).toContain('<<<CV_START>>>\nCV\n<<<CV_END>>>')
    expect(prompt.length).toBeLessThan(10_000)   // clipped
  })
  it('notes the limitation when the CV is not machine-readable', () => {
    const prompt = buildScreeningUserPrompt({
      jobTitle: 'X', requirements: 'Y', description: '', answers: [], coverLetter: '', cvText: '',
    })
    expect(prompt).toContain('no machine-readable CV text')
  })
})

// ── Never-decides invariants ──────────────────────────────────────────────────

describe('AI never decides', () => {
  const lib = read('lib/recruitment/ai-screening.ts')
  it('the screening path never writes stageKey, status or rejection', () => {
    expect(lib).not.toMatch(/stageKey\s*:/)
    expect(lib).not.toMatch(/jobApplication\.update/)
    expect(lib).not.toMatch(/moveApplicationStage/)
    expect(lib).toContain('no stage or status change')
  })
  it('screening requires recorded candidate AI consent', () => {
    expect(lib).toContain('consentAiVersion')
    expect(lib).toContain("code: 'AI_CONSENT_REQUIRED'")
    expect(lib).toContain('did not consent to AI-assisted')
  })
  it('every run records the requesting human', () => {
    expect(lib).toContain('requestedBy:   session.email')
  })
})

// ── Route invariants ──────────────────────────────────────────────────────────

describe('ai-screening route', () => {
  const src = read('app/api/admin/recruitment/applications/[id]/ai-screening/route.ts')
  it('authenticates, authorizes trigger/review as management, rate limits', () => {
    expect(src).toContain('getAdminSession')
    expect(src).toContain('{ status: 401 }')
    expect(src).toContain("hasRecruitmentPermission(session, 'recruitment.ai.review')")
    expect(src).toContain('rateLimit')
    expect(src).toContain('{ status: 429 }')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
  })
  it('review identity comes from the session and re-review returns 409', () => {
    expect(src).toContain('reviewedBy: session.email')
    expect(src).toContain('{ status: 409 }')
  })
  it('the route exposes no automatic trigger — only explicit staff POST', () => {
    expect(src).not.toMatch(/cron|setInterval|setTimeout/i)
    expect(src).toContain('a human triggers one advisory screening run')
  })
})

// ── UI invariants ─────────────────────────────────────────────────────────────

describe('ai-screening UI', () => {
  const src = read('components/admin/recruitment/AiScreeningSection.tsx')
  it('labels results as advisory and states the human-decision rule', () => {
    expect(src).toContain('advisory only')
    expect(src).toContain('never rejects candidates')
    expect(src).toContain('All hiring decisions are made by staff')
    expect(src).toContain('Mark as reviewed by me')
  })
  it('is embedded in the application detail page', () => {
    expect(read('app/admin/recruitment/applications/[id]/page.tsx')).toContain('AiScreeningSection')
  })
})

// ── Migration invariants ──────────────────────────────────────────────────────

describe('recruitment_r6 migration', () => {
  const sql = read('prisma/migrations/recruitment_r6_ai_screening.sql')
  it('creates the results table idempotently with review columns', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "AiScreeningResult"')
    expect(sql).toContain('"reviewedBy"')
    expect(sql).toContain('"requestedBy"        TEXT NOT NULL')
    expect(sql).toContain('ON DELETE CASCADE')
  })
})
