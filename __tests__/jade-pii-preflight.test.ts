/**
 * V1.4 — conservative PII preflight (owner decision 8). Card numbers are
 * Luhn-validated (not just "13-19 digits"); CVV redaction requires strong
 * context. Ordinary travel information must never be touched.
 */
import { redactPaymentSecrets } from '@/lib/jade/assist/pii-preflight'

describe('redactPaymentSecrets — card numbers', () => {
  it('redacts a real (Luhn-valid) test card number', () => {
    const result = redactPaymentSecrets('my card is 4111111111111111 please charge it')
    expect(result.text).toContain('[redacted: card number]')
    expect(result.text).not.toContain('4111111111111111')
    expect(result.categories).toContain('card_number')
    expect(result.redactedCount).toBe(1)
  })

  it('redacts a Luhn-valid card number formatted with spaces', () => {
    const result = redactPaymentSecrets('4111 1111 1111 1111 is my card')
    expect(result.text).toContain('[redacted: card number]')
  })

  it('redacts a Luhn-valid card number formatted with dashes', () => {
    const result = redactPaymentSecrets('4111-1111-1111-1111')
    expect(result.text).toContain('[redacted: card number]')
  })

  it('does NOT redact a random 16-digit run that fails the Luhn checksum', () => {
    const notACard = '1234567890123456' // fails Luhn
    const result = redactPaymentSecrets(`ref ${notACard} for your file`)
    expect(result.text).toContain(notACard)
    expect(result.categories).not.toContain('card_number')
  })

  it('does not touch an ordinary phone number that happens not to satisfy the Luhn checksum', () => {
    const result = redactPaymentSecrets('call +234 801 234 5678 about booking WT-Q-1')
    expect(result.text).toContain('WT-Q-1')
    expect(result.text).toContain('234 5678')
    expect(result.redactedCount).toBe(0)
  })

  it('does not touch a short reference below the 13-digit minimum', () => {
    const result = redactPaymentSecrets('booking WT-Q-1 ref 12345')
    expect(result.text).toContain('WT-Q-1')
    expect(result.redactedCount).toBe(0)
  })
})

describe('redactPaymentSecrets — CVV/security code', () => {
  it('redacts a 3-digit number close to an explicit "cvv" mention', () => {
    const result = redactPaymentSecrets('the cvv is 123')
    expect(result.text).toContain('[redacted: security code]')
    expect(result.text).not.toMatch(/\b123\b/)
    expect(result.categories).toContain('security_code')
  })

  it('redacts a 4-digit number close to "security code"', () => {
    const result = redactPaymentSecrets('security code: 4821')
    expect(result.text).toContain('[redacted: security code]')
  })

  it('does NOT redact a bare 3-4 digit number with no cvv/security-code context', () => {
    const result = redactPaymentSecrets('room 412, gate 21, flight departs at 0930')
    expect(result.text).toContain('412')
    expect(result.text).toContain('0930')
    expect(result.categories).not.toContain('security_code')
  })

  it('does not redact a 3-4 digit number far away from the cvv mention', () => {
    const farText = 'cvv topic came up earlier. ' + 'padding text '.repeat(20) + 'the room number is 456'
    const result = redactPaymentSecrets(farText)
    expect(result.text).toContain('456')
  })
})

describe('redactPaymentSecrets — must not touch ordinary travel information', () => {
  it('preserves dates', () => {
    const result = redactPaymentSecrets('departs 18 Dec 2026, returns 5 Jan 2027')
    expect(result.text).toContain('18 Dec 2026')
    expect(result.text).toContain('5 Jan 2027')
  })

  it('preserves passport-style names and destinations', () => {
    const result = redactPaymentSecrets('passenger Aduke Okafor travelling to Lagos')
    expect(result.text).toContain('Aduke Okafor')
    expect(result.text).toContain('Lagos')
  })

  it('preserves booking/quote references', () => {
    const result = redactPaymentSecrets('your reference is WT-Q-20260919-0001')
    expect(result.text).toContain('WT-Q-20260919-0001')
  })

  it('preserves flight numbers', () => {
    const result = redactPaymentSecrets('you are booked on BA123')
    expect(result.text).toContain('BA123')
  })

  it('handles blank input without throwing', () => {
    expect(() => redactPaymentSecrets('')).not.toThrow()
    expect(redactPaymentSecrets('').redactedCount).toBe(0)
  })
})
