/**
 * INT-2 (Officer Simulation 2.0) + INT-3 (Application Readiness).
 *
 * The simulation consumes the minimal case dossier and never predicts
 * decisions; readiness is deterministic, documented, evidence-backed —
 * all Math.random scoring is gone from CRIS.
 */

import fs from 'fs'
import path from 'path'

jest.mock('@/lib/db', () => ({ __esModule: true, default: {} }))

import { computeReadinessFromDossier, READINESS_VERSION } from '@/lib/intelligence/readiness'
import type { CaseDossier } from '@/lib/intelligence/case-dossier'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const simRoute  = read('app/api/admin/intelligence/officer-sim/route.ts')
const crisRoute = read('app/api/admin/intelligence/cris/route.ts')
const crisPage  = read('app/admin/intelligence/cris/page.tsx')
const dossier   = read('lib/intelligence/case-dossier.ts')
const readiness = read('lib/intelligence/readiness.ts')

const DOSSIER: CaseDossier = {
  applicationId: 'app1', destination: 'gb', visaType: 'tourist',
  applicant: { hasName: true, nationality: 'Nigerian', employmentStatus: 'employed', employerNamed: true, incomeDeclared: true },
  travel: { datesDeclared: true, tripDays: 7, purpose: 'tourism', accommodationNamed: true },
  evidence: { documentTypes: ['passport', 'employment_letter'], valueCount: 12 },
  documentChecks: [{ documentType: 'passport', verdict: 'authentic', reviewState: null }],
  crossCheck: {
    formType: 'UK Visitor Visa', runAt: '2026-09-16T10:00:00.000Z',
    counts: { fieldsChecked: 10, matches: 7, partialMatches: 1, conflicts: 1, missing: 1, unverified: 0 },
    conflictFields: [{ field: 'travel.startDate', explanation: 'Dates differ by 1 day.' }],
    missingFields: ['passport.expiryDate'],
  },
  financialDna: { computedAt: '2026-09-16T10:00:00.000Z', fundingCoverageRatio: 2.4, incomeConsistencyNote: 'consistent', reviewItems: [] },
}

describe('readiness engine (deterministic + explainable)', () => {
  it('same input → same output; dimensions carry evidence and issues', () => {
    const a = computeReadinessFromDossier(DOSSIER)
    const b = computeReadinessFromDossier(DOSSIER)
    expect(a.overall).toBe(b.overall)
    expect(a.version).toBe(READINESS_VERSION)
    const travel = a.dimensions.find(d => d.key === 'travelConsistency')!
    expect(travel.score).toBe(75)   // 100 − 25×1 conflict, documented formula
    expect(travel.issues[0]).toContain('travel.startDate')
    expect(travel.evidence[0]).toContain('FormCrossCheck')
    const passportDim = a.dimensions.find(d => d.key === 'identityConsistency')!
    expect(passportDim.score).toBe(92)   // 100 − 8×1 missing
    const funding = a.dimensions.find(d => d.key === 'financialFunding')!
    expect(funding.score).toBe(100)
    expect(funding.status).toBe('STRONG')
  })
  it('no data → INSUFFICIENT_DATA excluded from overall, never defaulted to 50', () => {
    const empty: CaseDossier = {
      ...DOSSIER, crossCheck: null, financialDna: null,
      evidence: { documentTypes: [], valueCount: 0 }, documentChecks: [],
    }
    const r = computeReadinessFromDossier(empty)
    const insufficient = r.dimensions.filter(d => d.status === 'INSUFFICIENT_DATA')
    expect(insufficient.length).toBe(5)
    // Only document completeness (0/3 present = 0) is scorable.
    expect(r.dimensionsScored).toBe(1)
    expect(r.overall).toBe(0)
    expect(r.note).toContain('not a visa-approval probability')
  })
  it('sub-1× funding coverage is an ATTENTION issue with the ratio named', () => {
    const r = computeReadinessFromDossier({
      ...DOSSIER,
      financialDna: { ...DOSSIER.financialDna!, fundingCoverageRatio: 0.6, reviewItems: ['x'] },
    })
    const funding = r.dimensions.find(d => d.key === 'financialFunding')!
    expect(funding.score).toBe(50)   // 100 − 40 (coverage<1) − 10 (1 review item)
    expect(funding.issues.some(i => i.includes('0.6×'))).toBe(true)
  })
})

describe('CRIS route — Math.random scoring removed', () => {
  it('contains no random values and no fabricated floors', () => {
    expect(crisRoute).not.toContain('Math.random')
    expect(crisRoute).not.toContain('50 + ')
    expect(crisRoute).not.toContain('60 + ')
    expect(crisRoute).toContain('computeReadinessForUser')
    expect(crisRoute).toContain("communicationScore:  0,   // no communication instrumentation yet")
  })
  it('payment reliability comes from real history — null (not 50) with no payments', () => {
    expect(crisRoute).toContain('payments.length > 0')
    expect(crisRoute).toContain(': null')
  })
  it('explanations persist (notes JSON) and a readiness_run event is recorded', () => {
    expect(crisRoute).toContain('notes: JSON.stringify(r)')
    expect(crisRoute).toContain("eventType: 'readiness_run'")
  })
  it('never framed as approval probability', () => {
    for (const src of [crisRoute, crisPage, readiness]) {
      expect(src.toLowerCase()).not.toMatch(/chance of (visa )?approval/)
      expect(src).not.toMatch(/\d+% chance/)
    }
    expect(crisPage).toContain('never a visa-approval probability')
  })
})

describe('Officer Simulation 2.0', () => {
  it('consumes the minimal case dossier, not raw documents', () => {
    expect(simRoute).toContain('buildCaseDossier')
    expect(dossier).toContain('counts, statuses and short')
    expect(dossier).not.toMatch(/rawValue|bodyText|pdf_base64/)
  })
  it('the system prompt forbids decision predictions', () => {
    expect(simRoute).toContain('never predict or claim what any officer or embassy will decide')
    expect(simRoute).toContain('will be refused')          // as a forbidden phrase
    expect(simRoute).toContain('NOT an approval probability')
  })
  it('staff free-text is delimited as untrusted data', () => {
    expect(simRoute).toContain('untrusted free text')
  })
  it('parse failures still return AI_PARSE_FAILED with nothing persisted (DI-1 invariant holds)', () => {
    expect(simRoute).toContain("code: 'AI_PARSE_FAILED'")
    expect(simRoute.indexOf('AI_PARSE_FAILED')).toBeLessThan(simRoute.indexOf('officerSimulationSession.create'))
  })
  it('case-aware runs record an officer_sim_run event', () => {
    expect(simRoute).toContain("eventType: 'officer_sim_run'")
  })
})
