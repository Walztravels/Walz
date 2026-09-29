/**
 * Jade Travel Club — public member ID tests.
 * Covers section 10/22: safe public member ID, no internal ID exposure.
 */

import { generateMemberCode, isValidMemberCode } from '../member-code'

describe('generateMemberCode', () => {
  it('produces the JW-###### format', () => {
    const code = generateMemberCode()
    expect(code).toMatch(/^JW-\d{6}$/)
  })

  it('never looks like a cuid/uuid (no internal DB id exposure)', () => {
    const code = generateMemberCode()
    expect(code).not.toMatch(/^c[a-z0-9]{24}$/) // cuid shape
    expect(code).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) // uuid shape
  })

  it('generates varying codes (not a fixed/predictable sequence)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateMemberCode()))
    expect(codes.size).toBeGreaterThan(1)
  })
})

describe('isValidMemberCode', () => {
  it('accepts a well-formed code', () => {
    expect(isValidMemberCode('JW-002847')).toBe(true)
  })

  it('rejects malformed codes', () => {
    expect(isValidMemberCode('JW-12')).toBe(false)
    expect(isValidMemberCode('jw-002847')).toBe(false)
    expect(isValidMemberCode('002847')).toBe(false)
    expect(isValidMemberCode('JW-0028470')).toBe(false)
    expect(isValidMemberCode('')).toBe(false)
  })
})
