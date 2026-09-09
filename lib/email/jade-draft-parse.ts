/**
 * Central parser for Jade email-draft responses.
 *
 * The production failure "Jade returned invalid JSON" happened because the
 * route did a single anchored fence-strip + JSON.parse: any prose around
 * the JSON, a fence not at position 0, or trailing commentary threw the
 * whole draft away. This parser accepts, in order of preference:
 *
 *   1. direct JSON                          → 'direct_json'
 *   2. JSON inside ```/```json fences       → 'fenced_json'
 *   3. a JSON object embedded in prose      → 'embedded_json'
 *      (balanced-brace scan with string/escape awareness — NOT regex
 *       extraction, so email content can never be silently truncated)
 *   4. usable plain text as the body        → 'plain_text'
 *      (subject = the staff's existing subject if any, otherwise left
 *       empty for staff — the parser never invents a subject)
 *
 * Only a genuinely empty/unusable response is rejected.
 */

export type JadeParseStrategy =
  | 'structured_tool'   // set by the route when the model's forced tool call succeeded
  | 'direct_json'
  | 'fenced_json'
  | 'embedded_json'
  | 'plain_text'

export type JadeDraftResult =
  | { ok: true; subject: string; body: string; parseStrategy: JadeParseStrategy }
  | { ok: false; reason: 'empty_response' | 'no_usable_content' }

interface CandidateShape { subject?: unknown; body?: unknown }

/** Validate a decoded object into a draft. Body must be a non-empty string;
 *  a missing/blank subject becomes '' (staff fills it in). */
export function validateDraftShape(
  candidate: unknown,
  strategy: JadeParseStrategy,
): JadeDraftResult | null {
  if (typeof candidate !== 'object' || candidate === null) return null
  const c = candidate as CandidateShape
  const body    = typeof c.body === 'string' ? c.body.trim() : ''
  const subject = typeof c.subject === 'string' ? c.subject.trim() : ''
  if (!body) return null
  return { ok: true, subject, body, parseStrategy: strategy }
}

/** Balanced-brace scan: extract the first complete top-level JSON object,
 *  respecting strings and escapes so braces inside content don't confuse it. */
function extractBalancedObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function tryParse(text: string): unknown | undefined {
  try { return JSON.parse(text) } catch { return undefined }
}

export function parseJadeEmailDraft(
  raw: string,
  existingSubject?: string,
): JadeDraftResult {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { ok: false, reason: 'empty_response' }

  // 1. Direct JSON
  const direct = tryParse(trimmed)
  if (direct !== undefined) {
    const v = validateDraftShape(direct, 'direct_json')
    if (v) return v
  }

  // 2. Fenced JSON — first ```...``` block anywhere in the response
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) {
    const inner = fenceMatch[1].trim()
    const fenced = tryParse(inner)
    if (fenced !== undefined) {
      const v = validateDraftShape(fenced, 'fenced_json')
      if (v) return v
    }
  }

  // 3. JSON object embedded in surrounding prose
  const embeddedText = extractBalancedObject(trimmed)
  if (embeddedText) {
    const embedded = tryParse(embeddedText)
    if (embedded !== undefined) {
      const v = validateDraftShape(embedded, 'embedded_json')
      if (v) return v
    }
  }

  // 4. Plain-text fallback — the model wrote a usable email without JSON.
  //    Strip a wrapping fence if the WHOLE response was fenced prose; use
  //    the text as the body. Never invent a subject: keep what staff typed,
  //    or leave it empty for staff to fill.
  let textBody = trimmed
  if (fenceMatch && fenceMatch[0].length >= trimmed.length * 0.9) {
    textBody = fenceMatch[1].trim()
  }
  // A bare JSON fragment / brace soup is not a usable email body.
  const looksLikeBrokenJson = /^[{[]/.test(textBody) && !/[.!?]\s/.test(textBody)
  if (textBody.length >= 20 && !looksLikeBrokenJson) {
    return {
      ok: true,
      subject: (existingSubject ?? '').trim(),
      body: textBody,
      parseStrategy: 'plain_text',
    }
  }

  return { ok: false, reason: 'no_usable_content' }
}

/** User-facing failure copy — technical detail stays in server logs. */
export const JADE_DRAFT_FAILED_MESSAGE =
  "Jade couldn't format this draft correctly. Please try again."
