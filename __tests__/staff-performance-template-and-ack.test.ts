/**
 * Staff Performance Management — the deterministic letter template and
 * the fixed acknowledgement wording. Both are pure functions/constants —
 * no DB, no AI provider involved (mission brief §5/§9).
 */
import { buildWarningDraft, buildWarningParagraphs, warningTypeHeading, type WarningFacts } from '@/lib/performance/template'
import { ACKNOWLEDGEMENT_TEXT, FORBIDDEN_AGREEMENT_PHRASES } from '@/lib/performance/acknowledgement'

const BASE_FACTS: WarningFacts = {
  employeeName: 'Jane Doe',
  jobTitle: 'Senior Sales Agent',
  department: 'sales',
  warningType: 'FIRST_WRITTEN_WARNING',
  reviewPeriodStart: new Date('2026-05-01'),
  reviewPeriodEnd: new Date('2026-08-29'),
  salesInPeriod: 0,
  lastSaleDate: new Date('2026-04-02'),
  requiredImprovement: 'Generate at least 2 confirmed bookings per month.',
  pipDurationDays: 30,
  reviewDate: new Date('2026-09-29'),
  issuedByName: 'Super Admin',
  warningHistorySummary: 'No prior formal performance warning has been recorded for this staff member.',
  additionalNotes: null,
}

describe('buildWarningDraft — factual, non-accusatory letter content', () => {
  it('never claims/alleges misconduct (it may only explicitly DENY it) and never uses the forbidden phrase', () => {
    const draft = buildWarningDraft(BASE_FACTS)
    // The template explicitly disclaims misconduct ("does not represent an
    // allegation of misconduct") — that is compliant, reassuring language,
    // not an accusation. What must never appear is an AFFIRMATIVE claim.
    expect(draft.toLowerCase()).not.toMatch(/(constitutes|is an act of|amounts to) misconduct/)
    expect(draft.toLowerCase()).not.toMatch(/employee must be warned/)
  })

  it('states the review period, sales count, and last sale date as facts', () => {
    const draft = buildWarningDraft(BASE_FACTS)
    expect(draft).toContain('0 completed sale(s)')
    expect(draft).toContain('2 April 2026')
    expect(draft).toContain('29 August 2026')
  })

  it('includes the required improvement text verbatim', () => {
    const draft = buildWarningDraft(BASE_FACTS)
    expect(draft).toContain('Generate at least 2 confirmed bookings per month.')
  })

  it('includes an opportunity to raise inaccuracies/circumstances', () => {
    const draft = buildWarningDraft(BASE_FACTS)
    expect(draft.toLowerCase()).toMatch(/raise anything you believe is inaccurate/)
  })

  it('mentions possible further management action only for FIRST/FINAL warnings, and never states a decision has been made', () => {
    const first = buildWarningDraft({ ...BASE_FACTS, warningType: 'FIRST_WRITTEN_WARNING' })
    expect(first).toContain('further management action may be')
    expect(first).toContain('No decision on further action has been made')

    const coaching = buildWarningDraft({ ...BASE_FACTS, warningType: 'COACHING_NOTE' })
    expect(coaching).not.toContain('further management action may be')
  })

  it('mentions the PIP duration and review date when applicable', () => {
    const draft = buildWarningDraft({ ...BASE_FACTS, warningType: 'PERFORMANCE_IMPROVEMENT_PLAN' })
    expect(draft).toContain('30 days')
    expect(draft).toContain('29 September 2026')
  })

  it('handles a null last sale date without crashing and without inventing a date', () => {
    const draft = buildWarningDraft({ ...BASE_FACTS, lastSaleDate: null })
    expect(draft).toContain('not on record')
  })

  it('produces paragraphs as an array, so the UI/PDF can render them identically', () => {
    const paragraphs = buildWarningParagraphs(BASE_FACTS)
    expect(Array.isArray(paragraphs)).toBe(true)
    expect(paragraphs.length).toBeGreaterThan(3)
  })
})

describe('warningTypeHeading — example titles match the brief', () => {
  it('FIRST_WRITTEN_WARNING uses the exact example title from the brief', () => {
    const h = warningTypeHeading('FIRST_WRITTEN_WARNING')
    expect(h.title).toBe('FORMAL PERFORMANCE WARNING')
    expect(h.subtitle).toBe('Sales Performance & Improvement Plan')
  })
})

describe('Acknowledgement wording (mission brief §9)', () => {
  it('is exactly the required sentence', () => {
    expect(ACKNOWLEDGEMENT_TEXT).toBe('I acknowledge that I have received and reviewed this notice.')
  })
  it('never implies agreement', () => {
    for (const phrase of FORBIDDEN_AGREEMENT_PHRASES) {
      expect(ACKNOWLEDGEMENT_TEXT.toLowerCase()).not.toContain(phrase.toLowerCase())
    }
  })
})
