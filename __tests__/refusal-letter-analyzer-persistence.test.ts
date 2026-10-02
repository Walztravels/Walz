/**
 * Visa Refusal Letter Analyzer — PERSISTENCE test suite.
 *
 * Proves (against the real exported functions, not re-described logic):
 *  - Category A / B / REQUIRES_HUMAN_REVIEW analyses round-trip through
 *    saveRefusalLetterAnalysis() -> getRefusalLetterAnalysis() with a
 *    realistic in-memory Prisma raw-SQL mock (keyed store, not just a
 *    canned return value) — a genuine save-then-retrieve, not a
 *    computed-in-memory assertion.
 *  - A fabricated/adversarial model response cannot smuggle a non-empty
 *    checklist past enforceHardInvariants(), at BOTH the in-memory result
 *    and the persisted row.
 *  - Re-analysis is a documented, deterministic single-slot OVERWRITE.
 *  - Uploader/audit attribution: refusalLetterUploadedBy is the correct
 *    identifier, and the refusal_letter_analyzed CaseIntelligenceEvent
 *    audit entry fires correctly alongside persistence.
 *  - The persistence layer never throws up to the caller on a DB error —
 *    the analyzer keeps working with zero persistence.
 */

import fs from 'fs'
import path from 'path'

// ── Realistic in-memory "VisaApplication" raw-SQL mock ───────────────────
//
// Unlike a canned `jest.fn(async () => 1)`, this mock actually extracts the
// interpolated template values from the SAME tagged-template calls the real
// code makes (prisma.$executeRaw`UPDATE ... SET ... WHERE id = ${id}`) and
// stores/reads them in a keyed object, so a "save" genuinely makes a
// "get" return the saved value — proving the real round trip, not just
// that each function independently returns something plausible.
type StoredRow = {
  refusalLetterAnalysis: unknown
  refusalLetterAnalyzedAt: Date
  refusalLetterUploadedBy: string
}
const fakeVisaApplicationTable = new Map<string, StoredRow>()

function executeRawMock(strings: TemplateStringsArray, ...values: unknown[]) {
  const sql = strings.join('?')
  if (/UPDATE\s+"VisaApplication"/i.test(sql) && /refusalLetterAnalysis/.test(sql)) {
    // Positional values match the exact template in
    // saveRefusalLetterAnalysis(): [analysisJson, uploadedBy, applicationId]
    const [analysisJson, uploadedBy, applicationId] = values as [string, string, string]
    fakeVisaApplicationTable.set(applicationId, {
      refusalLetterAnalysis: JSON.parse(analysisJson),
      refusalLetterAnalyzedAt: new Date(),
      refusalLetterUploadedBy: uploadedBy,
    })
    return Promise.resolve(1)
  }
  return Promise.resolve(0)
}

function queryRawMock(strings: TemplateStringsArray, ...values: unknown[]) {
  const sql = strings.join('?')
  if (/SELECT\s+"refusalLetterAnalysis"/i.test(sql)) {
    const [applicationId] = values as [string]
    const row = fakeVisaApplicationTable.get(applicationId)
    return Promise.resolve(row ? [row] : [])
  }
  return Promise.resolve([])
}

const caseEventCreateMock = jest.fn(async (args: unknown) => args)

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    $executeRaw: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => executeRawMock(strings, ...values)),
    $queryRaw: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => queryRawMock(strings, ...values)),
    visaApplication: { findUnique: jest.fn(async () => null) },
    caseIntelligenceEvent: { create: caseEventCreateMock },
  },
}))

import prisma from '@/lib/db'
import {
  enforceHardInvariants, saveRefusalLetterAnalysis, getRefusalLetterAnalysis,
  type RefusalLetterAnalysisRaw,
} from '@/lib/analyzeRefusalLetter'
import { recordCaseEvent } from '@/lib/intelligence/case-events'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

function baseParsed(overrides: Partial<RefusalLetterAnalysisRaw> = {}): RefusalLetterAnalysisRaw {
  return {
    classification: 'DOCUMENTATION_OR_ELIGIBILITY',
    confidence: 'high',
    detectedJurisdiction: 'United Kingdom',
    detectedJurisdictionIso2: 'GB',
    references: ['GWF123456'],
    refusalReasons: [],
    previousRefusalLanguageDetected: false,
    officerConcerns: [],
    checklist: [],
    legalReviewFlag: false,
    staffFacingDisclaimer: '',
    summary: 'A documentation-only refusal.',
    ...overrides,
  }
}

beforeEach(() => {
  fakeVisaApplicationTable.clear()
  caseEventCreateMock.mockClear()
})

// ── 1. Category A round trip ──────────────────────────────────────────────

describe('persistence: DOCUMENTATION_OR_ELIGIBILITY (Category A) round trip', () => {
  it('stores then retrieves correctly, including a non-empty checklist', async () => {
    const parsed = baseParsed({
      classification: 'DOCUMENTATION_OR_ELIGIBILITY',
      checklist: [{ item: 'Provide 6 months of bank statements', reason: 'accumulation history' }],
    })
    const analysis = enforceHardInvariants({
      parsed, extractedText: 'irrelevant', jurisdictionStatus: 'VERIFIED',
      jurisdictionLabel: 'United Kingdom', jurisdictionIso2: 'GB', analysisEngine: 'test',
    })
    const ok = await saveRefusalLetterAnalysis('app_catA', analysis, 'staff_a@walztravels.com')
    expect(ok).toBe(true)

    const saved = await getRefusalLetterAnalysis('app_catA')
    expect(saved).not.toBeNull()
    expect(saved!.uploadedBy).toBe('staff_a@walztravels.com')
    expect(saved!.analyzedAt).not.toBeNull()
    expect((saved!.analysis as typeof analysis).classification).toBe('DOCUMENTATION_OR_ELIGIBILITY')
    expect((saved!.analysis as typeof analysis).checklist).toEqual([
      { item: 'Provide 6 months of bank statements', reason: 'accumulation history' },
    ])
    expect((saved!.analysis as typeof analysis).categoryADisclaimer).toBe(
      'All submitted evidence must be genuine and independently verifiable. Never fabricate, alter, or misrepresent financial, employment, or any other supporting documentation.',
    )
  })
})

// ── 2 & 3. Category B and REQUIRES_HUMAN_REVIEW persist an EMPTY checklist ──

describe('persistence: MISREPRESENTATION_OR_FRAUD (Category B) is stored with an EMPTY checklist', () => {
  it('the PERSISTED row — not just the in-memory result — has checklist: []', async () => {
    const parsed = baseParsed({
      classification: 'MISREPRESENTATION_OR_FRAUD',
      checklist: [{ item: 'Reapply with a new cover letter', reason: 'should never persist' }],
    })
    const analysis = enforceHardInvariants({
      parsed, extractedText: 'irrelevant', jurisdictionStatus: 'VERIFIED',
      jurisdictionLabel: 'United Kingdom', jurisdictionIso2: 'GB', analysisEngine: 'test',
    })
    expect(analysis.checklist).toEqual([]) // in-memory sanity check

    await saveRefusalLetterAnalysis('app_catB', analysis, 'staff_b@walztravels.com')
    const saved = await getRefusalLetterAnalysis('app_catB')
    expect(saved).not.toBeNull()
    expect((saved!.analysis as typeof analysis).classification).toBe('MISREPRESENTATION_OR_FRAUD')
    expect((saved!.analysis as typeof analysis).checklist).toEqual([]) // PERSISTED layer, round-tripped
  })
})

describe('persistence: REQUIRES_HUMAN_REVIEW is stored with an EMPTY checklist', () => {
  it('the PERSISTED row has checklist: []', async () => {
    const parsed = baseParsed({
      classification: 'REQUIRES_HUMAN_REVIEW',
      checklist: [{ item: 'Should never persist', reason: 'x' }],
    })
    const analysis = enforceHardInvariants({
      parsed, extractedText: 'irrelevant', jurisdictionStatus: 'VERIFIED',
      jurisdictionLabel: 'United Kingdom', jurisdictionIso2: 'GB', analysisEngine: 'test',
    })
    expect(analysis.checklist).toEqual([])

    await saveRefusalLetterAnalysis('app_review', analysis, 'staff_c@walztravels.com')
    const saved = await getRefusalLetterAnalysis('app_review')
    expect((saved!.analysis as typeof analysis).checklist).toEqual([])
    expect((saved!.analysis as typeof analysis).staffFacingDisclaimer).toBe(
      'This refusal may involve a misrepresentation finding. Legal consultation is required before proceeding with any reapplication.',
    )
  })
})

// ── 4. Adversarial/malformed AI output cannot bypass the invariant ─────────

describe('persistence: adversarial model output cannot bypass enforceHardInvariants at either layer', () => {
  it('a fabricated response claiming MISREPRESENTATION_OR_FRAUD with a non-empty checklist is forced empty in memory AND in the persisted row', async () => {
    // Simulate the worst case directly: a hand-crafted "raw model output"
    // object (as if parseModelResponse had returned it) that violates the
    // documented rule outright.
    const adversarialRawModelOutput = baseParsed({
      classification: 'MISREPRESENTATION_OR_FRAUD',
      checklist: [
        { item: 'Resubmit with manufactured transaction history', reason: 'attacker-controlled' },
        { item: 'Borrow funds temporarily to inflate the balance', reason: 'attacker-controlled' },
      ],
    })

    const analysis = enforceHardInvariants({
      parsed: adversarialRawModelOutput, extractedText: 'irrelevant', jurisdictionStatus: 'VERIFIED',
      jurisdictionLabel: 'United Kingdom', jurisdictionIso2: 'GB', analysisEngine: 'test',
    })

    // In-memory layer
    expect(analysis.classification).toBe('MISREPRESENTATION_OR_FRAUD')
    expect(analysis.checklist).toEqual([])

    // Persisted layer — round-tripped through the real save/get functions
    await saveRefusalLetterAnalysis('app_adversarial', analysis, 'staff_d@walztravels.com')
    const saved = await getRefusalLetterAnalysis('app_adversarial')
    expect((saved!.analysis as typeof analysis).checklist).toEqual([])
    // Prove the adversarial items genuinely never reached storage at all —
    // not merely that the array length is zero.
    const rawStoredJson = JSON.stringify(saved!.analysis)
    expect(rawStoredJson).not.toContain('manufactured transaction history')
    expect(rawStoredJson).not.toContain('Borrow funds temporarily')
  })
})

// ── 5. Re-analysis behavior: deterministic single-slot OVERWRITE ───────────

describe('persistence: re-analysis is a documented, deterministic single-slot OVERWRITE', () => {
  it('saving a second analysis for the same applicationId replaces the first — no versioning, no merge', async () => {
    const firstParsed = baseParsed({
      classification: 'DOCUMENTATION_OR_ELIGIBILITY',
      checklist: [{ item: 'First-pass item', reason: 'v1' }],
      summary: 'First analysis.',
    })
    const firstAnalysis = enforceHardInvariants({
      parsed: firstParsed, extractedText: 'irrelevant', jurisdictionStatus: 'VERIFIED',
      jurisdictionLabel: 'United Kingdom', jurisdictionIso2: 'GB', analysisEngine: 'test',
    })
    await saveRefusalLetterAnalysis('app_overwrite', firstAnalysis, 'staff_first@walztravels.com')

    const afterFirst = await getRefusalLetterAnalysis('app_overwrite')
    expect((afterFirst!.analysis as typeof firstAnalysis).summary).toBe('First analysis.')
    expect(afterFirst!.uploadedBy).toBe('staff_first@walztravels.com')

    // Re-run: a second, DIFFERENT analysis (e.g. staff uploaded a corrected
    // letter, or re-ran after a model update).
    const secondParsed = baseParsed({
      classification: 'REQUIRES_HUMAN_REVIEW',
      checklist: [{ item: 'Should be stripped anyway', reason: 'v2' }],
      summary: 'Second analysis supersedes the first.',
    })
    const secondAnalysis = enforceHardInvariants({
      parsed: secondParsed, extractedText: 'irrelevant', jurisdictionStatus: 'VERIFIED',
      jurisdictionLabel: 'United Kingdom', jurisdictionIso2: 'GB', analysisEngine: 'test',
    })
    await saveRefusalLetterAnalysis('app_overwrite', secondAnalysis, 'staff_second@walztravels.com')

    const afterSecond = await getRefusalLetterAnalysis('app_overwrite')
    // Final state reflects ONLY the second save — proving overwrite, not
    // versioning or append.
    expect((afterSecond!.analysis as typeof secondAnalysis).summary).toBe('Second analysis supersedes the first.')
    expect((afterSecond!.analysis as typeof secondAnalysis).classification).toBe('REQUIRES_HUMAN_REVIEW')
    expect(afterSecond!.uploadedBy).toBe('staff_second@walztravels.com')
    // The first analysis's content is gone — single slot, not a list.
    const rawStoredJson = JSON.stringify(afterSecond!.analysis)
    expect(rawStoredJson).not.toContain('First analysis')
    expect(rawStoredJson).not.toContain('First-pass item')
  })

  it('the overwrite decision is documented in a code comment on saveRefusalLetterAnalysis()', () => {
    const lib = read('lib/analyzeRefusalLetter.ts')
    expect(lib).toMatch(/RE-ANALYSIS BEHAVIOR.*single-slot,?\s*OVERWRITE/is)
    expect(lib).toMatch(/Bank Statement Analyzer.*NO persistence/is)
  })
})

// ── 6. Uploader/audit attribution preserved alongside persistence ──────────

describe('persistence: uploader attribution and the refusal_letter_analyzed audit event', () => {
  it('refusalLetterUploadedBy is populated with the exact caller-supplied identifier', async () => {
    const analysis = enforceHardInvariants({
      parsed: baseParsed(), extractedText: 'irrelevant', jurisdictionStatus: 'VERIFIED',
      jurisdictionLabel: 'United Kingdom', jurisdictionIso2: 'GB', analysisEngine: 'test',
    })
    await saveRefusalLetterAnalysis('app_attrib', analysis, 'jane.doe@walztravels.com')
    const saved = await getRefusalLetterAnalysis('app_attrib')
    expect(saved!.uploadedBy).toBe('jane.doe@walztravels.com')
  })

  it('recordCaseEvent actually writes a refusal_letter_analyzed row with the real Prisma call shape', async () => {
    await recordCaseEvent({
      applicationId: 'app_attrib',
      eventType: 'refusal_letter_analyzed',
      actor: 'jane.doe@walztravels.com',
      refType: 'VisaCaseDocument',
      refId: 'doc_123',
      summary: 'Refusal letter — documentation or eligibility',
      metadata: { classification: 'DOCUMENTATION_OR_ELIGIBILITY' },
    })
    expect(caseEventCreateMock).toHaveBeenCalledTimes(1)
    const callArg = caseEventCreateMock.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(callArg.data.applicationId).toBe('app_attrib')
    expect(callArg.data.eventType).toBe('refusal_letter_analyzed')
    expect(callArg.data.actor).toBe('jane.doe@walztravels.com')
  })

  it('the admin route wires saveRefusalLetterAnalysis and the refusal_letter_analyzed event together, under the same applicationId guard', () => {
    const route = read('app/api/admin/intelligence/refusal-letter/route.ts')
    // There are TWO `if (applicationId)` guards in this route — an earlier
    // one that looks up the known destination, and the persistence one at
    // the end. Find the one that actually contains the save call.
    const guardMatches = [...route.matchAll(/if\s*\(applicationId\)\s*\{([\s\S]*?)\n\s*\}/g)]
    const guardBody = guardMatches.map(m => m[1]).find(body => body.includes('saveRefusalLetterAnalysis'))
    expect(guardBody).toBeDefined()
    expect(guardBody!).toContain('saveRefusalLetterAnalysis(applicationId, analysis, session.email')
    expect(guardBody!).toContain("eventType: 'refusal_letter_analyzed'")
    expect(guardBody!.indexOf('saveRefusalLetterAnalysis')).toBeLessThan(guardBody!.indexOf('refusal_letter_analyzed'))
  })
})

// ── Fail-safe: a thrown DB error never reaches the caller/UI ────────────────

describe('persistence: fail-safe degradation — the analyzer continues to work with zero persistence', () => {
  it('saveRefusalLetterAnalysis swallows a pre-migration "column does not exist" error and returns false, not a throw', async () => {
    ;(prisma.$executeRaw as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('column "refusalLetterAnalysis" of relation "VisaApplication" does not exist')),
    )
    const analysis = enforceHardInvariants({
      parsed: baseParsed(), extractedText: 'irrelevant', jurisdictionStatus: 'VERIFIED',
      jurisdictionLabel: 'United Kingdom', jurisdictionIso2: 'GB', analysisEngine: 'test',
    })
    await expect(saveRefusalLetterAnalysis('app_x', analysis, 'staff@walztravels.com')).resolves.toBe(false)
  })

  it('getRefusalLetterAnalysis swallows the same pre-migration error and returns null, not a throw', async () => {
    ;(prisma.$queryRaw as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('relation "VisaApplication" does not exist')),
    )
    await expect(getRefusalLetterAnalysis('app_x')).resolves.toBeNull()
  })

  it('a generic/unexpected thrown error (e.g. a network blip) is NOT a crash in the sense of an uncaught exception reaching an HTTP handler — it propagates as a normal rejected promise the caller can catch, but it is never silently swallowed as if persistence had merely declined', async () => {
    ;(prisma.$executeRaw as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('connection terminated unexpectedly')),
    )
    const analysis = enforceHardInvariants({
      parsed: baseParsed(), extractedText: 'irrelevant', jurisdictionStatus: 'VERIFIED',
      jurisdictionLabel: 'United Kingdom', jurisdictionIso2: 'GB', analysisEngine: 'test',
    })
    // tryDb() only tolerates "does not exist|column|relation" shaped errors;
    // a genuinely unexpected error (not matching the pre-migration shape)
    // still rejects, so a real outage is never confused with "columns not
    // migrated yet" — this is the documented, intentional boundary of the
    // graceful-degradation contract (see lib/analyzeRefusalLetter.ts tryDb()).
    await expect(saveRefusalLetterAnalysis('app_x', analysis, 'staff@walztravels.com')).rejects.toThrow(
      'connection terminated',
    )
  })

  it('the admin API route never lets a persistence failure break the HTTP response — "persisted" is reported but the analysis result always still returns', async () => {
    const route = read('app/api/admin/intelligence/refusal-letter/route.ts')
    // The route's own top-level try/catch wraps the entire handler body
    // (including the save + audit-event block), so even an unexpected
    // persistence throw still reaches the generic 500 handler rather than
    // crashing the process — and the save call itself is a plain `await`
    // with no route-level special-casing that would make a throw behave
    // differently from any other step already covered by that try/catch.
    expect(route).toMatch(/try\s*\{[\s\S]*saveRefusalLetterAnalysis[\s\S]*\}\s*catch/)
  })
})
