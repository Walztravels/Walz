import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession, type AdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { buildConversationGrounding, renderGroundingBlock, type ConversationGrounding } from '@/lib/jade/assist/grounding'
import { buildFencedTranscript, sanitizeFenceMeta, type ConversationTurn } from '@/lib/jade/assist/context-fence'
import { redactPaymentSecrets } from '@/lib/jade/assist/pii-preflight'
import { compareProtectedFacts, describeProtectedFactMismatch } from '@/lib/jade/assist/protected-facts'
import { scanContentSafety, describeContentSafetyFinding } from '@/lib/jade/assist/content-safety-scan'
import { callJadeModel } from '@/lib/jade/assist/model'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * V1.4 Jade Staff Communication Intelligence — structured composer writing
 * assistance (owner decisions 1-19). A NEW, sibling endpoint to the
 * existing free-form /api/admin/jade/chat (which keeps serving
 * InboxJadeCopilot's "Ask Jade" experience unchanged) — this route's typed
 * operation/warnings/protectedFactsPreserved contract is structurally
 * incompatible with that route's freeform message/response shape, so it is
 * genuinely new rather than an extension.
 *
 * This route NEVER sends a message. It has no import of, and no code path
 * that can reach, the message-send handler — the only capability here is
 * "generate text and return it." Structural proof lives in
 * __tests__/jade-assist-no-auto-send.test.ts.
 */

const TEXT_OPERATIONS = ['fix_writing', 'professionalize', 'friendly', 'formal', 'shorten', 'clarify', 'translate', 'professional_translate'] as const
const CONTEXT_OPERATIONS = ['draft_reply', 'summarize'] as const
const ALL_OPERATIONS = [...TEXT_OPERATIONS, ...CONTEXT_OPERATIONS] as const

type TextOperation = (typeof TEXT_OPERATIONS)[number]
type ContextOperation = (typeof CONTEXT_OPERATIONS)[number]
type JadeOperation = (typeof ALL_OPERATIONS)[number]

const MAX_TEXT_CHARS = 8000
const MAX_STAFF_NOTE_CHARS = 1000
const MAX_LANGUAGE_CHARS = 40

function isJadeOperation(value: unknown): value is JadeOperation {
  return typeof value === 'string' && (ALL_OPERATIONS as readonly string[]).includes(value)
}
function isTextOperation(op: JadeOperation): op is TextOperation {
  return (TEXT_OPERATIONS as readonly string[]).includes(op)
}
function isContextOperation(op: JadeOperation): op is ContextOperation {
  return (CONTEXT_OPERATIONS as readonly string[]).includes(op)
}

function parseConversationId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

// ─── Auth/authz gate — mirrors the existing Client Action Centre convention ──

async function gate(params: { id: string }, session: AdminSession | null, requiredPermission: 'inbox_view' | 'inbox_reply') {
  if (!session) return { fail: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const
  const authz = checkInboxPermission(session, requiredPermission)
  if (!authz.allowed) return { fail: NextResponse.json({ error: authz.error }, { status: authz.status }) } as const
  const convId = parseConversationId(params.id)
  if (!convId) return { fail: NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 }) } as const
  const access = await checkConversationAccess(session, params.id)
  if (!access.allowed) return { fail: NextResponse.json({ error: access.error }, { status: access.status }) } as const
  return { convId } as const
}

// ─── Brand-voice base prompt, shared by every operation ─────────────────────

const BRAND_VOICE = `You are Jade, assisting a Walz Travels staff member with writing — you are NOT talking to the client yourself; everything you produce lands in a draft the staff member reviews before sending.

Voice: professional, warm, clear, concise, human, confident without overpromising, service-oriented, easy to read on WhatsApp/mobile. Avoid: robotic corporate jargon, excessive apologies, unnecessary paragraphs, fake enthusiasm, unnecessary emojis, overly casual slang, legalistic language unless the context requires it. Match length to the request's complexity — a simple question deserves a short reply, not a long one.

Hard rules, never violate these:
- Never state or imply supplier cost, margin, markup, commission, or any internal pricing figure.
- Never guarantee a visa outcome, approval, or processing time. Never assert a visa/application status unless explicitly given below as a system fact.
- Never assert that a payment or booking is confirmed/received unless explicitly given below as a system fact — if unconfirmed, say you'll verify it, never accuse the client of being wrong.
- Never invent a Walz policy, refund rule, cancellation term, deposit rule, or payment deadline not given to you explicitly.
- Never invent, guess, or fabricate a price, FX rate, availability, or booking reference.
- Preserve every name, date, time, amount, currency, email, phone number, URL, booking/quote/visa reference, and flight/airport code EXACTLY as given to you — do not "correct", reformat, or omit any of them.`

const OPERATION_INSTRUCTIONS: Record<TextOperation, (targetLanguage?: string) => string> = {
  fix_writing: () =>
    'TASK: Fix Writing. Correct spelling, punctuation, capitalization, and minor grammar in the text below. Preserve the original meaning, structure, tone, and length as closely as possible — this is a light correction, not a rewrite. Return only the corrected text.',
  professionalize: () =>
    'TASK: Make Professional. Rewrite the text below to sound professional and polished, like an experienced human travel consultant — not a generic corporate email. Remove slang. Improve clarity. Do not pad the response with unnecessary length. Return only the rewritten text.',
  friendly: () =>
    'TASK: Make Friendlier. Rewrite the text below to sound warmer and friendlier while remaining professional. Return only the rewritten text.',
  formal: () =>
    'TASK: More Formal. Rewrite the text below in a more formal register suitable for a premium travel agency. Return only the rewritten text.',
  shorten: () =>
    'TASK: Shorten. Shorten the text below while preserving every critical fact, instruction, and protected value the client needs. Return only the shortened text.',
  clarify: () =>
    'TASK: Explain Clearly. Rewrite the text below to be clearer and easier to understand, without inventing any fact not already present in it. Return only the rewritten text.',
  translate: (lang) =>
    `TASK: Translate. Translate the text below into ${lang}. Preserve names, dates, amounts, currency codes, references, and URLs EXACTLY as given — never translate, reformat, or alter them. Return only the translated text.`,
  professional_translate: (lang) =>
    `TASK: Professional Translation. Translate the text below into ${lang} AND make the wording professional and client-appropriate for a premium travel agency, in that language. Preserve names, dates, amounts, currency codes, references, and URLs EXACTLY as given. Return only the translated text.`,
}

const DRAFT_REPLY_INSTRUCTION =
  'TASK: Draft Reply. Read the authoritative system facts and the conversation transcript below, then draft a reply the staff member can review and send. Ground every claim in the authoritative system facts, never in the transcript alone. If the client claims something (e.g. "I already paid") that conflicts with an authoritative fact, acknowledge them warmly without accusing them of being wrong, and say the team will verify — never assert the client\'s claim as true and never assert the authoritative fact bluntly as a correction. If no authoritative fact answers the client\'s question, say you will check and get back to them rather than guessing. Return only the drafted reply.'

const SUMMARIZE_INSTRUCTION =
  'TASK: Summarize Conversation. This summary is for STAFF EYES ONLY — it will never be sent to the client. Read the authoritative system facts and the conversation transcript below, then produce a structured summary with these exact section headers: "Client wants", "Current status", "Outstanding items", "Important dates", "Commercial state", "Last action", "Suggested next step". Clearly distinguish what the client claimed from what the authoritative system facts confirm — never blend the two into one statement. Do not invent anything not present in the facts or transcript.'

// ─── Structured output contract — one forced tool schema for every operation ─

const SUGGESTION_TOOL = {
  name: 'return_suggestion',
  description: 'Return the finished text.',
  inputSchema: {
    type: 'object' as const,
    properties: { suggestion: { type: 'string', description: 'The finished text, nothing else.' } },
    required: ['suggestion'],
  },
}

const MAX_TOKENS_BY_OPERATION: Record<JadeOperation, number> = {
  fix_writing: 600, professionalize: 800, friendly: 700, formal: 700, shorten: 500, clarify: 800,
  translate: 900, professional_translate: 900, draft_reply: 900, summarize: 900,
}

const ACTIVITY_LOG_ACTION: Record<JadeOperation, string> = {
  fix_writing: 'jade_fix_writing',
  professionalize: 'jade_professionalize',
  friendly: 'jade_tone_transform',
  formal: 'jade_tone_transform',
  shorten: 'jade_fix_writing',
  clarify: 'jade_fix_writing',
  translate: 'jade_translate',
  professional_translate: 'jade_translate',
  draft_reply: 'jade_draft_reply',
  summarize: 'jade_summarize',
}

async function logJadeActivity(fields: {
  session: AdminSession
  conversationId: number
  operation: JadeOperation
  status: 'ok' | 'blocked' | 'failed'
  latencyMs?: number
  model?: string
}) {
  try {
    await prisma.activityLog.create({
      data: {
        staffId: fields.session.staffId ?? fields.session.id,
        staffName: fields.session.name,
        staffRole: fields.session.role,
        action: ACTIVITY_LOG_ACTION[fields.operation],
        module: 'inbox',
        entityType: 'conversation',
        entityId: String(fields.conversationId),
        // Metadata only — never raw prompts, transcript, draft text, or model reasoning.
        detail: `operation=${fields.operation} status=${fields.status}${fields.model ? ` model=${fields.model}` : ''}${fields.latencyMs !== undefined ? ` latencyMs=${fields.latencyMs}` : ''}`,
      },
    })
  } catch (e) {
    console.warn('[jade-assist] activity log write failed:', e)
  }
}

// ─── Request/response types ──────────────────────────────────────────────────

interface JadeAssistRequestBody {
  operation?: string
  text?: string
  targetLanguage?: string
  staffNote?: string
  recentMessages?: ConversationTurn[]
  channel?: string
  contactName?: string
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  const rawOperation = (await req.json().catch(() => ({}))) as JadeAssistRequestBody
  const operation = rawOperation.operation

  // Summarize is read-only staff intelligence (never touches the composer or
  // sends anything) — gated on inbox_view, the least-privilege read
  // permission. Every text/draft operation requires inbox_reply, matching
  // the owner brief: "staff who can legitimately reply... should generally
  // be able to use writing assistance."
  const requiredPermission = operation === 'summarize' ? 'inbox_view' : 'inbox_reply'
  const g = await gate(params, session, requiredPermission)
  if ('fail' in g) return g.fail
  const { convId } = g
  // session is non-null here — gate() already returned 401 above otherwise.
  const staffSession = session as AdminSession

  const rl = rateLimit({ key: `jade-assist:${staffSession.email}`, limit: 30, windowMs: 5 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, code: 'RATE_LIMITED', error: 'Too many Jade requests — please wait a moment and try again.' }, { status: 429 })
  }

  if (!isJadeOperation(operation)) {
    return NextResponse.json({ ok: false, code: 'INVALID_OPERATION', error: 'Unknown Jade operation.' }, { status: 400 })
  }

  const body = rawOperation

  // ── Validate input shape per operation category ────────────────────────
  if (isTextOperation(operation)) {
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) {
      return NextResponse.json({ ok: false, code: 'EMPTY_INPUT', error: 'There is no text to work with.' }, { status: 400 })
    }
    if (text.length > MAX_TEXT_CHARS) {
      return NextResponse.json({ ok: false, code: 'INPUT_TOO_LONG', error: 'That text is too long for Jade to process at once.' }, { status: 413 })
    }
    if ((operation === 'translate' || operation === 'professional_translate')) {
      const lang = typeof body.targetLanguage === 'string' ? body.targetLanguage.trim() : ''
      if (!lang || lang.length > MAX_LANGUAGE_CHARS) {
        return NextResponse.json({ ok: false, code: 'INVALID_LANGUAGE', error: 'A target language is required.' }, { status: 400 })
      }
    }
    return handleTextOperation(operation, text, body, staffSession, convId)
  }

  // Context operations (draft_reply, summarize)
  return handleContextOperation(operation, body, staffSession, convId)
}

async function handleTextOperation(
  operation: TextOperation,
  text: string,
  body: JadeAssistRequestBody,
  session: AdminSession,
  convId: number,
): Promise<NextResponse> {
  const targetLanguage = typeof body.targetLanguage === 'string' ? body.targetLanguage.trim().slice(0, MAX_LANGUAGE_CHARS) : undefined
  const instruction = OPERATION_INSTRUCTIONS[operation](targetLanguage)
  const systemPrompt = `${BRAND_VOICE}\n\n${instruction}`

  const result = await runOnce(operation, systemPrompt, text, convId)
  if (!result.ok) {
    await logJadeActivity({ session, conversationId: convId, operation, status: 'failed' })
    return NextResponse.json({ ok: false, code: result.code, error: result.error }, { status: result.status })
  }

  // Deterministic protected-fact preservation check (owner decision 7,
  // release-blocking). One retry with a stricter instruction before
  // rejecting outright — never silently accept an altered result.
  let comparison = compareProtectedFacts(text, result.suggestion)
  let finalSuggestion = result.suggestion
  let finalModel = result.model

  if (!comparison.preserved) {
    const retryPrompt = `${systemPrompt}\n\nIMPORTANT: your previous attempt changed a protected value. ${describeProtectedFactMismatch(comparison)} Regenerate, preserving every one of these values EXACTLY as given in the original text.`
    const retry = await runOnce(operation, retryPrompt, text, convId)
    if (retry.ok) {
      const retryComparison = compareProtectedFacts(text, retry.suggestion)
      if (retryComparison.preserved) {
        finalSuggestion = retry.suggestion
        finalModel = retry.model
        comparison = retryComparison
      } else {
        await logJadeActivity({ session, conversationId: convId, operation, status: 'blocked' })
        return NextResponse.json(
          { ok: false, code: 'PROTECTED_FACT_MISMATCH', error: describeProtectedFactMismatch(retryComparison) },
          { status: 422 },
        )
      }
    } else {
      await logJadeActivity({ session, conversationId: convId, operation, status: 'blocked' })
      return NextResponse.json({ ok: false, code: 'PROTECTED_FACT_MISMATCH', error: describeProtectedFactMismatch(comparison) }, { status: 422 })
    }
  }

  const safety = scanContentSafety(finalSuggestion)
  if (!safety.safe) {
    await logJadeActivity({ session, conversationId: convId, operation, status: 'blocked' })
    return NextResponse.json({ ok: false, code: 'CONTENT_SAFETY_BLOCKED', error: describeContentSafetyFinding(safety) }, { status: 422 })
  }

  await logJadeActivity({ session, conversationId: convId, operation, status: 'ok', model: finalModel })
  return NextResponse.json({
    ok: true,
    suggestion: finalSuggestion,
    operation,
    warnings: [],
    protectedFactsPreserved: true,
  })
}

async function handleContextOperation(
  operation: ContextOperation,
  body: JadeAssistRequestBody,
  session: AdminSession,
  convId: number,
): Promise<NextResponse> {
  const groundingResult = await buildConversationGrounding(convId, session)
  if (!groundingResult.ok) {
    return NextResponse.json({ ok: false, code: 'CLIENT_IDENTITY_UNAVAILABLE', error: groundingResult.error }, { status: groundingResult.status })
  }
  const grounding = groundingResult.grounding

  const staffNote = typeof body.staffNote === 'string' ? body.staffNote.trim().slice(0, MAX_STAFF_NOTE_CHARS) : ''
  const rawTurns = Array.isArray(body.recentMessages) ? body.recentMessages : []
  // PII preflight — redact card numbers / contextual CVV before this
  // untrusted transcript ever enters a model prompt (owner decision 8).
  // Ordinary travel info (dates, names, references) is untouched.
  const redactedTurns: ConversationTurn[] = rawTurns.map(t => ({
    role: t?.role === 'client' ? 'client' : 'agent',
    text: redactPaymentSecrets(String(t?.text ?? '')).text,
  }))
  const transcriptBlock = buildFencedTranscript(redactedTurns)

  const groundingBlock = renderGroundingBlock(grounding)
  const metaLine = [
    body.channel ? `Channel: ${sanitizeFenceMeta(body.channel).slice(0, 60)}` : null,
    body.contactName ? `Contact: ${sanitizeFenceMeta(body.contactName).slice(0, 120)}` : null,
  ].filter(Boolean).join(' · ')

  const staffContextBlock = staffNote
    ? `STAFF CONTEXT (an instruction from the staff member for THIS request only — not a system fact, not something the client said):\n${sanitizeFenceMeta(staffNote)}`
    : ''

  const instruction = operation === 'draft_reply' ? DRAFT_REPLY_INSTRUCTION : SUMMARIZE_INSTRUCTION
  const systemPrompt = [
    BRAND_VOICE, instruction, metaLine, groundingBlock, transcriptBlock, staffContextBlock,
  ].filter(Boolean).join('\n\n')

  const userMessage = operation === 'draft_reply' ? 'Draft the reply now.' : 'Produce the summary now.'

  const result = await runOnce(operation, systemPrompt, userMessage, convId)
  if (!result.ok) {
    await logJadeActivity({ session, conversationId: convId, operation, status: 'failed' })
    return NextResponse.json({ ok: false, code: result.code, error: result.error }, { status: result.status })
  }

  const safety = scanContentSafety(result.suggestion)
  if (!safety.safe) {
    await logJadeActivity({ session, conversationId: convId, operation, status: 'blocked' })
    return NextResponse.json({ ok: false, code: 'CONTENT_SAFETY_BLOCKED', error: describeContentSafetyFinding(safety) }, { status: 422 })
  }

  await logJadeActivity({ session, conversationId: convId, operation, status: 'ok', model: result.model })
  return NextResponse.json({
    ok: true,
    suggestion: result.suggestion,
    operation,
    warnings: [],
    grounding: buildGroundingMeta(grounding),
  })
}

function buildGroundingMeta(grounding: ConversationGrounding) {
  return {
    usedConversation: true,
    usedClientContext: grounding.identity.resolution === 'VERIFIED' || grounding.identity.resolution === 'LINKED',
    usedQuoteState: grounding.quote.exists,
    usedPaymentState: grounding.payment.exists,
    usedVisaState: grounding.visa.exists,
    usedItineraryState: grounding.itineraryRequest.exists,
  }
}

type RunOnceResult =
  | { ok: true; suggestion: string; model: string }
  | { ok: false; code: string; error: string; status: number }

async function runOnce(operation: JadeOperation, systemPrompt: string, userMessage: string, convId: number): Promise<RunOnceResult> {
  const result = await callJadeModel({
    operation,
    systemPrompt,
    userMessage,
    maxTokens: MAX_TOKENS_BY_OPERATION[operation],
    tool: SUGGESTION_TOOL,
    generationId: `jade-assist:${convId}:${operation}:${Date.now()}`,
  })
  if (!result.ok) {
    return { ok: false, code: result.code, error: result.message, status: 502 }
  }
  const suggestion = typeof result.toolInput?.suggestion === 'string' ? result.toolInput.suggestion.trim() : ''
  if (!suggestion) {
    return { ok: false, code: 'MODEL_EMPTY_OUTPUT', error: 'Jade returned an empty response. Please try again.', status: 502 }
  }
  return { ok: true, suggestion, model: result.model }
}
