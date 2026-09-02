/**
 * Walz Orbit — International phone number validator.
 *
 * Validates phone numbers by country code prefix rules.
 * Used to flag invalid numbers before they appear in brand config.
 *
 * CONFIRMED PRODUCTION NUMBER:
 *   Display  : +1 231 790 2336
 *   E.164    : 12317902336
 *   WhatsApp : https://wa.me/12317902336
 *
 * This is already set in lib/config/business.ts → BUSINESS.contacts.globalWhatsapp.
 * Do not hardcode this number elsewhere — always read from BUSINESS config.
 */

export interface PhoneValidationResult {
  raw:          string
  valid:        boolean
  e164?:        string    // only when valid
  display?:     string    // formatted for display, only when valid
  countryCode?: string    // e.g. '+1', '+44'
  localNumber?: string    // digits after country code
  warning?:     string    // human-readable problem description
  suggestion?:  string    // suggested correction if detectable
}

/**
 * Country code rules: minimum and maximum digit count after the country prefix.
 * Based on ITU-T E.164 national significant number lengths.
 */
const COUNTRY_RULES: Record<string, { min: number; max: number; name: string }> = {
  '1':   { min: 10, max: 10, name: 'US/Canada' },
  '44':  { min: 10, max: 10, name: 'UK' },
  '234': { min: 7,  max: 10, name: 'Nigeria' },
  '233': { min: 9,  max: 9,  name: 'Ghana' },
  '254': { min: 9,  max: 9,  name: 'Kenya' },
  '27':  { min: 9,  max: 9,  name: 'South Africa' },
  '61':  { min: 9,  max: 9,  name: 'Australia' },
  '971': { min: 9,  max: 9,  name: 'UAE' },
  '965': { min: 8,  max: 8,  name: 'Kuwait' },
  '966': { min: 9,  max: 9,  name: 'Saudi Arabia' },
}

/**
 * Match longest known country code prefix from the digit string.
 * Tries 3-digit, 2-digit, then 1-digit prefixes.
 */
function matchCountryCode(digits: string): { code: string; local: string } | null {
  for (const len of [3, 2, 1]) {
    const prefix = digits.slice(0, len)
    if (COUNTRY_RULES[prefix]) {
      return { code: prefix, local: digits.slice(len) }
    }
  }
  return null
}

/**
 * Validate an international phone number string.
 *
 * @param raw Raw phone string (e.g. '+12317902336', '+1 231 790 2336', '0012317902336')
 */
export function validatePhone(raw: string): PhoneValidationResult {
  if (!raw || !raw.trim()) {
    return { raw, valid: false, warning: 'Phone number is empty.' }
  }

  let digits = raw.trim()

  // Normalise leading indicators
  if (digits.startsWith('00')) digits = digits.slice(2)
  else if (digits.startsWith('+'))  digits = digits.slice(1)

  // Strip spaces, dashes, parentheses
  digits = digits.replace(/[\s\-().]/g, '')

  if (!/^\d+$/.test(digits)) {
    return { raw, valid: false, warning: `Phone contains non-numeric characters after stripping separators: "${digits}"` }
  }

  const match = matchCountryCode(digits)
  if (!match) {
    return { raw, valid: false, warning: 'Country code not recognised. Use full international format starting with + or 00.' }
  }

  const { code, local } = match
  const rule = COUNTRY_RULES[code]
  const display = `+${code} ${local}`
  const e164    = `${code}${local}`

  if (local.length < rule.min) {
    const missing = rule.min - local.length
    return {
      raw,
      valid:      false,
      countryCode: `+${code}`,
      localNumber: local,
      warning: `${rule.name} numbers (+${code}) require ${rule.min} digits after the country code, but only ${local.length} were provided (${missing} digit${missing === 1 ? '' : 's'} short).`,
      suggestion: `Check that the full number is correct. Example valid format: +${code} XXX XXX XXXX (${rule.min} digits).`,
    }
  }

  if (local.length > rule.max) {
    return {
      raw,
      valid:      false,
      countryCode: `+${code}`,
      localNumber: local,
      warning: `${rule.name} numbers (+${code}) must have no more than ${rule.max} digits after the country code, but ${local.length} were provided.`,
    }
  }

  return {
    raw,
    valid:       true,
    e164,
    display,
    countryCode: `+${code}`,
    localNumber: local,
  }
}

/** Validate the confirmed production global WhatsApp number. */
export const CONFIRMED_PHONE = validatePhone('+1 231 790 2336')
