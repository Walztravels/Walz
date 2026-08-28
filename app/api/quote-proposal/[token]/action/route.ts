// Client action endpoint — accept, decline, or request changes on a quote.
// All responses are deliberately minimal — no supplier costs or internal data.
//
// Release 4D-C:
//   - Blocks DRAFT proposal acceptance (customer cannot accept before staff sends)
//   - Fires proposal_accepted CommercialEvent on acceptance
//   - Returns checkoutUrl when accepted quote has a linked Trip (SENT→accepted only)

import { NextRequest, NextResponse }  from 'next/server'
import crypto                         from 'crypto'
import prisma                         from '@/lib/db'
import { sendQuoteActionNotification } from '@/lib/email-quote-proposal'
import { createCheckoutToken }        from '@/lib/checkout/token'
import { trackCommercialEvent }       from '@/lib/commercial/track'

export const dynamic = 'force-dynamic'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

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
  if (quote.status === 'draft') {
    // DRAFT proposals are under staff review — customer cannot accept until SENT
    return NextResponse.json({ error: 'This proposal is still under review. You will receive an email when it is ready.' }, { status: 403 })
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

    // Fire proposal_accepted commercial event (was missing before 4D-C)
    void trackCommercialEvent('proposal_accepted', {
      leadId:   quote.leadId ?? undefined,
      metadata: { quoteId: quote.id, reference: quote.reference, tripId: quote.tripId ?? undefined },
    })

    // Generate checkout URL if this quote has a linked Trip (SENT→accepted flow)
    // DRAFT proposals do not reach this point (blocked above)
    let checkoutUrl: string | undefined
    if (quote.tripId && process.env.JADE_CHECKOUT_HANDOFF_ENABLED === 'true') {
      try {
        const linkedTrip = await prisma.trip.findUnique({
          where:  { id: quote.tripId },
          select: { userId: true, sessionId: true, status: true },
        })
        // Only generate URL if trip is in a checkable state
        if (linkedTrip && ['DRAFT', 'PLANNING', 'CHECKOUT_STARTED'].includes(linkedTrip.status)) {
          const ownerId = linkedTrip.userId ?? linkedTrip.sessionId
          if (ownerId) {
            const token = createCheckoutToken(quote.tripId, ownerId)
            checkoutUrl = `${SITE}/checkout/trip/${quote.tripId}?ct=${encodeURIComponent(token)}`
          }
        }
      } catch { /* non-fatal — checkout URL is a convenience, not required */ }
    }

    return NextResponse.json({ accepted: true, ...(checkoutUrl ? { checkoutUrl } : {}) })
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
