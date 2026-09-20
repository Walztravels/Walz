/**
 * V1.4 — deterministic protected-value extraction + before/after comparison.
 * Release-blocking per the owner brief: covers the exact test matrix
 * requested (amounts, dates, emails, phones, URLs, references, flight
 * numbers, currency, blank/long input) plus the comparison logic itself.
 */
import { extractProtectedFacts, compareProtectedFacts, describeProtectedFactMismatch } from '@/lib/jade/assist/protected-facts'

describe('extractProtectedFacts', () => {
  it('extracts a currency amount in multiple formats', () => {
    expect(extractProtectedFacts('Your outstanding balance is USD 1,250.00').amounts).toContain('USD 1,250.00')
    expect(extractProtectedFacts('That will be $500 total').amounts).toContain('$500')
    expect(extractProtectedFacts('GBP 1,250').amounts).toContain('GBP 1,250')
    expect(extractProtectedFacts('1,250 GBP').amounts).toContain('1,250 GBP')
  })

  it('extracts dates in multiple formats', () => {
    expect(extractProtectedFacts('departs 18 Dec 2026').dates.length).toBeGreaterThan(0)
    expect(extractProtectedFacts('returning January 5').dates.length).toBeGreaterThan(0)
    expect(extractProtectedFacts('expires 2026-09-25').dates).toContain('2026-09-25')
  })

  it('extracts email addresses', () => {
    expect(extractProtectedFacts('contact us at jane@example.com please').emails).toContain('jane@example.com')
  })

  it('extracts phone numbers', () => {
    expect(extractProtectedFacts('call +234 803 555 1234 now').phones.length).toBeGreaterThan(0)
  })

  it('extracts URLs', () => {
    expect(extractProtectedFacts('see https://walztravels.com/quote-proposal/abc123 for details').urls)
      .toContain('https://walztravels.com/quote-proposal/abc123')
  })

  it('extracts a Walz quote reference', () => {
    expect(extractProtectedFacts('quote WT-Q-20260919-0001-R2 expires soon').references)
      .toContain('WT-Q-20260919-0001-R2')
  })

  it('extracts a PNR-shaped booking reference', () => {
    expect(extractProtectedFacts('your booking reference is AB12CD').references).toContain('AB12CD')
  })

  it('does not extract plain English words as references', () => {
    expect(extractProtectedFacts('hello there friend').references).toEqual([])
  })

  it('extracts a flight number', () => {
    expect(extractProtectedFacts('you are on BA123 departing tomorrow').flightNumbers).toContain('BA123')
  })

  it('extracts airport codes while excluding common all-caps English words', () => {
    const facts = extractProtectedFacts('flying LOS to LHR, and YES the ATM works')
    expect(facts.airportCodes).toContain('LOS')
    expect(facts.airportCodes).toContain('LHR')
    expect(facts.airportCodes).not.toContain('YES')
    expect(facts.airportCodes).not.toContain('ATM')
  })

  it('handles blank input', () => {
    const facts = extractProtectedFacts('')
    expect(facts.amounts).toEqual([])
    expect(facts.emails).toEqual([])
  })

  it('handles very long input without throwing', () => {
    const long = 'USD 1,250.00 '.repeat(2000)
    expect(() => extractProtectedFacts(long)).not.toThrow()
  })

  it('does not duplicate the same value across categories/instances', () => {
    const facts = extractProtectedFacts('USD 1,250.00 and again USD 1,250.00')
    expect(facts.amounts.filter(a => a === 'USD 1,250.00').length).toBe(1)
  })
})

describe('compareProtectedFacts', () => {
  it('reports preserved when nothing protected changed', () => {
    const original = 'Your balance is USD 1,250.00, quote WT-Q-1 expires 25 Sep.'
    const rewritten = 'Please note your outstanding balance of USD 1,250.00 for quote WT-Q-1, which expires 25 Sep.'
    const cmp = compareProtectedFacts(original, rewritten)
    expect(cmp.preserved).toBe(true)
    expect(cmp.missing).toEqual({})
  })

  it('flags a changed amount', () => {
    const original = 'Your balance is USD 1,250.00.'
    const rewritten = 'Your balance is USD 1,500.00.'
    const cmp = compareProtectedFacts(original, rewritten)
    expect(cmp.preserved).toBe(false)
    expect(cmp.missing.amounts).toContain('USD 1,250.00')
  })

  it('flags a currency swap even when the digits are identical (GBP -> USD)', () => {
    const original = 'Your balance is GBP 1,250.'
    const rewritten = 'Your balance is USD 1,250.'
    const cmp = compareProtectedFacts(original, rewritten)
    expect(cmp.preserved).toBe(false)
    expect(cmp.missing.amounts).toContain('GBP 1,250')
  })

  it('flags a dropped reference', () => {
    const original = 'Your quote WT-Q-20260919-0001 is ready.'
    const rewritten = 'Your quote is ready.'
    const cmp = compareProtectedFacts(original, rewritten)
    expect(cmp.preserved).toBe(false)
    expect(cmp.missing.references).toContain('WT-Q-20260919-0001')
  })

  it('flags a dropped date', () => {
    const original = 'It expires 25 Sep.'
    const rewritten = 'It expires soon.'
    const cmp = compareProtectedFacts(original, rewritten)
    expect(cmp.preserved).toBe(false)
    expect(cmp.missing.dates).toBeDefined()
  })

  it('tolerates whitespace/case differences (not a real change)', () => {
    const original = 'Email us at Jane@Example.com'
    const rewritten = 'Please email us at jane@example.com for help'
    const cmp = compareProtectedFacts(original, rewritten)
    expect(cmp.preserved).toBe(true)
  })

  it('checks extra tokens (e.g. a known client name from authoritative grounding)', () => {
    const cmp1 = compareProtectedFacts('Hello Aduke, your quote is ready.', 'Hello Aduke, here is your quote.', ['Aduke'])
    expect(cmp1.preserved).toBe(true)

    const cmp2 = compareProtectedFacts('Hello Aduke, your quote is ready.', 'Hello there, here is your quote.', ['Aduke'])
    expect(cmp2.preserved).toBe(false)
    expect(cmp2.missingExtraTokens).toContain('Aduke')
  })

  it('handles blank original and blank rewrite without throwing', () => {
    expect(() => compareProtectedFacts('', '')).not.toThrow()
    expect(compareProtectedFacts('', '').preserved).toBe(true)
  })
})

describe('describeProtectedFactMismatch', () => {
  it('produces a readable summary that never includes chain-of-thought, only the flagged values', () => {
    const cmp = compareProtectedFacts('Balance USD 1,250.00 due 25 Sep.', 'Balance due soon.')
    const msg = describeProtectedFactMismatch(cmp)
    expect(msg).toContain('USD 1,250.00')
    expect(msg).toMatch(/altered/i)
  })

  it('returns a generic message when nothing specific is recorded', () => {
    const msg = describeProtectedFactMismatch({ preserved: false, missing: {}, missingExtraTokens: [] })
    expect(msg).toMatch(/could not be verified/i)
  })
})
