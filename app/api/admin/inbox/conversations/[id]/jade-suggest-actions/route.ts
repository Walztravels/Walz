import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession, type AdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { buildConversationGrounding, renderGroundingBlock } from '@/lib/jade/assist/grounding'
import { buildFencedTranscript, sanitizeFenceMeta, type ConversationTurn } from '@/lib/jade/assist/context-fence'
import { redactPaymentSecrets } from '@/lib/jade/assist/pii-preflight'
import { callJadeModel } from '@/lib/jade/assist/model'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * V1.4 Jade Staff Communication Intelligence — Conversation Intelligence /
 * Suggested Actions (owner decisions 9, 10).
 *
 * THE MODEL MAY ONLY RETURN A STRUCTURED PROPOSAL. This route has no code
 * path that creates a quote, sends a payment request, sends a visa form, or
 * sends an itinerary request — it cannot, because none of those operations'
 * code is imported here. It returns a validated `actions[]` array; the
 * browser is responsible for mapping each `type` to the existing
 * openCreateQuote/openPaymentRequest/openVisaForm/openItineraryRequest
 * function and for making staff explicitly confirm ("Review & Start")
 * before that existing, already-identity-gated flow runs.
 *
 * The model NEVER returns a URL or route — only one of a fixed 5-value
 * enum, mapped to a known action by application code, never by anything
 * the model wrote.
 */

const ACTION_TYPES = ['CREATE_QUOTE', 'REQUEST_PAYMENT', 'VISA_FORM', 'ITINERARY_REQUEST', 'NONE'] as const
type ActionType = (typeof ACTION_TYPES)[number]

const MAX_ACTIONS = 3
const SUPPORTED_CURRENCIES = new Set(['USD', 'GBP', 'CAD', 'EUR', 'NGN'])

function parseConversationId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

function sanitizeString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLen)
}

function sanitizeInt(value: unknown, min: number, max: number): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return undefined
  const rounded = Math.round(n)
  if (rounded < min || rounded > max) return undefined
  return rounded
}

function sanitizeCurrency(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const upper = value.trim().toUpperCase()
  return SUPPORTED_CURRENCIES.has(upper) ? upper : undefined
}

/**
 * Allowlisted, per-type field validation. Unknown keys are always dropped —
 * this never passes an arbitrary model-supplied key through unvalidated.
 * REQUEST_PAYMENT deliberately has NO amount/currency field at all: the
 * model has nowhere to put a fabricated payment amount (owner decision 9's
 * "REQUEST_PAYMENT... must NOT create an amount").
 */
function sanitizeFields(type: ActionType, raw: unknown): Record<string, unknown> {
  const fields = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const out: Record<string, unknown> = {}

  if (type === 'CREATE_QUOTE') {
    const origin = sanitizeString(fields.origin, 100)
    const destination = sanitizeString(fields.destination, 100)
    const departureDate = sanitizeString(fields.departureDate, 40)
    const returnDate = sanitizeString(fields.returnDate, 40)
    const passengers = sanitizeInt(fields.passengers, 1, 20)
    const serviceType = sanitizeString(fields.serviceType, 40)
    const currency = sanitizeCurrency(fields.currency)
    if (origin) out.origin = origin
    if (destination) out.destination = destination
    if (departureDate) out.departureDate = departureDate
    if (returnDate) out.returnDate = returnDate
    if (passengers) out.passengers = passengers
    if (serviceType) out.serviceType = serviceType
    if (currency) out.currency = currency
  } else if (type === 'REQUEST_PAYMENT') {
    const purpose = sanitizeString(fields.purpose, 60)
    if (purpose) out.purpose = purpose
    // No amount/currency field exists in this schema — structurally impossible to populate.
  } else if (type === 'VISA_FORM') {
    const destinationCountry = sanitizeString(fields.destinationCountry, 60)
    const visaType = sanitizeString(fields.visaType, 60)
    if (destinationCountry) out.destinationCountry = destinationCountry
    if (visaType) out.visaType = visaType
  } else if (type === 'ITINERARY_REQUEST') {
    const destination = sanitizeString(fields.destination, 100)
    const departureDate = sanitizeString(fields.departureDate, 40)
    const returnDate = sanitizeString(fields.returnDate, 40)
    const travellers = sanitizeInt(fields.travellers, 1, 20)
    if (destination) out.destination = destination
    if (departureDate) out.departureDate = departureDate
    if (returnDate) out.returnDate = returnDate
    if (travellers) out.travellers = travellers
  }
  return out
}

const SUGGEST_ACTIONS_TOOL = {
  name: 'return_suggested_actions',
  description: 'Return 0-3 suggested next commercial actions based on the conversation. Never invent a price, availability, or confirmation — only propose an action type and any details explicitly mentioned by the client.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      actions: {
        type: 'array',
        maxItems: MAX_ACTIONS,
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [...ACTION_TYPES] },
            fields: { type: 'object' },
          },
          required: ['type'],
        },
      },
    },
    required: ['actions'],
  },
}

const SYSTEM_PROMPT_BASE = `You are Jade, helping a Walz Travels staff member spot actionable next steps in a client conversation. You do NOT take any action yourself — you only propose a small number of suggestions for the staff member to review.

Only propose an action when the conversation clearly indicates the client wants it. If nothing actionable is present, return an empty actions array (or a single NONE entry).

Never invent a price, FX rate, availability, or payment amount. Only extract details the client actually stated (e.g. a route and dates for CREATE_QUOTE) — never resolve a city name to an airport code yourself; leave that to the existing search flow. For REQUEST_PAYMENT, only extract a purpose (e.g. "deposit", "visa service") — never an amount.

Use the return_suggested_actions tool. Return AT MOST ${MAX_ACTIONS} actions.`

async function logSuggestActionsActivity(session: AdminSession, conversationId: number, actionCount: number) {
  try {
    await prisma.activityLog.create({
      data: {
        staffId: session.staffId ?? session.id,
        staffName: session.name,
        staffRole: session.role,
        action: 'jade_suggest_action',
        module: 'inbox',
        entityType: 'conversation',
        entityId: String(conversationId),
        detail: `suggestedCount=${actionCount}`,
      },
    })
  } catch (e) {
    console.warn('[jade-suggest-actions] activity log write failed:', e)
  }
}

interface RequestBody {
  recentMessages?: ConversationTurn[]
  channel?: string
  contactName?: string
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authz = checkInboxPermission(session, 'inbox_view')
  if (!authz.allowed) return NextResponse.json({ error: authz.error }, { status: authz.status })

  const convId = parseConversationId(params.id)
  if (!convId) return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })

  const access = await checkConversationAccess(session, params.id)
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status })

  const rl = rateLimit({ key: `jade-suggest-actions:${session.email}`, limit: 20, windowMs: 5 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, code: 'RATE_LIMITED', error: 'Too many Jade requests — please wait a moment and try again.' }, { status: 429 })
  }

  const groundingResult = await buildConversationGrounding(convId, session)
  if (!groundingResult.ok) {
    return NextResponse.json({ ok: false, code: 'CLIENT_IDENTITY_UNAVAILABLE', error: groundingResult.error }, { status: groundingResult.status })
  }
  const { grounding } = groundingResult

  const body = (await req.json().catch(() => ({}))) as RequestBody
  const rawTurns = Array.isArray(body.recentMessages) ? body.recentMessages : []
  const redactedTurns: ConversationTurn[] = rawTurns.map(t => ({
    role: t?.role === 'client' ? 'client' : 'agent',
    text: redactPaymentSecrets(String(t?.text ?? '')).text,
  }))
  const transcriptBlock = buildFencedTranscript(redactedTurns)
  const metaLine = [
    body.channel ? `Channel: ${sanitizeFenceMeta(body.channel).slice(0, 60)}` : null,
    body.contactName ? `Contact: ${sanitizeFenceMeta(body.contactName).slice(0, 120)}` : null,
  ].filter(Boolean).join(' · ')

  const systemPrompt = [SYSTEM_PROMPT_BASE, metaLine, renderGroundingBlock(grounding), transcriptBlock].filter(Boolean).join('\n\n')

  const result = await callJadeModel({
    operation: 'suggest_actions',
    systemPrompt,
    userMessage: 'Suggest actions now, if any are clearly indicated.',
    maxTokens: 500,
    tool: SUGGEST_ACTIONS_TOOL,
    generationId: `jade-suggest-actions:${convId}:${Date.now()}`,
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, code: result.code, error: result.message }, { status: 502 })
  }

  const rawActions = Array.isArray(result.toolInput?.actions) ? (result.toolInput!.actions as unknown[]) : []

  const actions = rawActions
    .slice(0, MAX_ACTIONS)
    .map(entry => {
      if (!entry || typeof entry !== 'object') return null
      const type = (entry as { type?: unknown }).type
      // Only a known enum value is ever accepted — anything else the model
      // returns (a URL, a route, an invented type) is silently discarded,
      // never surfaced to the UI and never actionable.
      if (typeof type !== 'string' || !(ACTION_TYPES as readonly string[]).includes(type)) return null
      if (type === 'NONE') return null
      const fields = sanitizeFields(type as ActionType, (entry as { fields?: unknown }).fields)
      return { type: type as ActionType, fields, requiresConfirmation: true as const }
    })
    .filter((a): a is { type: ActionType; fields: Record<string, unknown>; requiresConfirmation: true } => a !== null)

  await logSuggestActionsActivity(session, convId, actions.length)

  return NextResponse.json({
    ok: true,
    identityResolution: grounding.identity.resolution,
    actions,
  })
}
