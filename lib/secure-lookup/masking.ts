/**
 * Secure Application Lookup — masking + deterministic normalization.
 *
 * Pure functions, no I/O. Shared by the staff flow, Jade chat, and the
 * (future) voice layer so every channel masks and normalizes identically.
 */

// ── Masking ───────────────────────────────────────────────────────────────────

/** "Olawale Smith" → "O****** S****" */
export function maskName(name: string | null | undefined): string {
  if (!name?.trim()) return 'Client on record'
  return name
    .trim()
    .split(/\s+/)
    .map(part => (part.length <= 1 ? part : part[0] + '*'.repeat(Math.max(4, part.length - 1))))
    .join(' ')
}

/** "olawale@gmail.com" → "o*****@gmail.com" */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email?.includes('@')) return null
  const [local, domain] = email.split('@')
  const head = local.slice(0, 1)
  return `${head}${'*'.repeat(Math.max(5, local.length - 1))}@${domain}`
}

/** "+12317902336" → "+1 *** *** 2336" */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return null
  const last4 = digits.slice(-4)
  const cc    = phone.trim().startsWith('+') ? `+${digits.slice(0, digits.length - 10) || digits.slice(0, 1)}` : ''
  return `${cc ? cc + ' ' : ''}*** *** ${last4}`
}

// ── Safe coarse status (pre-verification disclosure) ─────────────────────────

const SAFE_STATUS: Array<[RegExp, string]> = [
  [/^draft|^started|^collecting/i,                        'Application Received'],
  [/document.*(required|missing|pending)|awaiting_doc/i,  'Documents Required'],
  [/review|processing|checking/i,                         'Documents Under Review'],
  [/submitted|embassy|lodged/i,                           'Submitted'],
  [/approved|rejected|refused|decision/i,                 'Decision Received'],
  [/complete|closed|collected|delivered/i,                'Completed'],
]

/**
 * Map any internal status string to a coarse, client-safe label.
 * Never exposes decision contents ("approved"/"rejected" both map to
 * "Decision Received") or internal processing detail.
 */
export function safeStatusLabel(status: string | null | undefined): string {
  const s = (status ?? '').trim()
  for (const [re, label] of SAFE_STATUS) {
    if (re.test(s)) return label
  }
  return 'In Progress'
}

// ── Deterministic normalization (voice + typed answers) ──────────────────────

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
}

/**
 * "four eight two nine nine one" → "482991"; "482 991" → "482991".
 * Deterministic — no similarity matching.
 */
export function normalizeSpokenDigits(input: string): string {
  const tokens = input.toLowerCase().trim().split(/[\s,.-]+/).filter(Boolean)
  let out = ''
  for (const t of tokens) {
    if (/^\d+$/.test(t)) { out += t; continue }
    if (t in DIGIT_WORDS) { out += DIGIT_WORDS[t]; continue }
    // "double five" style
    // (unknown words are ignored rather than guessed)
  }
  return out
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
}

const ORDINAL_RE = /(\d{1,2})(st|nd|rd|th)?/

/**
 * Normalize a date answer to YYYY-MM-DD. Accepts:
 *   "1990-01-05", "05/01/1990" (day-first), "January 5 1990",
 *   "5 January 1990", "January fifth nineteen ninety" is NOT parsed —
 *   spelled-out years/days beyond ordinals are rejected (deterministic only).
 * Returns null when the input cannot be normalized unambiguously.
 */
export function normalizeDateAnswer(input: string): string | null {
  const s = input.trim().toLowerCase()
  // ISO
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  // Day-first numeric (dd/mm/yyyy or dd-mm-yyyy)
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  // "5 january 1990" or "january 5 1990" / with ordinals
  const words = s.replace(/,/g, ' ').split(/\s+/).filter(Boolean)
  let day: number | null = null, month: number | null = null, year: number | null = null
  for (const w of words) {
    if (w in MONTHS) { month = MONTHS[w]; continue }
    if (/^\d{4}$/.test(w)) { year = parseInt(w); continue }
    const ord = w.match(ORDINAL_RE)
    if (ord && parseInt(ord[1]) >= 1 && parseInt(ord[1]) <= 31 && day === null) { day = parseInt(ord[1]); continue }
  }
  if (day && month && year) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return null
}

/**
 * "A B one two" → "AB12"; "ab 12" → "AB12". Letters + digit words + digits,
 * uppercased, everything else stripped. Deterministic.
 */
export function normalizePassportSuffix(input: string): string {
  const tokens = input.toLowerCase().trim().split(/[\s,.-]+/).filter(Boolean)
  let out = ''
  for (const t of tokens) {
    if (/^[a-z0-9]+$/.test(t) && !(t in DIGIT_WORDS)) { out += t; continue }
    if (t in DIGIT_WORDS) { out += DIGIT_WORDS[t]; continue }
  }
  return out.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Free-text answers (destination, application type, email domain): lowercase, trim, strip punctuation. */
export function normalizeFreeText(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9@. ]/g, '').replace(/\s+/g, ' ')
}

/** Normalize a Walz reference: uppercase, tolerate missing prefix and stray spaces. */
export function normalizeWalzRef(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (!cleaned) return ''
  return cleaned.startsWith('WALZ-') ? cleaned : cleaned.startsWith('WALZ') ? `WALZ-${cleaned.slice(4)}` : `WALZ-${cleaned}`
}
