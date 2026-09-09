import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })
}

// Banned terms — cost-leakage scan
const BANNED_PATTERNS = [
  /margin/i,
  /markup/i,
  /commission/i,
  /wholesale/i,
  /cost price/i,
  /net rate/i,
  /profit/i,
  /guaranteed.*visa/i,
  /visa.*guaranteed/i,
  /100%.*approval/i,
  /approval.*100%/i,
]

function scanForCostLeakage(text: string): string | null {
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(text)) {
      return `Jade flagged a banned term matching: ${pattern.source}`
    }
  }
  return null
}

// ── POST /api/admin/email/jade ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    recipientName:  string
    recipientEmail: string
    purpose:        string
    context?:       string
    refType?:       string
    refId?:         string
    /** Subject already typed by staff — preserved by the plain-text fallback. */
    existingSubject?: string
  }

  if (!body.purpose) {
    return NextResponse.json({ error: 'purpose is required' }, { status: 400 })
  }

  // ── Fetch linked context data ──────────────────────────────────────────────
  let linkedContext = ''

  try {
    if (body.refId && body.refType) {
      if (body.refType === 'client') {
        const client = await prisma.user.findUnique({
          where:  { id: body.refId },
          select: {
            name:     true,
            email:    true,
            bookings: {
              take:    3,
              orderBy: { createdAt: 'desc' },
              select:  { bookingReference: true, type: true, status: true, createdAt: true },
            },
          },
        })
        if (client) {
          linkedContext = `Client: ${client.name} <${client.email}>. Recent bookings: ${
            client.bookings.map(b => `${b.type} (${b.status}, ref: ${b.bookingReference})`).join(', ') || 'None'
          }.`
        }
      } else if (body.refType === 'booking') {
        const booking = await prisma.booking.findUnique({
          where:  { id: body.refId },
          select: {
            bookingReference: true,
            type:             true,
            status:           true,
            contactEmail:     true,
            createdAt:        true,
          },
        })
        if (booking) {
          linkedContext = `Booking ref: ${booking.bookingReference}, type: ${booking.type}, status: ${booking.status}, contact: ${booking.contactEmail}.`
        }
      } else if (body.refType === 'supplier') {
        const supplier = await prisma.supplier.findUnique({
          where:  { id: body.refId },
          select: { name: true, type: true, email: true, contact: true },
        })
        if (supplier) {
          linkedContext = `Supplier: ${supplier.name} (${supplier.type}), email: ${supplier.email ?? supplier.contact ?? 'N/A'}.`
        }
      }
    }
  } catch (err) {
    console.error('[email/jade] linked context fetch error:', err)
    // Non-fatal — continue without linked context
  }

  const systemPrompt = `You are Jade, Walz Travels' AI assistant. Draft a professional email from Walz Travels staff to ${body.recipientName || 'the recipient'}.

Context provided: ${[linkedContext, body.context].filter(Boolean).join(' | ') || 'None'}

Hard rules:
- Never state costs, margins, commissions, or internal pricing.
- Never guarantee visa outcomes or approval rates.
- Never invent statistics or fabricate data.
- The body should be plain text, professional, warm tone appropriate for a premium travel agency.
- Do not add a signature — it will be appended automatically.
- Sign off as "Warm regards," with no name (the system adds the name).

Use the draft_email tool to return the finished draft.`

  const generationId = crypto.randomUUID()
  const model        = 'claude-sonnet-4-6'

  try {
    const anthropic = getAnthropic()
    // Structured output via a FORCED tool call: the model must invoke
    // draft_email with schema-conforming input, so the draft arrives as
    // real JSON — no text parsing on the happy path, and the browser never
    // parses arbitrary LLM output.
    const message   = await anthropic.messages.create({
      model,
      max_tokens: 1000,
      system:     systemPrompt,
      tools: [{
        name:        'draft_email',
        description: 'Return the finished email draft.',
        input_schema: {
          type: 'object' as const,
          properties: {
            subject: { type: 'string', description: 'Email subject line' },
            body:    { type: 'string', description: 'Plain-text email body' },
          },
          required: ['subject', 'body'],
        },
      }],
      tool_choice: { type: 'tool', name: 'draft_email' },
      messages:   [
        {
          role:    'user',
          content: `Purpose of this email: ${body.purpose}`,
        },
      ],
    })

    // ── Extract the draft: forced tool input first, text fallback second ─────
    const { parseJadeEmailDraft, validateDraftShape, JADE_DRAFT_FAILED_MESSAGE } =
      await import('@/lib/email/jade-draft-parse')

    let result: ReturnType<typeof validateDraftShape> | ReturnType<typeof parseJadeEmailDraft> | null = null
    let structuredOutputUsed = false

    const toolBlock = message.content.find(
      (b): b is Extract<typeof b, { type: 'tool_use' }> => b.type === 'tool_use' && b.name === 'draft_email',
    )
    if (toolBlock) {
      structuredOutputUsed = true
      result = validateDraftShape(toolBlock.input, 'structured_tool')
    }

    if (!result || !result.ok) {
      // Defensive path: the model answered in text (or the tool input was
      // unusable) — run the central normalizing parser.
      const raw = message.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('')
      result = parseJadeEmailDraft(raw, body.existingSubject)
    }

    if (!result.ok) {
      // Technical detail stays server-side; the admin UI gets friendly copy.
      console.error(`[email/jade] jadeEmailGenerationId=${generationId} model=${model} structuredOutputUsed=${structuredOutputUsed} parseStrategy=none validationResult=fail failureReason=${result.reason}`)
      return NextResponse.json({ error: JADE_DRAFT_FAILED_MESSAGE }, { status: 500 })
    }

    // Cost-leakage scan
    const leakage = scanForCostLeakage(result.body) ?? scanForCostLeakage(result.subject)
    if (leakage) {
      console.error(`[email/jade] jadeEmailGenerationId=${generationId} model=${model} structuredOutputUsed=${structuredOutputUsed} parseStrategy=${result.parseStrategy} validationResult=fail failureReason=cost_leakage`)
      return NextResponse.json({ error: leakage }, { status: 422 })
    }

    // Observability — lengths only, never full email bodies.
    console.log(`[email/jade] jadeEmailGenerationId=${generationId} model=${model} structuredOutputUsed=${structuredOutputUsed} parseStrategy=${result.parseStrategy} validationResult=ok subjectLen=${result.subject.length} bodyLen=${result.body.length}`)

    return NextResponse.json({ subject: result.subject, body: result.body })
  } catch (err) {
    console.error(`[email/jade] jadeEmailGenerationId=${generationId} model=${model} failureReason=provider_error`, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Jade failed to generate email. Please try again.' }, { status: 500 })
  }
}
