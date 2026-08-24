import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { sendQuoteProposalEmail } from '@/lib/email-quote-proposal'
import { sendWhatsAppBody, twilioConfigured } from '@/lib/twilio-whatsapp'
import { generateQuoteReference } from '@/lib/quote-reference'

export const dynamic = 'force-dynamic'

function serializeQuote(q: Record<string, unknown>, canViewMargin: boolean) {
  const safe = { ...q }
  // Strip internal financial fields unless staff has view_margin permission
  if (!canViewMargin) {
    delete safe.internalNotes
    for (const key of ['costMinor', 'markupMinor', 'serviceFeeMinor'] as const) {
      delete safe[key]
    }
  }
  return safe
}

function bigintToNumber(obj: unknown): unknown {
  if (typeof obj === 'bigint') return Number(obj)
  if (Array.isArray(obj)) return obj.map(bigintToNumber)
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, bigintToNumber(v)])
    )
  }
  return obj
}

// GET /api/admin/quotes/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: {
      items:         { orderBy: { sortOrder: 'asc' } },
      flightOptions: {
        orderBy: { sortOrder: 'asc' },
        include: { segments: { orderBy: { segmentOrder: 'asc' } }, media: true },
      },
      hotelOptions:  {
        orderBy: { sortOrder: 'asc' },
        include: { media: true },
      },
      media:         { orderBy: { sortOrder: 'asc' } },
      versions:      { orderBy: { version: 'desc' } },
      activity:      { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  })

  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  const canViewMargin = hasPermission(session, 'quotes.view_margin')

  // secureTokenHash is never returned — it is internal only
  const { secureTokenHash: _, ...quoteData } = quote as Record<string, unknown> & { secureTokenHash: string }

  const stripped = serializeQuote(quoteData, canViewMargin)

  return NextResponse.json(bigintToNumber(stripped))
}

// PATCH /api/admin/quotes/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes.edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const quote = await prisma.quote.findUnique({ where: { id: params.id } })
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  const body = await req.json()
  const { action, ...fields } = body

  // ── Action handlers ────────────────────────────────────────────────────────

  if (action === 'send' || action === 'resend') {
    if (!hasPermission(session, 'quotes.send')) {
      return NextResponse.json({ error: 'Forbidden — quotes.send required' }, { status: 403 })
    }

    // Decode the raw token from secureTokenHash is impossible — generate a new one if needed
    // We store the raw token nowhere — the link is derived at send time from a new token if resending
    // or from the original if the user has stored the link. Since we can't reverse the hash,
    // we issue a new token on resend (invalidates old link).
    const rawToken = crypto.randomBytes(32).toString('hex')
    const secureTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const updated = await prisma.quote.update({
      where: { id: params.id },
      data: {
        status:         'sent',
        secureTokenHash,
        sentAt:         new Date(),
        version:        action === 'resend' ? { increment: 1 } : undefined,
      },
    })

    await prisma.quoteActivity.create({
      data: {
        quoteId:   params.id,
        actor:     session.email,
        actorType: 'staff',
        eventType: action === 'resend' ? 'resent' : 'sent',
        detail:    `Quote ${action === 'resend' ? 'resent' : 'sent'} to ${quote.clientEmail}`,
      },
    })

    // Generate public link
    const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/quote-proposal/${rawToken}`

    // Send email
    sendQuoteProposalEmail({
      to:         quote.clientEmail,
      clientName: quote.clientName,
      reference:  quote.reference,
      title:      quote.title,
      link,
      validUntil: updated.validUntil,
      staffName:  session.name,
    }).catch(() => {})

    // Send WhatsApp if client has a phone and Twilio is configured
    if (quote.clientPhone && twilioConfigured()) {
      const waMsg = `Hello ${quote.clientName.split(' ')[0]},\n\nYour Walz Travels proposal is ready!\n\n*${quote.title}*\nRef: ${quote.reference}\n\nView your proposal here:\n${link}\n\nValid until ${updated.validUntil.toDateString()}.\n\nQuestions? Reply to this message.`
      sendWhatsAppBody(quote.clientPhone, waMsg).catch(() => {})
    }

    return NextResponse.json({ quote: { id: updated.id, status: updated.status, link, token: rawToken } })
  }

  if (action === 'extend') {
    if (!hasPermission(session, 'quotes.extend_validity')) {
      return NextResponse.json({ error: 'Forbidden — quotes.extend_validity required' }, { status: 403 })
    }

    const days = Number(fields.days ?? 7)
    const newDate = new Date(quote.validUntil)
    newDate.setDate(newDate.getDate() + days)

    const updated = await prisma.quote.update({
      where: { id: params.id },
      data:  { validUntil: newDate },
    })

    await prisma.quoteActivity.create({
      data: {
        quoteId: params.id, actor: session.email, actorType: 'staff',
        eventType: 'extended',
        detail:    `Validity extended by ${days} days to ${newDate.toDateString()}`,
      },
    })

    return NextResponse.json({ quote: bigintToNumber({ id: updated.id, validUntil: updated.validUntil }) })
  }

  if (action === 'duplicate') {
    if (!hasPermission(session, 'quotes.create')) {
      return NextResponse.json({ error: 'Forbidden — quotes.create required' }, { status: 403 })
    }

    const full = await prisma.quote.findUnique({
      where: { id: params.id },
      include: {
        items:         true,
        flightOptions: { include: { segments: true } },
        hotelOptions:  true,
      },
    })
    if (!full) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

    const reference = await generateQuoteReference()
    const rawToken = crypto.randomBytes(32).toString('hex')
    const secureTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + 14)

    const newQuote = await prisma.$transaction(async (tx) => {
      const q = await tx.quote.create({
        data: {
          reference, secureTokenHash,
          clientName: full.clientName, clientEmail: full.clientEmail,
          clientPhone: full.clientPhone, clientCountry: full.clientCountry,
          currency: full.currency, title: `${full.title} (copy)`,
          description: full.description, status: 'draft', validUntil,
          createdBy: session.email, assignedTo: full.assignedTo,
          depositMinor: full.depositMinor, depositCurrency: full.depositCurrency,
          depositPercentage: full.depositPercentage,
          subtotalMinor: full.subtotalMinor, totalMinor: full.totalMinor,
          internalNotes: full.internalNotes,
        },
      })

      if (full.items.length) {
        await tx.quoteItem.createMany({
          data: full.items.map(({ id: _id, quoteId: _qid, createdAt: _ca, updatedAt: _ua, ...rest }) => ({
            ...rest, quoteId: q.id,
            costMinor: rest.costMinor, markupMinor: rest.markupMinor,
            serviceFeeMinor: rest.serviceFeeMinor, sellingPriceMinor: rest.sellingPriceMinor,
          })),
        })
      }

      for (const fo of full.flightOptions) {
        const { id: _fid, quoteId: _qid, createdAt: _ca, updatedAt: _ua, segments, ...foRest } = fo
        const created = await tx.quoteFlightOption.create({
          data: { ...foRest, quoteId: q.id },
        })
        if (segments.length) {
          await tx.quoteFlightSegment.createMany({
            data: segments.map(({ id: _sid, flightOptionId: _foid, ...sRest }) => ({
              ...sRest, flightOptionId: created.id,
            })),
          })
        }
      }

      for (const ho of full.hotelOptions) {
        const { id: _hid, quoteId: _qid, createdAt: _ca, updatedAt: _ua, ...hoRest } = ho
        await tx.quoteHotelOption.create({ data: { ...hoRest, quoteId: q.id } })
      }

      await tx.quoteActivity.create({
        data: {
          quoteId: q.id, actor: session.email, actorType: 'staff',
          eventType: 'created', detail: `Duplicated from ${full.reference}`,
        },
      })

      return q
    })

    const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/quote-proposal/${rawToken}`
    return NextResponse.json({
      quote: { id: newQuote.id, reference: newQuote.reference, token: rawToken, link, status: newQuote.status },
    })
  }

  if (action === 'cancel' || action === 'archive') {
    if (!hasPermission(session, 'quotes.delete')) {
      return NextResponse.json({ error: 'Forbidden — quotes.delete required' }, { status: 403 })
    }

    const updated = await prisma.quote.update({
      where: { id: params.id },
      data:  { status: action === 'cancel' ? 'cancelled' : 'archived' },
    })

    await prisma.quoteActivity.create({
      data: {
        quoteId: params.id, actor: session.email, actorType: 'staff',
        eventType: action, detail: fields.reason ?? null,
      },
    })

    return NextResponse.json({ quote: { id: updated.id, status: updated.status } })
  }

  if (action === 'convert') {
    if (!hasPermission(session, 'quotes.convert')) {
      return NextResponse.json({ error: 'Forbidden — quotes.convert required' }, { status: 403 })
    }

    const updated = await prisma.quote.update({
      where: { id: params.id },
      data: {
        status: 'converted',
        convertedAt: new Date(),
        convertedBookingId: fields.bookingId ?? null,
      },
    })

    await prisma.quoteActivity.create({
      data: {
        quoteId: params.id, actor: session.email, actorType: 'staff',
        eventType: 'converted',
        detail: fields.bookingId ? `Linked to booking ${fields.bookingId}` : 'Marked as converted',
      },
    })

    return NextResponse.json({ quote: { id: updated.id, status: updated.status } })
  }

  // ── Generic field update ───────────────────────────────────────────────────
  const allowedFields = [
    'title', 'description', 'currency', 'internalNotes', 'assignedTo',
    'clientName', 'clientEmail', 'clientPhone', 'clientCountry',
    'validUntil', 'depositMinor', 'depositCurrency', 'depositPercentage',
    'status',
  ]

  const updateData: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (key in fields) {
      if (key === 'validUntil') updateData[key] = new Date(fields[key] as string)
      else if (key === 'depositMinor') updateData[key] = fields[key] != null ? BigInt(fields[key] as number) : null
      else if (key === 'depositPercentage') updateData[key] = fields[key] ?? null
      else if (key === 'internalNotes' && !hasPermission(session, 'quotes.edit')) continue
      else updateData[key] = fields[key]
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  const updated = await prisma.quote.update({
    where: { id: params.id },
    data: updateData,
  })

  await prisma.quoteActivity.create({
    data: {
      quoteId: params.id, actor: session.email, actorType: 'staff',
      eventType: 'edited',
      detail: `Updated fields: ${Object.keys(updateData).join(', ')}`,
    },
  })

  const { secureTokenHash: _, ...safeUpdated } = updated as Record<string, unknown> & { secureTokenHash: string }
  return NextResponse.json(bigintToNumber(safeUpdated))
}
