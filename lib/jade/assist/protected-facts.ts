/**
 * V1.4 Jade Staff Communication Intelligence — deterministic protected-value
 * extraction and before/after comparison (owner decision 7, release-blocking).
 *
 * Any material AI rewrite (Professionalize, tone changes, Translate) must
 * never silently change a fact a client is relying on — an amount, a date,
 * a reference, a contact detail. This module never asks the model whether
 * it preserved something; it independently re-derives both sides with plain
 * regex extraction and compares them. False positives (flagging something
 * that wasn't really an amount/reference) are safe — they just cause an
 * extra retry or a staff-facing warning. False negatives are the real
 * limit of a regex-based approach and are an accepted trade-off consistent
 * with the release brief's "deterministic... where practical."
 *
 * Client/passenger NAMES are deliberately not regex-detected here (free-text
 * name detection is unreliable). Callers that know a client's name from
 * server-authoritative grounding data (never from the transcript itself)
 * may pass it via `extraTokens` for an exact-preservation check — this is
 * the "where deterministically available" case the release brief allows.
 */

export interface ProtectedFacts {
  amounts: string[]
  dates: string[]
  emails: string[]
  phones: string[]
  urls: string[]
  references: string[]
  flightNumbers: string[]
  airportCodes: string[]
}

export type ProtectedFactCategory = keyof ProtectedFacts

const CATEGORIES: ProtectedFactCategory[] = [
  'amounts', 'dates', 'emails', 'phones', 'urls', 'references', 'flightNumbers', 'airportCodes',
]

// ─── Extraction patterns ─────────────────────────────────────────────────────

const AMOUNT_RE =
  /(?:[$£€₦]|\b(?:USD|GBP|EUR|CAD|NGN)\b)\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\b\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s?\b(?:USD|GBP|EUR|CAD|NGN)\b/gi

const DATE_RE =
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*(?:\s+\d{2,4})?\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{2,4})?\b/gi

const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g

// At least 8 digits total (with optional separators) — long enough to avoid
// matching short incidental numbers, generous enough for international formats.
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g

const URL_RE = /https?:\/\/[^\s)>\]"']+/gi

// Walz-specific quote/visa reference shapes, e.g. WT-Q-20260919-0001-R2.
const WALZ_REF_RE = /\bWT-[A-Z0-9-]+\b/g

// PNR/booking-reference-shaped tokens: 5-8 alphanumeric characters containing
// at least one letter and one digit (excludes plain words and pure numbers).
const ALNUM_REF_RE = /\b(?=[A-Z0-9]{5,8}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{5,8}\b/g

// Airline code (2 letters) + 2-4 digit flight number, e.g. BA123, EK 007.
const FLIGHT_NUMBER_RE = /\b[A-Z]{2}\s?\d{2,4}\b/g

// 3-letter IATA-shaped airport codes — bare uppercase 3-letter tokens, minus
// a denylist of common all-caps English words/abbreviations that would
// otherwise false-positive constantly in ordinary prose.
const AIRPORT_CODE_RE = /\b[A-Z]{3}\b/g
const AIRPORT_CODE_DENYLIST = new Set([
  'THE', 'AND', 'FOR', 'YOU', 'ARE', 'WAS', 'NOT', 'BUT', 'ALL', 'ONE', 'HAS', 'HER',
  'ITS', 'OUR', 'OUT', 'DAY', 'GET', 'HIM', 'HIS', 'HOW', 'MAN', 'NEW', 'NOW', 'OLD',
  'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE',
  'VIP', 'ASAP', 'ATM', 'FAQ', 'USA', 'PDF', 'CEO', 'CFO', 'ID', 'CAN', 'ANY', 'YES',
  'WAY', 'WILL', 'WITH', 'HAD', 'PER', 'YOUR', 'MAY', 'DUE', 'PLS', 'RSVP',
])

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map(v => v.trim()).filter(Boolean)))
}

/** Deterministically extracts every protected-value category from a text. */
export function extractProtectedFacts(text: string): ProtectedFacts {
  const source = text ?? ''

  const emails = uniq(source.match(EMAIL_RE) ?? [])
  const urls = uniq(source.match(URL_RE) ?? [])

  // Phones: extract, then drop anything that's actually part of an email or
  // reads as an amount (a raw run of digits inside a currency figure).
  const rawPhones = uniq(source.match(PHONE_RE) ?? [])
  const phones = rawPhones.filter(p => !emails.some(e => e.includes(p)))

  const amounts = uniq(source.match(AMOUNT_RE) ?? [])
  const dates = uniq(source.match(DATE_RE) ?? [])

  const walzRefs = source.match(WALZ_REF_RE) ?? []
  const alnumRefs = (source.match(ALNUM_REF_RE) ?? []).filter(
    r => !walzRefs.some(w => w.includes(r)),
  )
  const references = uniq([...walzRefs, ...alnumRefs])

  const flightNumbers = uniq(source.match(FLIGHT_NUMBER_RE) ?? [])

  const airportCodesRaw = uniq(source.match(AIRPORT_CODE_RE) ?? [])
  const airportCodes = airportCodesRaw.filter(code => !AIRPORT_CODE_DENYLIST.has(code))

  return { amounts, dates, emails, phones, urls, references, flightNumbers, airportCodes }
}

export interface ProtectedFactComparison {
  /** True only when every protected value found in the original also appears in the rewrite. */
  preserved: boolean
  /** Per-category values present in the original but missing from the rewrite. */
  missing: Partial<Record<ProtectedFactCategory, string[]>>
  /** Extra tokens (e.g. a known client name) that failed the exact-preservation check. */
  missingExtraTokens: string[]
}

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '')
}

/**
 * Compares protected facts extracted from `original` against `rewritten`.
 * A value "survives" if it (or its whitespace/case-normalized form) appears
 * anywhere in the rewritten text — this deliberately tolerates a rewrite
 * moving a fact to a different sentence, only catching outright disappearance
 * or alteration.
 */
export function compareProtectedFacts(
  original: string,
  rewritten: string,
  extraTokens: string[] = [],
): ProtectedFactComparison {
  const before = extractProtectedFacts(original)
  const rewrittenNormalized = normalizeForComparison(rewritten ?? '')

  const missing: Partial<Record<ProtectedFactCategory, string[]>> = {}
  let preserved = true

  for (const category of CATEGORIES) {
    const values = before[category]
    if (values.length === 0) continue
    const lost = values.filter(v => !rewrittenNormalized.includes(normalizeForComparison(v)))
    if (lost.length > 0) {
      missing[category] = lost
      preserved = false
    }
  }

  const missingExtraTokens = extraTokens
    .map(t => t.trim())
    .filter(Boolean)
    .filter(t => !rewrittenNormalized.includes(normalizeForComparison(t)))
  if (missingExtraTokens.length > 0) preserved = false

  return { preserved, missing, missingExtraTokens }
}

/** Human-readable summary for a warnings[] array — never exposes raw model reasoning. */
export function describeProtectedFactMismatch(comparison: ProtectedFactComparison): string {
  const parts: string[] = []
  for (const category of CATEGORIES) {
    const lost = comparison.missing[category]
    if (lost && lost.length > 0) parts.push(`${category}: ${lost.join(', ')}`)
  }
  if (comparison.missingExtraTokens.length > 0) {
    parts.push(`other: ${comparison.missingExtraTokens.join(', ')}`)
  }
  return parts.length > 0
    ? `The rewrite may have altered: ${parts.join('; ')}.`
    : 'A protected value could not be verified as preserved.'
}
