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

Output JSON only with this exact shape:
{ "subject": "...", "body": "..." }`

  try {
    const anthropic = getAnthropic()
    const message   = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1000,
      system:     systemPrompt,
      messages:   [
        {
          role:    'user',
          content: `Purpose of this email: ${body.purpose}`,
        },
      ],
    })

    const raw = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let parsed: { subject: string; body: string }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Jade returned invalid JSON', raw }, { status: 500 })
    }

    // Cost-leakage scan
    const leakage = scanForCostLeakage(parsed.body) ?? scanForCostLeakage(parsed.subject)
    if (leakage) {
      return NextResponse.json({ error: leakage }, { status: 422 })
    }

    return NextResponse.json({ subject: parsed.subject, body: parsed.body })
  } catch (err) {
    console.error('[email/jade POST]', err)
    return NextResponse.json({ error: 'Jade failed to generate email' }, { status: 500 })
  }
}
