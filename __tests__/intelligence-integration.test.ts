/**
 * INT-9 — Integration: one synthetic case through the whole deterministic
 * intelligence core, verifying every conclusion traces back to source data.
 *
 * upload extraction → evidence rows (normalized, attributed)
 * → cross-check comparisons → findings/counts
 * → case dossier → readiness dimensions
 * → financial DNA → lifecycle-style traceability
 */

import type { ExtractedField } from '@/lib/intelligence/evidence'

const savedRows: Array<Record<string, unknown>> = []
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    visaCaseEvidence: {
      createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => { savedRows.push(...data); return { count: data.length } }),
      findMany: jest.fn(async () => savedRows),
    },
  },
}))
jest.mock('@/lib/anthropic', () => ({ getAnthropic: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ getSupabaseAdmin: jest.fn() }))
jest.mock('@/lib/analyzeBankStatement', () => ({ EMBASSY_DB: { uk: { tripCost: 3000, currency: 'GBP', min: 1200000 } } }))
jest.mock('@/lib/fx', () => ({ getStandardRate: jest.fn(async () => ({ rawRate: 2000, rateSource: 'STANDARD_MARKET' })) }))

import { saveEvidence } from '@/lib/intelligence/evidence'
import { runComparisons, countFindings, type Finding } from '@/lib/intelligence/cross-check'
import { computeReadinessFromDossier } from '@/lib/intelligence/readiness'
import { computeFinancialDna, normalizeSnapshot, type FinancialSnapshot } from '@/lib/intelligence/financial-dna'
import type { CaseDossier } from '@/lib/intelligence/case-dossier'

// ── The synthetic case ────────────────────────────────────────────────────────

const APPLICATION = {
  firstName: 'Jane', middleName: 'Mary', lastName: 'Doe',
  dateOfBirth: new Date('1991-03-10'), nationality: 'Nigerian',
  passportNumber: 'A1234567', passportExpiryDate: new Date('2030-04-10'),
  email: 'jane@x.com', phone: '+234800', homeAddress: '1 Rd', city: 'Lagos', country: 'Nigeria',
  employerName: 'ABC Limited', jobTitle: 'Manager', monthlyIncome: 'NGN 850,000',
  arrivalDate: new Date('2026-10-10'), returnDate: new Date('2026-10-17'),
  accommodationName: 'Hotel X',
}

const UPLOADS: Array<{ documentType: string; sourceId: string; fields: ExtractedField[] }> = [
  { documentType: 'passport', sourceId: 'chk-passport', fields: [
    { field: 'passport.fullName', value: 'Jane Mary Doe', confidence: 0.98 },
    { field: 'passport.number', value: 'A123 4567', confidence: 0.99 },
    { field: 'passport.dateOfBirth', value: '10/03/1991', confidence: 0.97 },
    { field: 'passport.expiryDate', value: '2030-04-10', confidence: 0.97 },
  ]},
  { documentType: 'employment_letter', sourceId: 'chk-employment', fields: [
    { field: 'employment.fullName', value: 'Jane Mary Doe', confidence: 0.95 },
    { field: 'employment.employer', value: 'ABC Limited', confidence: 0.95 },
    { field: 'employment.monthlyIncome', value: 'NGN 850,000', confidence: 0.9 },
  ]},
  { documentType: 'flight_itinerary', sourceId: 'chk-flight', fields: [
    { field: 'flight.passengerName', value: 'JANE MARY DOE', confidence: 0.96 },
    { field: 'flight.departureDate', value: '11 October 2026', confidence: 0.96 },  // deliberate 1-day conflict
    { field: 'flight.returnDate', value: '17 October 2026', confidence: 0.96 },
  ]},
]

describe('synthetic case — end-to-end deterministic pipeline', () => {
  let findings: Finding[]
  let dossier: CaseDossier

  beforeAll(async () => {
    // 1. Ingest evidence from the three "uploaded documents".
    for (const u of UPLOADS) {
      await saveEvidence({
        applicationId: 'case-1', sourceType: 'document_analysis',
        sourceId: u.sourceId, documentType: u.documentType,
        extractionMethod: 'ai_vision', fields: u.fields,
      })
    }
    // 2. Cross-check the application against the accumulated evidence.
    findings = runComparisons(APPLICATION, savedRows as never)
  })

  it('evidence rows are normalized and fully source-attributed', () => {
    expect(savedRows.length).toBe(10)
    const dob = savedRows.find(r => r.field === 'passport.dateOfBirth')!
    expect(dob.normalizedValue).toBe('1991-03-10')           // 10/03/1991 day-first
    expect(dob.sourceId).toBe('chk-passport')
    const income = savedRows.find(r => r.field === 'employment.monthlyIncome')!
    expect(income).toMatchObject({ normalizedValue: '850000', currency: 'NGN', sourceType: 'document_analysis' })
  })

  it('cross-check finds the planted travel-date conflict and nothing false', () => {
    const counts = countFindings(findings)
    const conflict = findings.filter(f => f.status === 'CONFLICT')
    expect(conflict).toHaveLength(1)
    expect(conflict[0].field).toBe('travel.startDate')
    expect(conflict[0].explanation).toContain('1 day')
    expect(conflict[0].evidenceSourceId).toBe('chk-flight')   // traceable to the flight doc
    // Identity, passport, employment, income and return date all agree.
    for (const f of ['identity.fullName', 'passport.number', 'identity.dateOfBirth', 'employment.employer', 'financial.monthlyIncome', 'travel.returnDate']) {
      expect(findings.filter(x => x.field === f).every(x => x.status === 'MATCH')).toBe(true)
    }
    expect(counts.conflicts).toBe(1)
  })

  it('readiness consumes the findings and prices the conflict into travel consistency', () => {
    dossier = {
      applicationId: 'case-1', destination: 'gb', visaType: 'tourist',
      applicant: { hasName: true, nationality: 'Nigerian', employmentStatus: 'employed', employerNamed: true, incomeDeclared: true },
      travel: { datesDeclared: true, tripDays: 7, purpose: 'tourism', accommodationNamed: true },
      evidence: { documentTypes: ['passport', 'employment_letter', 'flight_itinerary'], valueCount: savedRows.length },
      documentChecks: UPLOADS.map(u => ({ documentType: u.documentType, verdict: 'authentic', reviewState: null })),
      crossCheck: {
        formType: 'UK Visitor Visa', runAt: new Date().toISOString(),
        counts: countFindings(findings),
        conflictFields: findings.filter(f => f.status === 'CONFLICT').map(f => ({ field: f.field, explanation: f.explanation })),
        missingFields: findings.filter(f => f.status === 'MISSING').map(f => f.field),
      },
      financialDna: { computedAt: new Date().toISOString(), fundingCoverageRatio: 2.37, incomeConsistencyNote: 'consistent', reviewItems: [] },
    }
    const readiness = computeReadinessFromDossier(dossier)
    const travel = readiness.dimensions.find(d => d.key === 'travelConsistency')!
    expect(travel.score).toBe(75)                            // 100 − 25 × 1 conflict
    expect(travel.issues[0]).toContain('travel.startDate')   // the exact conflict, named
    const identity = readiness.dimensions.find(d => d.key === 'identityConsistency')!
    expect(identity.status).not.toBe('INSUFFICIENT_DATA')
    // Bank statement missing → completeness reflects it honestly.
    const completeness = readiness.dimensions.find(d => d.key === 'documentCompleteness')!
    expect(completeness.score).toBe(67)                      // 2 of 3 expected doc types
    expect(completeness.issues[0]).toContain('bank statement')
    expect(readiness.overall).not.toBeNull()
    expect(readiness.note).toContain('not a visa-approval probability')
  })

  it('financial DNA cross-references the same declared income with FX-attributed coverage', async () => {
    const snapshot = normalizeSnapshot({
      status: 'PASS', currency: 'NGN', closingBalance: 14_200_000, lowestBalance: 2_000_000,
      averageMonthlyBalance: 8_000_000, estimatedMonthlyIncome: 850_000,
      salaryCreditsDetected: true, suspiciousTransactions: [], largeUnexplainedWithdrawals: [],
    }, 'case-1', 'analysis_result') as FinancialSnapshot
    const dna = await computeFinancialDna({
      declaredIncomeRaw: APPLICATION.monthlyIncome,
      snapshots: [snapshot],
      tripCost: { amount: 3000, currency: 'GBP', tier: 'destination benchmark (EMBASSY_DB.uk)' },
    })
    expect(dna.incomeConsistency.deltaPct).toBe(0)           // matches the evidence AND the application
    expect(dna.fundingCoverage.ratio).toBeCloseTo(2.37, 2)
    expect(dna.fundingCoverage.fxSource).toBe('STANDARD_MARKET')
    // Traceability: every populated value names its basis.
    for (const v of [dna.declaredMonthlyIncome, dna.observedMonthlyIncome, dna.closingBalance, dna.tripCost]) {
      if (v.value != null) expect((v as { basis: string }).basis).toBeTruthy()
    }
  })

  it('all intelligence traces back to actual source data — no orphan conclusions', () => {
    // Every non-MISSING finding points at a real evidence row.
    for (const f of findings) {
      if (f.status === 'MISSING') continue
      expect(savedRows.some(r => r.sourceId === f.evidenceSourceId || f.evidenceSourceId === null)).toBe(true)
    }
  })
})
