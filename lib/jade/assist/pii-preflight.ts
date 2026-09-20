/**
 * V1.4 Jade Staff Communication Intelligence — conservative PII preflight
 * for conversation transcript text before it enters the model context
 * (owner decision 8).
 *
 * The audit found a real, existing gap: no Jade endpoint today redacts
 * anything from a Chatwoot transcript before it reaches an LLM prompt. This
 * module is intentionally narrow — it does NOT attempt broad PII redaction.
 * Ordinary travel information (dates, passport names, destinations, booking
 * references, phone numbers used as contact details) must reach the model
 * untouched, since Draft Reply/grounding need exactly that information to
 * be useful. The only things redacted are:
 *
 *  - payment card numbers: a run of 13-19 digits that passes the Luhn
 *    checksum. Luhn is a real algorithm, not "any long digit string" — an
 *    ordinary phone number or reference only satisfies it by rare
 *    coincidence, so this stays conservative by construction.
 *  - a CVV/security code: a standalone 3-4 digit number appearing close to
 *    the words "cvv"/"cvc"/"security code" — never a bare 3-4 digit number
 *    on its own (that would false-positive constantly on flight/gate/room
 *    numbers).
 *
 * This module only ever touches the COPY of transcript text assembled for
 * a V1.4 model call — never the stored Chatwoot message, never the
 * composer, and it is not retrofitted onto any existing (legacy) Jade
 * endpoint per the owner brief ("V1.4's new endpoints should simply be
 * safer than the legacy ones").
 */

export interface PiiPreflightResult {
  text: string
  redactedCount: number
  categories: Array<'card_number' | 'security_code'>
}

const CARD_CANDIDATE_RE = /\b(?:\d[ -]?){13,19}\b/g
const CVV_CONTEXT_RE = /\b(cvv2?|cvc2?|security code)\b/gi
const STANDALONE_3_4_DIGIT_RE = /\b\d{3,4}\b/g

function luhnCheck(digits: string): boolean {
  let sum = 0
  let shouldDouble = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (shouldDouble) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    shouldDouble = !shouldDouble
  }
  return sum % 10 === 0
}

/** Redacts Luhn-valid card numbers and contextually-flagged CVV-like codes. */
export function redactPaymentSecrets(text: string): PiiPreflightResult {
  const source = text ?? ''
  const categories = new Set<'card_number' | 'security_code'>()
  let redactedCount = 0

  // 1. Card numbers — Luhn-validated, not a bare digit-length heuristic.
  let result = source.replace(CARD_CANDIDATE_RE, match => {
    const digitsOnly = match.replace(/[ -]/g, '')
    if (digitsOnly.length < 13 || digitsOnly.length > 19) return match
    if (!luhnCheck(digitsOnly)) return match
    categories.add('card_number')
    redactedCount++
    return '[redacted: card number]'
  })

  // 2. CVV/security code — only when strongly contextual: a 3-4 digit
  // standalone number within ~25 characters of an explicit cvv/cvc/
  // "security code" mention. A bare 3-4 digit number elsewhere (a room
  // number, a gate number, a short reference) is left untouched.
  const cvvMentions: number[] = []
  let m: RegExpExecArray | null
  const cvvRe = new RegExp(CVV_CONTEXT_RE)
  while ((m = cvvRe.exec(result)) !== null) {
    cvvMentions.push(m.index)
  }

  if (cvvMentions.length > 0) {
    const WINDOW = 25
    result = result.replace(STANDALONE_3_4_DIGIT_RE, (match, offset: number) => {
      const nearMention = cvvMentions.some(idx => Math.abs(idx - offset) <= WINDOW)
      if (!nearMention) return match
      categories.add('security_code')
      redactedCount++
      return '[redacted: security code]'
    })
  }

  return { text: result, redactedCount, categories: Array.from(categories) }
}
