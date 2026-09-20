/**
 * V1.4 Jade Staff Communication Intelligence — content-safety scan for
 * AI-generated text before it is ever returned to the composer.
 *
 * Generalizes the one existing, working precedent for this in the codebase
 * — scanForCostLeakage() in app/api/admin/email/jade/route.ts — into a
 * shared module. That existing route is left completely untouched (per the
 * owner brief: don't modify unrelated existing endpoints as part of this
 * release); this is a new module V1.4's own endpoints import.
 *
 * Blocks two categories of unsafe AI-generated content before it reaches
 * staff:
 *  - cost/margin leakage: supplier cost, markup, margin, commission,
 *    wholesale, net rate, profit language that must never appear in
 *    client-facing text;
 *  - unsafe commercial promises: guaranteed visa approval/outcome language,
 *    fabricated statistics presented as guarantees, and confirmed-booking/
 *    confirmed-payment language a rewrite must never introduce on its own
 *    (per the zero-hallucination commercial rules — payment/booking status
 *    is authoritative system data, never something Jade may assert).
 */

export type ContentSafetyCategory = 'cost_leakage' | 'unsafe_promise'

export interface ContentSafetyFinding {
  category: ContentSafetyCategory
  pattern: string
}

export interface ContentSafetyResult {
  safe: boolean
  findings: ContentSafetyFinding[]
}

const COST_LEAKAGE_PATTERNS: RegExp[] = [
  /\bmargin\b/i,
  /\bmarkup\b/i,
  /\bcommission\b/i,
  /\bwholesale\b/i,
  /\bcost price\b/i,
  /\bnet rate\b/i,
  /\bprofit\b/i,
  /\bsupplier cost\b/i,
  /\bpartner net\b/i,
]

const UNSAFE_PROMISE_PATTERNS: RegExp[] = [
  /guaranteed.*visa/i,
  /visa.*guaranteed/i,
  /100%.*approval/i,
  /approval.*100%/i,
  /visa.*will be approved/i,
  /your (?:visa|application) (?:is|has been) approved/i,
  /your (?:payment|booking) (?:has been|is) (?:confirmed|received)\b/i,
]

/**
 * Scans AI-generated text for cost-leakage or unsafe-promise language.
 * Never trusts the model's own framing — this is a plain regex pass over
 * the final text the composer would receive.
 */
export function scanContentSafety(text: string): ContentSafetyResult {
  const source = text ?? ''
  const findings: ContentSafetyFinding[] = []

  for (const pattern of COST_LEAKAGE_PATTERNS) {
    if (pattern.test(source)) findings.push({ category: 'cost_leakage', pattern: pattern.source })
  }
  for (const pattern of UNSAFE_PROMISE_PATTERNS) {
    if (pattern.test(source)) findings.push({ category: 'unsafe_promise', pattern: pattern.source })
  }

  return { safe: findings.length === 0, findings }
}

/** Human-readable, staff-facing summary — never exposes the raw regex internals in UI copy. */
export function describeContentSafetyFinding(result: ContentSafetyResult): string {
  if (result.safe) return ''
  const hasCostLeakage = result.findings.some(f => f.category === 'cost_leakage')
  const hasUnsafePromise = result.findings.some(f => f.category === 'unsafe_promise')
  if (hasCostLeakage && hasUnsafePromise) {
    return 'Jade flagged internal pricing language and an unverified promise in this draft — it has not been shown.'
  }
  if (hasCostLeakage) return 'Jade flagged internal pricing/cost language in this draft — it has not been shown.'
  return 'Jade flagged an unverified guarantee or confirmation in this draft — it has not been shown.'
}
