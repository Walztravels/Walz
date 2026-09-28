/**
 * Staff Performance Management — pure eligibility/signal logic.
 * No DB access; every case constructed directly.
 */
import {
  SALES_ROLES,
  isSalesRole,
  evaluateQueueEligibility,
  classifySalesSignal,
  SIGNAL_LABEL,
  MIN_TENURE_DAYS,
} from '@/lib/performance/roles'

const NOW = new Date('2026-09-28T00:00:00Z')

function staff(overrides: Partial<Parameters<typeof evaluateQueueEligibility>[0]> = {}) {
  return {
    id: 's1',
    isActive: true,
    role: 'sales_agent',
    hireDate: null,
    performanceReviewExempt: false,
    performanceReviewExemptReason: null,
    performanceReviewExemptUntil: null,
    ...overrides,
  }
}

describe('isSalesRole / SALES_ROLES', () => {
  it('classifies known sales-responsibility roles', () => {
    for (const r of SALES_ROLES) expect(isSalesRole(r)).toBe(true)
  })
  it('excludes non-sales roles', () => {
    for (const r of ['visa_officer', 'accountant', 'customer_support', 'super_admin', 'operations_manager']) {
      expect(isSalesRole(r)).toBe(false)
    }
  })
})

describe('evaluateQueueEligibility', () => {
  it('an active sales-role staff member with unknown tenure and no exemption is eligible', () => {
    const r = evaluateQueueEligibility(staff(), NOW)
    expect(r.eligible).toBe(true)
    expect(r.tenureUnknown).toBe(true) // hireDate null — never assumed "recently hired"
  })

  it('excludes inactive staff', () => {
    const r = evaluateQueueEligibility(staff({ isActive: false }), NOW)
    expect(r.eligible).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/inactive/i)
  })

  it('excludes non-sales roles', () => {
    const r = evaluateQueueEligibility(staff({ role: 'visa_officer' }), NOW)
    expect(r.eligible).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/not a sales-responsibility role/i)
  })

  it('excludes staff hired less than MIN_TENURE_DAYS ago (joined <4 months)', () => {
    const hireDate = new Date(NOW.getTime() - 30 * 86_400_000) // 30 days ago
    const r = evaluateQueueEligibility(staff({ hireDate }), NOW)
    expect(r.eligible).toBe(false)
    expect(r.tenureUnknown).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/below the/i)
  })

  it('includes staff hired exactly at/after the minimum tenure boundary', () => {
    const hireDate = new Date(NOW.getTime() - (MIN_TENURE_DAYS + 1) * 86_400_000)
    const r = evaluateQueueEligibility(staff({ hireDate }), NOW)
    expect(r.eligible).toBe(true)
  })

  it('excludes staff explicitly marked exempt (generic override — covers leave/role-change/etc.)', () => {
    const r = evaluateQueueEligibility(
      staff({ performanceReviewExempt: true, performanceReviewExemptReason: 'Approved leave' }),
      NOW,
    )
    expect(r.eligible).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/Approved leave/)
  })

  it('an exemption with a past expiry date no longer excludes the staff member', () => {
    const r = evaluateQueueEligibility(
      staff({ performanceReviewExempt: true, performanceReviewExemptUntil: new Date(NOW.getTime() - 86_400_000) }),
      NOW,
    )
    expect(r.eligible).toBe(true)
  })
})

describe('classifySalesSignal', () => {
  it('never signals for a null (never sold / not computable) days-since value', () => {
    expect(classifySalesSignal(null)).toBe('NONE')
  })
  it('signals correctly at each threshold boundary', () => {
    expect(classifySalesSignal(29)).toBe('NONE')
    expect(classifySalesSignal(30)).toBe('MONITOR_30')
    expect(classifySalesSignal(59)).toBe('MONITOR_30')
    expect(classifySalesSignal(60)).toBe('MONITOR_60')
    expect(classifySalesSignal(89)).toBe('MONITOR_60')
    expect(classifySalesSignal(90)).toBe('MONITOR_90')
    expect(classifySalesSignal(119)).toBe('MONITOR_90')
    expect(classifySalesSignal(120)).toBe('REVIEW_RECOMMENDED_120')
    expect(classifySalesSignal(500)).toBe('REVIEW_RECOMMENDED_120')
  })

  it('the 120+ label matches the brief exactly, and the forbidden phrase never appears', () => {
    expect(SIGNAL_LABEL.REVIEW_RECOMMENDED_120).toBe('PERFORMANCE REVIEW RECOMMENDED')
    for (const label of Object.values(SIGNAL_LABEL)) {
      expect(label).not.toMatch(/must be warned/i)
    }
  })
})
