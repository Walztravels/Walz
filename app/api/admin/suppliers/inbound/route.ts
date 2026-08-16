import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

// Resend posts inbound email payloads here.
// Protect with a secret token in the URL: ?secret=RESEND_INBOUND_SECRET
// Set that env variable in Vercel and match it in the Resend inbound route config.

interface ResendInboundEmail {
  from?: string
  to?:   string | string[]
  subject?: string
  text?: string
  html?: string
  headers?: Array<{ name: string; value: string }> | Record<string, string>
}

interface ResendWebhookPayload {
  type?: string
  data?: ResendInboundEmail
  // Some versions send fields at the top level
  from?: string
  to?:   string | string[]
  subject?: string
  text?: string
  headers?: Array<{ name: string; value: string }> | Record<string, string>
}

function extractHeader(
  headers: Array<{ name: string; value: string }> | Record<string, string> | undefined,
  name: string,
): string | null {
  if (!headers) return null
  const lower = name.toLowerCase()
  if (Array.isArray(headers)) {
    return headers.find(h => h.name.toLowerCase() === lower)?.value ?? null
  }
  return headers[lower] ?? headers[name] ?? null
}

function stripAngleBrackets(s: string | null): string | null {
  if (!s) return null
  return s.replace(/^<|>$/g, '').trim() || null
}

export async function POST(req: NextRequest) {
  // ── Verify secret token ───────────────────────────────────────────────────
  const secret = process.env.RESEND_INBOUND_SECRET
  if (secret) {
    const provided = req.nextUrl.searchParams.get('secret')
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let payload: ResendWebhookPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Normalise: Resend wraps in { type, data } but some versions send flat
  const email: ResendInboundEmail = payload.data ?? payload

  const fromRaw  = email.from ?? ''
  const subject  = email.subject ?? '(no subject)'
  const textBody = email.text ?? ''
  const headers  = email.headers

  // Extract sender email
  const fromEmail = fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw.trim()
  if (!fromEmail || !fromEmail.includes('@')) {
    return NextResponse.json({ ok: false, reason: 'no from email' })
  }

  // Extract In-Reply-To to match against stored resendMessageId
  const inReplyToRaw = extractHeader(headers, 'In-Reply-To')
  const inReplyTo    = stripAngleBrackets(inReplyToRaw)

  // ── Find the message to update ────────────────────────────────────────────
  let message: { id: string; supplierId: string } | null = null

  // 1) Try to match by resendMessageId (most accurate)
  if (inReplyTo) {
    message = await prisma.supplierMessage.findFirst({
      where:   { resendMessageId: inReplyTo },
      select:  { id: true, supplierId: true },
      orderBy: { sentAt: 'desc' },
    })
  }

  // 2) Fall back: find supplier by email, then their most recent sent message
  if (!message) {
    const supplier = await prisma.supplier.findFirst({
      where: {
        OR: [
          { email: { equals: fromEmail, mode: 'insensitive' } },
          { contact: { equals: fromEmail, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    })

    if (supplier) {
      message = await prisma.supplierMessage.findFirst({
        where:   { supplierId: supplier.id, status: 'sent' },
        select:  { id: true, supplierId: true },
        orderBy: { sentAt: 'desc' },
      })
    }
  }

  if (!message) {
    // Not matched — still 200 so Resend doesn't retry
    return NextResponse.json({ ok: false, reason: 'no matching message found' })
  }

  // ── Update the message with reply content ─────────────────────────────────
  await prisma.supplierMessage.update({
    where: { id: message.id },
    data:  {
      status:       'replied',
      repliedAt:    new Date(),
      replySubject: subject,
      replyBody:    textBody.slice(0, 10000), // guard against huge emails
    },
  })

  return NextResponse.json({ ok: true, messageId: message.id })
}
