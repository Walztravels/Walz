/**
 * Identity normalization primitives (UX-4.1A).
 *
 * Pure, unit-testable functions shared by the conversation→client resolver.
 * No I/O, no environment access — deterministic string handling only.
 *
 * Why isPsidLike exists: the Chatwoot general webhook stores Meta PSIDs in
 * phone-shaped columns when Instagram/Facebook contacts have no real phone
 * (whatsapp / whatsapp_number get '+' + PSID — see
 * app/api/webhooks/chatwoot/route.ts fallback lookup and
 * app/api/webhooks/meta/route.ts hasAgentRepliedInChatwoot). A PSID must
 * never be treated as a telephone number by any identity heuristic.
 */

/** Lower-cased, trimmed email — null when empty or not email-shaped. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const e = raw.trim().toLowerCase()
  if (!e || !e.includes('@') || e.startsWith('@') || e.indexOf('@') === e.length - 1) return null
  return e
}

/**
 * Normalize a phone number to E.164-ish form ('+' + digits).
 *  - strips spaces, dashes, dots, parentheses
 *  - a leading '00' international prefix becomes '+'
 *  - a remaining leading '0' is a NATIONAL format (e.g. Nigerian 0803…):
 *    without country context it cannot be converted, and '+0…' is never
 *    valid E.164 (no country code starts with 0) — returns null rather
 *    than minting a non-canonical form that can never match the same
 *    person's true '+234…' number
 *  - a bare digit string keeps its digits (no country guessing)
 *  - returns null when fewer than 8 digits remain (not a dialable number)
 *  - returns null for PSID-shaped values — those are not phone numbers
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  if (!s) return null
  const hadPlus = s.startsWith('+')
  let digits = s.replace(/\D/g, '')
  if (!hadPlus && digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) return null   // national format — not convertible
  if (digits.length < 8) return null
  if (digits.length > 15) return null   // E.164 hard maximum
  const candidate = `+${digits}`
  if (isPsidLike(candidate)) return null
  return candidate
}

/**
 * Real 3-digit E.164 country codes that could legitimately begin a
 * maximum-length (15-digit) phone number. Anything 15 digits long that
 * does NOT begin with one of these cannot be a valid phone number.
 */
const PLAUSIBLE_3DIGIT_COUNTRY_CODES = new Set([
  '212', '213', '216', '218', '220', '221', '225', '226', '227', '228',
  '229', '230', '231', '232', '233', '234', '235', '236', '237', '238',
  '240', '241', '242', '243', '244', '245', '248', '249', '250', '251',
  '252', '253', '254', '255', '256', '257', '258', '260', '261', '263',
  '264', '265', '266', '267', '268', '351', '352', '353', '354', '355',
  '356', '357', '358', '359', '370', '371', '372', '373', '374', '375',
  '376', '377', '380', '381', '382', '385', '386', '387', '389', '420',
  '421', '852', '853', '855', '856', '880', '886', '960', '961', '962',
  '963', '964', '965', '966', '967', '968', '970', '971', '972', '973',
  '974', '975', '976', '977', '992', '993', '994', '995', '996', '998',
])

/**
 * True when a phone-shaped string is actually a Meta PSID.
 *
 * PSIDs are 15–17 digit opaque ids the webhooks store with a leading '+'
 * in phone columns. Valid E.164 numbers carry AT MOST 15 digits, so:
 *  - 16–17 digits → PSID-like, always
 *  - exactly 15 digits → PSID-like unless it starts with a real 3-digit
 *    country code (the only way a legitimate number reaches 15 digits)
 *  - fewer than 15 digits → not PSID-like
 * Non-numeric content (after an optional single leading '+') is not a
 * PSID either — it is simply not phone-shaped.
 */
export function isPsidLike(raw: string | null | undefined): boolean {
  if (typeof raw !== 'string') return false
  const s = raw.trim()
  const body = s.startsWith('+') ? s.slice(1) : s
  if (!/^\d+$/.test(body)) return false
  if (body.length >= 16 && body.length <= 17) return true
  if (body.length === 15) {
    return !PLAUSIBLE_3DIGIT_COUNTRY_CODES.has(body.slice(0, 3))
  }
  return false
}
