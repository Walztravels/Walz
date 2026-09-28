/**
 * Staff Performance Management — Jade assistance (mission brief §6).
 *
 * Jade may help DRAFT, REWRITE, SHORTEN, or SUMMARIZE text. Architectural
 * guarantees (not just prompt instructions):
 *
 *   1. Jade receives PROTECTED FACTS (employee identity, dates, sales
 *      counts, revenue figures, warning history, review period, employment
 *      status) as a separate, read-only, structured block from any
 *      free-form instruction — never mixed into one string Jade could
 *      reinterpret.
 *   2. The caller (the API route) NEVER writes Jade's output into the
 *      protected snapshot columns on StaffPerformanceDocument
 *      (employeeNameSnapshot, salesInPeriod, lastSaleDate,
 *      reviewPeriodStart/End, warningHistorySummary, reviewDate,
 *      pipDurationDays). Jade's output can only ever land in
 *      `draftContent` (free text), and only while the document is still
 *      DRAFT.
 *   3. This module exposes no action that sends, approves, issues,
 *      changes a performance record, selects a disciplinary action,
 *      terminates staff, or schedules a consequence — those verbs simply
 *      do not exist as Jade actions anywhere in this codebase. Every one
 *      of those steps requires an explicit, separate Super Admin action
 *      in the API layer.
 *   4. A lightweight post-hoc check (`verifyProtectedFactsPresent`) flags
 *      (never blocks) if Jade's rewritten text appears to have dropped a
 *      protected fact, so a Super Admin can catch it before approving.
 *
 * Follows the same forced-tool-use pattern as the existing, non-forbidden
 * admin Jade assistant in app/api/admin/email/jade/route.ts.
 */

import Anthropic from '@anthropic-ai/sdk'

export type JadeAssistAction =
  | 'DRAFT_WARNING'
  | 'REWRITE_PROFESSIONALLY'
  | 'MAKE_CONCISE'
  | 'CREATE_IMPROVEMENT_PLAN'
  | 'SUMMARIZE_EVIDENCE'

export interface ProtectedFacts {
  employeeName: string
  jobTitle: string
  department: string
  employmentStatus: string
  warningType: string
  reviewPeriodStart: string // ISO date, pre-formatted, read-only to Jade
  reviewPeriodEnd: string
  salesInPeriod: number
  lastSaleDate: string | null
  reviewDate: string
  warningHistorySummary: string
}

interface JadeAssistInput {
  action: JadeAssistAction
  facts: ProtectedFacts
  /** Current editable draft text, if rewriting/shortening an existing draft. */
  currentDraftText?: string
  /** Free-form instruction from the Super Admin — never mixed with facts. */
  instruction?: string
}

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })
}

const ACTION_INSTRUCTION: Record<JadeAssistAction, string> = {
  DRAFT_WARNING:
    'Draft a professional, factual performance warning letter using ONLY the protected facts provided. Do not invent any figures, dates, or accusations. Do not claim misconduct — this is a performance matter only.',
  REWRITE_PROFESSIONALLY:
    'Rewrite the provided draft in a more professional, measured tone. Preserve every fact, figure, and date exactly as given — do not change, round, or omit any of them.',
  MAKE_CONCISE:
    'Shorten the provided draft while preserving every protected fact, figure, and date exactly as given. Remove redundancy, not substance.',
  CREATE_IMPROVEMENT_PLAN:
    'Write a clear, supportive Performance Improvement Plan section describing the improvement required, support available, and the review date. Do not alter any protected fact.',
  SUMMARIZE_EVIDENCE:
    'Summarize the performance evidence in 3-5 short, neutral, factual bullet points for a Super Admin reviewing this case. Do not recommend a disciplinary outcome.',
}

export interface JadeAssistResult {
  ok: true
  text: string
  factsCheck: { ok: boolean; missing: string[] }
}
export interface JadeAssistError {
  ok: false
  error: string
  /** True specifically when blocked by checkForDisciplinaryRecommendation
   *  (the deterministic HR-output guard) rather than a provider/generation
   *  failure — callers use this to log distinct, content-free audit
   *  metadata and to give the Super Admin a clearer message. */
  blocked?: boolean
}

/** Loose, non-blocking check that Jade's output still contains the key
 *  protected facts as text — surfaced to the Super Admin as a warning,
 *  never used to silently mutate or reject the output. */
export function verifyProtectedFactsPresent(text: string, facts: ProtectedFacts): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  if (!text.includes(String(facts.salesInPeriod))) missing.push('sales count')
  if (facts.lastSaleDate) {
    const d = new Date(facts.lastSaleDate)
    const year = String(d.getFullYear())
    if (!text.includes(year)) missing.push('last sale date')
  }
  if (!text.toLowerCase().includes(facts.employeeName.split(' ')[0].toLowerCase())) missing.push('employee name')
  return { ok: missing.length === 0, missing }
}

/**
 * Deterministic, code-level HR-output guard (mission remediation P2, then
 * hardened after independent review found concrete bypasses/false
 * positives in the first version — see the four checks below). This is IN
 * ADDITION TO the system prompt's own "never recommend a disciplinary
 * outcome" instruction above — a prompt instruction is a request to the
 * model, not an enforced guarantee, so this re-checks the actual output
 * before it is ever returned to the client.
 *
 * A naive substring filter on words like "terminate"/"suspend" would also
 * block entirely standard, legitimate HR boilerplate such as "failure to
 * improve may result in further management action up to and including
 * termination of employment" — exactly the kind of neutral, conditional
 * language a real warning letter is expected to contain. So a sentence is
 * flagged only when it contains a disciplinary-outcome keyword AND is not
 * otherwise excused by one of two checks, IN THIS ORDER:
 *
 *   1. EXPLICIT_RECOMMENDATION always overrides everything else — "I
 *      recommend termination" is a decision regardless of any hedge word
 *      also present elsewhere in the same sentence (the first version's
 *      per-sentence NEUTRAL_FRAMING check could be defeated by attaching
 *      an explicit recommendation to a hedge: "...this may lead to
 *      termination, which I formally recommend" used to slip through).
 *   2. NEGATION excuses a sentence that explicitly denies or factually
 *      references an outcome without recommending it ("does not
 *      constitute disciplinary action such as suspension", "no dismissal
 *      followed") — the first version blocked these as false positives.
 *   3. Otherwise, NEUTRAL_FRAMING excuses genuinely hedged/conditional
 *      language ("may result in ... up to and including termination").
 *   4. Anything left (a bare keyword with no recommendation override, no
 *      negation, no framing) is flagged.
 *
 * Known, accepted residual limitation: this is keyword-based, not
 * semantic. Plain-English synonyms outside DISCIPLINARY_KEYWORDS (e.g.
 * "employment should be ended", "let this employee go") are not caught —
 * catching arbitrary phrasing would require real language understanding,
 * not a regex. The system prompt instruction remains the primary defense
 * against novel phrasing; this guard is a deterministic backstop for the
 * specific outcomes the mission brief names (termination, dismissal,
 * firing, suspension, demotion, disciplinary escalation).
 */
const DISCIPLINARY_KEYWORDS =
  /\b(terminat(?:e|ed|es|ing|ion)|dismiss(?:ed|es|ing|al)?|fir(?:e|ed|es|ing)|suspen(?:d(?:ed|ing|s)?|sion)|demot(?:e|ed|es|ing|ion)|disciplinary escalation|punitive)\b/i

const NEUTRAL_FRAMING =
  /\b(may (?:result in|lead to|involve|include)|could (?:result in|lead to)|management (?:may|could|might) consider|further management action|up to and including|if (?:performance|improvement) (?:does not|is not))\b/i

// "I recommend...", "we advise...", "my recommendation is...", etc. — an
// explicit recommendation marker is never neutral, no matter what hedge
// words also appear in the same sentence. Allows up to 3 words between
// the pronoun and the verb ("I would strongly recommend").
const EXPLICIT_RECOMMENDATION =
  /\b(?:I|we)\b(?:\s+\S+){0,3}\s+(?:recommend|propose|advise|suggest)\b|\brecommend(?:ation)?\s+(?:is|that)\b|\bmy recommendation is\b/i

// An explicit denial or purely factual/historical reference to an outcome
// — "does not constitute ... suspension", "no dismissal followed" — is
// not a recommendation. Checked only when EXPLICIT_RECOMMENDATION does
// NOT also match, so a hedge-plus-negation cannot be used to smuggle an
// actual recommendation past the guard.
const NEGATION = /\b(?:not|never|no|does not|did not|without|no longer)\b/i

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function isDisciplinaryRecommendation(sentence: string): boolean {
  if (!DISCIPLINARY_KEYWORDS.test(sentence)) return false
  if (EXPLICIT_RECOMMENDATION.test(sentence)) return true
  if (NEGATION.test(sentence)) return false
  if (NEUTRAL_FRAMING.test(sentence)) return false
  return true
}

export interface DisciplinaryGuardResult {
  ok: boolean
  /** Count only — the actual flagged sentence text is never persisted to
   *  logs/history, per "log metadata about the validation failure without
   *  logging unnecessary sensitive HR content". */
  flaggedCount: number
}

export function checkForDisciplinaryRecommendation(text: string): DisciplinaryGuardResult {
  const flaggedCount = splitSentences(text).filter(isDisciplinaryRecommendation).length
  return { ok: flaggedCount === 0, flaggedCount }
}

export async function callJadeAssist(input: JadeAssistInput): Promise<JadeAssistResult | JadeAssistError> {
  const { action, facts, currentDraftText, instruction } = input

  const systemPrompt = `You are Jade, Walz Travels' AI assistant, helping a Super Admin with a CONFIDENTIAL staff performance document.

PROTECTED FACTS (read-only — you must never change, invent, round, or omit any of these; they are supplied for context only):
${JSON.stringify(facts, null, 2)}

Hard rules:
- You NEVER decide, recommend, or imply a disciplinary outcome, termination, or "further management action" beyond what is already stated in the current draft.
- You NEVER make unsupported accusations or claim misconduct — this is a sales-performance matter only.
- You NEVER change any protected fact above (names, dates, sales counts, review period, employment status).
- Output plain text only, in professional British English business letter style, using paragraph breaks ("\\n\\n") between paragraphs.

Task: ${ACTION_INSTRUCTION[action]}`

  const userParts: string[] = []
  if (currentDraftText) userParts.push(`Current draft:\n${currentDraftText}`)
  if (instruction) userParts.push(`Additional instruction from the Super Admin: ${instruction}`)
  if (userParts.length === 0) userParts.push('Produce the requested content from the protected facts above.')

  try {
    const anthropic = getAnthropic()
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      tools: [
        {
          name: 'return_text',
          description: 'Return the finished text.',
          input_schema: {
            type: 'object' as const,
            properties: { text: { type: 'string', description: 'The finished plain-text content.' } },
            required: ['text'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'return_text' },
      messages: [{ role: 'user', content: userParts.join('\n\n') }],
    })

    const toolBlock = message.content.find(
      (b): b is Extract<typeof b, { type: 'tool_use' }> => b.type === 'tool_use' && b.name === 'return_text',
    )
    const text =
      toolBlock && typeof (toolBlock.input as { text?: unknown }).text === 'string'
        ? (toolBlock.input as { text: string }).text
        : message.content
            .filter((b) => b.type === 'text')
            .map((b) => (b as { type: 'text'; text: string }).text)
            .join('')

    if (!text || !text.trim()) {
      return { ok: false, error: 'Jade returned an empty response. Please try again.' }
    }

    const trimmed = text.trim()

    // Deterministic guard, code-level, separate from the system prompt
    // above. A blocked draft is never returned to the caller — the Super
    // Admin sees only the block message, never the flagged text, and must
    // regenerate or write the section manually.
    const disciplinaryCheck = checkForDisciplinaryRecommendation(trimmed)
    if (!disciplinaryCheck.ok) {
      return {
        ok: false,
        blocked: true,
        error:
          "Jade's draft appeared to independently recommend or imply a disciplinary decision (e.g. termination, suspension, dismissal), which Jade is not permitted to do. Please regenerate, or write this section manually.",
      }
    }

    return { ok: true, text: trimmed, factsCheck: verifyProtectedFactsPresent(trimmed, facts) }
  } catch (err) {
    console.error('[performance/jade] provider error:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'Jade failed to generate a response. Please try again.' }
  }
}
