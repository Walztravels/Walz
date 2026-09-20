/**
 * V1.4 — content-safety scan, generalized from the existing
 * scanForCostLeakage() precedent in app/api/admin/email/jade/route.ts
 * (that route is untouched; this is a new shared module).
 */
import { scanContentSafety, describeContentSafetyFinding } from '@/lib/jade/assist/content-safety-scan'

describe('scanContentSafety — cost/margin leakage', () => {
  it.each(['margin', 'markup', 'commission', 'wholesale', 'net rate', 'profit', 'supplier cost'])(
    'flags "%s"', (term) => {
      const result = scanContentSafety(`Our ${term} on this booking is high.`)
      expect(result.safe).toBe(false)
      expect(result.findings.some(f => f.category === 'cost_leakage')).toBe(true)
    },
  )

  it('is case-insensitive', () => {
    expect(scanContentSafety('The MARKUP is 20%').safe).toBe(false)
  })
})

describe('scanContentSafety — unsafe promises', () => {
  it('flags a guaranteed-visa-approval claim', () => {
    expect(scanContentSafety('Your visa is guaranteed to be approved.').safe).toBe(false)
  })

  it('flags a 100% approval claim', () => {
    expect(scanContentSafety('We offer 100% approval guarantee.').safe).toBe(false)
  })

  it('flags an assertion that a visa has been approved', () => {
    expect(scanContentSafety('Great news, your visa has been approved!').safe).toBe(false)
  })

  it('flags an assertion that payment has been confirmed/received', () => {
    expect(scanContentSafety('Your payment has been received, thank you!').safe).toBe(false)
    expect(scanContentSafety('Your booking has been confirmed.').safe).toBe(false)
  })
})

describe('scanContentSafety — safe text passes', () => {
  it('passes an ordinary professional reply', () => {
    const result = scanContentSafety('Thank you for your message. We will review your documents and get back to you shortly.')
    expect(result.safe).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('passes text that mentions payment being "pending" or "still showing"', () => {
    const result = scanContentSafety('The payment is still showing as pending on our side, so we will verify it for you.')
    expect(result.safe).toBe(true)
  })

  it('handles blank input', () => {
    expect(scanContentSafety('').safe).toBe(true)
  })
})

describe('describeContentSafetyFinding', () => {
  it('returns an empty string when safe', () => {
    expect(describeContentSafetyFinding({ safe: true, findings: [] })).toBe('')
  })

  it('describes a cost-leakage-only finding without echoing the raw matched regex source', () => {
    const msg = describeContentSafetyFinding({ safe: false, findings: [{ category: 'cost_leakage', pattern: '\\bmargin\\b' }] })
    expect(msg).toMatch(/pricing|cost/i)
    expect(msg).not.toContain('\\b')
  })

  it('describes an unsafe-promise-only finding', () => {
    const msg = describeContentSafetyFinding({ safe: false, findings: [{ category: 'unsafe_promise', pattern: 'guaranteed' }] })
    expect(msg).toMatch(/guarantee|confirmation/i)
  })

  it('describes a mixed finding', () => {
    const msg = describeContentSafetyFinding({
      safe: false,
      findings: [{ category: 'cost_leakage', pattern: 'margin' }, { category: 'unsafe_promise', pattern: 'guaranteed' }],
    })
    expect(msg).toMatch(/pricing/i)
    expect(msg).toMatch(/promise/i)
  })
})
