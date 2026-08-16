import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { renderTemplate, generateAiDraft, TEMPLATE_LABELS } from '@/lib/supplier-templates'
import { sendSupplierMessage } from '@/lib/supplier-email'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const VALID_PURPOSES = ['discount_request', 'special_request', 'upgrade_ask', 'general_followup', 'other'] as const
type Purpose = typeof VALID_PURPOSES[number]

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const messages = await prisma.supplierMessage.findMany({
    where:   { supplierId: params.id },
    orderBy: { sentAt: 'desc' },
    select: {
      id: true, subject: true, purpose: true, status: true, sentAt: true,
      repliedAt: true, replySubject: true, replyBody: true, body: true,
    },
  })
  return NextResponse.json({ messages })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supplier = await prisma.supplier.findUnique({ where: { id: params.id } })
  if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })

  const toEmail = supplier.email ?? supplier.contact ?? ''
  if (!toEmail || !toEmail.includes('@')) {
    return NextResponse.json({
      error: 'No contact email on file for this supplier. Add one in Suppliers → Edit.',
    }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as {
    bookingId?: string
    purpose?:   string
    mode?:      'template' | 'ai_draft' | 'send'
    prompt?:    string
    // For the final send — staff may have edited the draft
    subject?:   string
    messageBody?: string
  }

  const purpose = (VALID_PURPOSES.includes(body.purpose as Purpose) ? body.purpose : 'other') as Purpose
  const mode    = body.mode ?? 'template'

  // ── Resolve booking context ───────────────────────────────────────────────
  let ctx = {
    hotelName:  supplier.name,
    clientName: 'Guest',
    checkIn:    '',
    checkOut:   '',
    roomType:   '',
    partySize:  1,
    bookingRef: undefined as string | undefined,
  }

  if (body.bookingId) {
    const booking = await prisma.booking.findUnique({ where: { id: body.bookingId } })
    if (booking) {
      const h = (booking.hotelDetails ?? {}) as Record<string, unknown>
      ctx = {
        hotelName:  (h.hotelName  as string) || supplier.name,
        clientName: (h.clientName as string) || (booking as Record<string, unknown>).customerName as string || 'Guest',
        checkIn:    (h.checkIn    as string) || '',
        checkOut:   (h.checkOut   as string) || '',
        roomType:   (h.roomType   as string) || (h.room as string) || '',
        partySize:  (h.guests     as number) || (h.partySize as number) || 1,
        bookingRef: booking.bookingReference ?? undefined,
      }
      // SAFETY: never include cost/margin fields in context passed to templates or AI
    }
  }

  // ── Generate / preview (no email sent) ───────────────────────────────────
  if (mode === 'template') {
    const draft = renderTemplate(
      purpose === 'other' ? 'general_followup' : purpose,
      ctx,
    )
    return NextResponse.json({ draft })
  }

  if (mode === 'ai_draft') {
    if (!body.prompt?.trim()) return NextResponse.json({ error: 'prompt required for ai_draft mode' }, { status: 400 })
    try {
      const draft = await generateAiDraft({ purpose, prompt: body.prompt, ctx })
      return NextResponse.json({ draft })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'AI draft failed' }, { status: 422 })
    }
  }

  // ── Final send ────────────────────────────────────────────────────────────
  if (mode === 'send') {
    if (!body.subject?.trim()) return NextResponse.json({ error: 'subject required' }, { status: 400 })
    if (!body.messageBody?.trim()) return NextResponse.json({ error: 'messageBody required' }, { status: 400 })

    // Cost-leakage guard on the final body too (staff could paste something in)
    const banned = ['net rate', 'supplier cost', 'commission', 'our margin', 'markup']
    const lowerBody = body.messageBody.toLowerCase()
    for (const term of banned) {
      if (lowerBody.includes(term)) {
        return NextResponse.json({
          error: `Message contains sensitive term "${term}". Remove it before sending.`,
        }, { status: 422 })
      }
    }

    let logStatus = 'sent'
    let sendError: string | undefined
    let resendMessageId: string | null = null

    try {
      resendMessageId = await sendSupplierMessage({ to: toEmail, subject: body.subject, body: body.messageBody })
    } catch (err) {
      logStatus  = 'failed'
      sendError  = err instanceof Error ? err.message : String(err)
    }

    const log = await prisma.supplierMessage.create({
      data: {
        supplierId:      params.id,
        bookingId:       body.bookingId ?? null,
        sentBy:          session.id,
        subject:         body.subject,
        body:            body.messageBody,
        purpose,
        status:          logStatus,
        resendMessageId: resendMessageId ?? undefined,
      },
    })

    if (logStatus === 'failed') {
      return NextResponse.json({ error: `Send failed: ${sendError}`, log }, { status: 502 })
    }

    return NextResponse.json({ log })
  }

  return NextResponse.json({ error: 'Invalid mode. Use template, ai_draft, or send.' }, { status: 400 })
}

// Mark a message as replied
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { messageId?: string; status?: string }
  if (!body.messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 })

  const msg = await prisma.supplierMessage.findFirst({
    where: { id: body.messageId, supplierId: params.id },
  })
  if (!msg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.supplierMessage.update({
    where: { id: body.messageId },
    data:  {
      status:    body.status ?? 'replied',
      repliedAt: body.status === 'replied' ? new Date() : undefined,
    },
  })
  return NextResponse.json({ message: updated })
}
