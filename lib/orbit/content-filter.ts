/**
 * Orbit content filter — enforced in code, not in prompts.
 * Rejects any generated text containing legally restricted claims.
 * Each rule maps to a real incident where the claim had to be removed from walztravels.com.
 */

export interface FilterViolation {
  rule: string
  matched: string
  context: string
}

export interface FilterResult {
  passed: boolean
  violations: FilterViolation[]
}

const RULES: Array<{ rule: string; patterns: RegExp[] }> = [
  {
    rule: 'atol_claim',
    patterns: [
      /\bATOL\b/i,
      /ATOL\s+protected/i,
      /financially\s+protected/i,
    ],
  },
  {
    rule: 'iata_claim',
    patterns: [
      /IATA\s+certified/i,
      /IATA\s+accredited/i,
      /IATA\s+member/i,
    ],
  },
  {
    rule: 'visa_guarantee',
    patterns: [
      /guarantee[sd]?\s+(a\s+)?visa/i,
      /visa\s+guarantee[sd]?/i,
      /100\s*%\s*visa\s+(success|approval|guaranteed)/i,
      /guaranteed\s+visa\s+(approval|success)/i,
      /visa\s+approval\s+guaranteed/i,
      /your\s+visa\s+will\s+be\s+(approved|granted)/i,
    ],
  },
]

/**
 * Extracts a short context snippet (±40 chars) around the match position.
 */
function contextSnippet(text: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - 40)
  const end = Math.min(text.length, matchIndex + matchLength + 40)
  const snippet = text.slice(start, end)
  return (start > 0 ? '…' : '') + snippet + (end < text.length ? '…' : '')
}

/**
 * Run the content filter against a string.
 * Call this before displaying any AI-generated copy to a human reviewer.
 */
export function filterContent(text: string): FilterResult {
  const violations: FilterViolation[] = []

  for (const { rule, patterns } of RULES) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      const m = pattern.exec(text)
      if (m) {
        violations.push({
          rule,
          matched: m[0],
          context: contextSnippet(text, m.index, m[0].length),
        })
        break // one violation per rule is enough
      }
    }
  }

  return { passed: violations.length === 0, violations }
}

/**
 * Throws if the content fails the filter.
 * Use in API routes before returning generated content to the client.
 */
export function assertContentSafe(text: string): void {
  const result = filterContent(text)
  if (!result.passed) {
    const summary = result.violations.map(v => `[${v.rule}] "${v.matched}"`).join(', ')
    throw new Error(`Content filter blocked generation: ${summary}`)
  }
}
