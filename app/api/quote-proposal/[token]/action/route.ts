// Client action endpoint — accept, decline, or request changes on a quote.
// All responses are deliberately minimal — no supplier costs or internal data.

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { sendQuoteActionNotification } from '@/lib/email-quote-proposal'

export const dynamic = 'force-dynamic'

function hashToken(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

// POST /api/quote-proposal/[token]/action
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const tokenHash = hashToken(params.token)

  const quote = await prisma.quote.findUnique({
    where: { secureTokenHash: tokenHash },
  })

  if (!quote) {
    return NextResponse.json({ error: 'Quote not found.' }, { status: 404 })
  }
  if (new Date() > quote.validUntil) {
    return NextResponse.json({ error: 'This quote has expired.' }, { status: 410 })
  }
  if (['cancelled', 'archived', 'expired'].includes(quote.status)) {
    return NextResponse.json({ error: 'This quote is no longer active.' }, { status: 410 })
  }
  if (quote.status === 'converted') {
    return NextResponse.json({ error: 'This quote has already been processed.' }, { status: 409 })
  }

  const body = await req.json()
  const { action, signatureName, declineReason, changesNote, selectedFlightOptionId, selectedHotelOptionId } = body

  const ip = req.headers.get('x-forwarded-for') ?? null
  const ua = req.headers.get('user-agent') ?? null

  if (action === 'accept') {
    if (quote.status === 'accepted') {
      return NextResponse.json({ accepted: true, alreadyAccepted: true })
    }

    // Validate selected options exist if provided
    if (selectedFlightOptionId) {
      const fo = await prisma.quoteFlightOption.findFirst({
        where: { id: selectedFlightOptionId, quoteId: quote.id },
      })
      if (!fo) return NextResponse.json({ error: 'Invalid flight option selection.' }, { status: 400 })
    }
    if (selectedHotelOptionId) {
      const ho = await prisma.quoteHotelOption.findFirst({
        where: { id: selectedHotelOptionId, quoteId: quote.id },
      })
      if (!ho) return NextResponse.json({ error: 'Invalid hotel option selection.' }, { status: 400 })
    }

    await prisma.$transaction([
      prisma.quote.update({
        where: { id: quote.id },
        data: {
          status:                 'accepted',
          acceptedAt:             new Date(),
          acceptedVersion:        quote.version,
          acceptedIp:             ip,
          acceptedUserAgent:      ua,
          clientSignatureName:    signatureName ?? null,
          selectedFlightOptionId: selectedFlightOptionId ?? null,
          selectedHotelOptionId:  selectedHotelOptionId ?? null,
        },
      }),
      prisma.quoteVersion.create({
        data: {
          quoteId:     quote.id,
          version:     quote.version,
          status:      'accepted',
          snapshotJson: { acceptedAt: new Date().toISOString(), signatureName, selectedFlightOptionId, selectedHotelOptionId },
          changedBy:   'client',
          changeNote:  'Client accepted',
        },
      }),
      prisma.quoteActivity.create({
        data: {
          quoteId: quote.id, actor: 'client', actorType: 'client',
          eventType: 'accepted',
          detail: signatureName ? `Signed as: ${signatureName}` : null,
          metadata: { selectedFlightOptionId, selectedHotelOptionId },
          ipAddress: ip, userAgent: ua,
        },
      }),
    ])

    // Notify staff
    const staff = await prisma.staff.findUnique({ where: { email: quote.createdBy } })
    if (staff) {
      sendQuoteActionNotification({
        to:           staff.email,
        staffName:    staff.name,
        action:       'accepted',
        clientName:   quote.clientName,
        reference:    quote.reference,
        title:        quote.title,
        quoteId:      quote.id,
      }).catch(() => {})
    }

    return NextResponse.json({ accepted: true })
  }

  if (action === 'decline') {
    if (quote.status === 'declined') {
      return NextResponse.json({ declined: true, alreadyDeclined: true })
    }

    await prisma.$transaction([
      prisma.quote.update({
        where: { id: quote.id },
        data: { status: 'declined', declinedAt: new Date(), declineReason: declineReason ?? null },
      }),
      prisma.quoteActivity.create({
        data: {
          quoteId: quote.id, actor: 'client', actorType: 'client',
          eventType: 'declined', detail: declineReason ?? null,
          ipAddress: ip, userAgent: ua,
        },
      }),
    ])

    const staff = await prisma.staff.findUnique({ where: { email: quote.createdBy } })
    if (staff) {
      sendQuoteActionNotification({
        to: staff.email, staffName: staff.name, action: 'declined',
        clientName: quote.clientName, reference: quote.reference,
        title: quote.title, quoteId: quote.id, note: declineReason,
      }).catch(() => {})
    }

    return NextResponse.json({ declined: true })
  }

  if (action === 'changes') {
    await prisma.$transaction([
      prisma.quote.update({
        where: { id: quote.id },
        data: { status: 'changes_requested', changesRequestedAt: new Date(), changesNote: changesNote ?? null },
      }),
      prisma.quoteActivity.create({
        data: {
          quoteId: quote.id, actor: 'client', actorType: 'client',
          eventType: 'changes_requested', detail: changesNote ?? null,
          ipAddress: ip, userAgent: ua,
        },
      }),
    ])

    const staff = await prisma.staff.findUnique({ where: { email: quote.createdBy } })
    if (staff) {
      sendQuoteActionNotification({
        to: staff.email, staffName: staff.name, action: 'changes',
        clientName: quote.clientName, reference: quote.reference,
        title: quote.title, quoteId: quote.id, note: changesNote,
      }).catch(() => {})
    }

    return NextResponse.json({ changesRequested: true })
  }

  return NextResponse.json({ error: 'Invalid action. Use: accept | decline | changes' }, { status: 400 })
}
