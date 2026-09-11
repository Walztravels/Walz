/**
 * Transparent partial screening — an answers-only run must be a deliberate,
 * confirmed staff choice, permanently labelled, and impossible to mistake
 * for full résumé screening. Covers: the no-silent-fallback gate, the
 * confirmation contract, screeningSource recording, the answers-only prompt
 * guard, audit-preserving reruns, result-source labels, and the invariant
 * that no screening path can reject or move an applicant.
 */

import fs from 'fs'
import path from 'path'

import { buildScreeningUserPrompt, SCREENING_SOURCE_LABELS } from '@/lib/recruitment/ai-screening'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const lib   = read('lib/recruitment/ai-screening.ts')
const route = read('app/api/admin/recruitment/applications/[id]/ai-screening/route.ts')
const ui    = read('components/admin/recruitment/AiScreeningSection.tsx')

// ── No silent fallback ────────────────────────────────────────────────────────

describe('CV-unavailable gate', () => {
  it('an unreadable CV stops the run with CV_UNAVAILABLE unless answers-only was confirmed', () => {
    expect(lib).toContain("code: 'CV_UNAVAILABLE'")
    expect(lib).toContain('!cv.used && !opts.allowAnswersOnly')
    expect(lib).toContain('no silent fallback')
  })
  it('the gate sits BEFORE any result row or provider call — a refused run leaves no trace', () => {
    const gate = lib.indexOf("code: 'CV_UNAVAILABLE'")
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(lib.indexOf('aiScreeningResult.create'))
    expect(gate).toBeLessThan(lib.indexOf('messages.create'))
  })
  it('the route only allows answers-only when the request body confirms it explicitly', () => {
    expect(route).toContain('body.confirmAnswersOnly === true')
    expect(route).toContain('allowAnswersOnly')
    expect(route).toContain('never as a silent')
  })
})

// ── screeningSource recording ─────────────────────────────────────────────────

describe('screeningSource', () => {
  it('is derived from what was actually screened and stored on the result row', () => {
    expect(lib).toContain("cv.used ? (hasAnswers ? 'CV_AND_APPLICATION' : 'CV_ONLY') : 'APPLICATION_ANSWERS_ONLY'")
    expect(lib).toContain('{ ...rowData, screeningSource }')
  })
  it('every run still records the requesting staff member and creation timestamp', () => {
    expect(lib).toContain('requestedBy:   session.email')
    // createdAt is a schema default — assert the schema keeps it.
    expect(read('prisma/schema.prisma')).toMatch(/model AiScreeningResult[\s\S]*?createdAt[^\n]*@default\(now\(\)\)/)
  })
  it('the audit log names the source of every run', () => {
    expect(lib).toContain('[${screeningSource}]')
  })
  it('source labels match the specification exactly', () => {
    expect(SCREENING_SOURCE_LABELS).toEqual({
      CV_AND_APPLICATION:       'CV + application answers',
      CV_ONLY:                  'CV only',
      APPLICATION_ANSWERS_ONLY: 'Application answers only — partial',
    })
  })
  it('GET stays readable before the migration by deriving the source from cvUsed', () => {
    expect(route).toContain("r.cvUsed ? 'CV_AND_APPLICATION' : 'APPLICATION_ANSWERS_ONLY'")
  })
})

// ── Answers-only prompt guard ─────────────────────────────────────────────────

describe('answers-only prompt', () => {
  const base = {
    jobTitle: 'Travel Consultant', requirements: 'IATA experience', description: '',
    answers: [{ question: 'Q', answer: 'A' }], coverLetter: '', cvText: '',
  }
  it('states that no résumé content is available and forbids inferring credentials', () => {
    const p = buildScreeningUserPrompt({ ...base, answersOnly: true })
    expect(p).toContain('No résumé content is available')
    expect(p).toContain('PARTIAL')
    expect(p).toContain('Never infer qualifications, employment history, education or skills')
    expect(p).not.toContain('<<<CV_START>>>')
  })
  it('real CV text always takes precedence over the answersOnly flag', () => {
    const p = buildScreeningUserPrompt({ ...base, cvText: 'CV', answersOnly: true })
    expect(p).toContain('<<<CV_START>>>\nCV\n<<<CV_END>>>')
    expect(p).not.toContain('No résumé content is available')
  })
})

// ── Cannot be mistaken for full résumé screening (UI) ─────────────────────────

describe('partial-result presentation', () => {
  it('the result heading is a strict ternary — a partial result can never be titled "Résumé screening"', () => {
    expect(ui).toContain("{partial ? 'Application-answer screening' : 'Résumé screening'}")
    expect(ui).toContain("source === 'APPLICATION_ANSWERS_ONLY'")
  })
  it('partial results carry the amber badge and the required statement', () => {
    expect(ui).toContain('Partial assessment')
    expect(ui).toContain('The attached CV was not included because its text could not be extracted.')
  })
  it('rows without the new column are labelled from cvUsed, so legacy answers-only results also show as partial', () => {
    expect(ui).toContain("r.screeningSource ?? (r.cvUsed ? 'CV_AND_APPLICATION' : 'APPLICATION_ANSWERS_ONLY')")
  })
  it('the unreadable-CV panel offers exactly retry, answers-only and cancel', () => {
    expect(ui).toContain('Retry CV extraction')
    expect(ui).toContain('Screen application answers only')
    expect(ui).toContain('>\n              Cancel\n            </button>')
  })
  it('answers-only requires a window.confirm that names the permanent partial label', () => {
    expect(ui).toContain('window.confirm')
    expect(ui).toContain('Application answers only — partial')
    expect(ui).toMatch(/confirmAnswersOnly && !window\.confirm/)
  })
})

// ── Audit-preserving rerun ────────────────────────────────────────────────────

describe('full rerun after extraction succeeds', () => {
  it('the UI offers "Run full CV screening" and says the partial result is kept', () => {
    expect(ui).toContain('Run full CV screening')
    expect(ui).toContain('kept for audit')
  })
  it('the engine only ever updates the row it just created — previous results are never overwritten', () => {
    const updates = lib.match(/aiScreeningResult\.update\(\{\s*where:\s*\{ id: ([A-Za-z.]+) \}/g) ?? []
    expect(updates.length).toBeGreaterThan(0)
    for (const u of updates) expect(u).toContain('runningRow.id')
  })
})

// ── Never decides — including the answers-only path ───────────────────────────

describe('answers-only screening cannot reject or move the applicant', () => {
  it('no screening code path writes application stage, status or rejection', () => {
    for (const src of [lib, route, ui]) {
      expect(src).not.toMatch(/stageKey\s*:/)
      expect(src).not.toMatch(/jobApplication\.update/)
      expect(src).not.toMatch(/moveApplicationStage/)
      expect(src).not.toMatch(/status:\s*'REJECTED'/i)
    }
    expect(lib).toContain('no stage or status change')
  })
})

// ── Migration ─────────────────────────────────────────────────────────────────

describe('ai_screening_source migration', () => {
  const sql = read('prisma/migrations/ai_screening_source.sql')
  it('is additive, idempotent, and backfills from cvUsed', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "screeningSource"')
    expect(sql).toContain(`'CV_AND_APPLICATION'`)
    expect(sql).toContain('"cvUsed" = TRUE')
    expect(sql).not.toMatch(/DROP|DELETE FROM|TRUNCATE/i)
  })
})
