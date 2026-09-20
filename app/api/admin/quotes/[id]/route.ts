import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { sendQuoteProposalEmail } from '@/lib/email-quote-proposal'
import { sendWhatsAppBody, twilioConfigured } from '@/lib/twilio-whatsapp'
import { generateQuoteReference } from '@/lib/quote-reference'
import { propagateJadeAttribution } from '@/lib/commercial/track'
import { resolveClientActionContext } from '@/lib/inbox/client-context'

export const dynamic = 'force-dynamic'

// Supplier-cost/margin fields present on the Quote row itself AND (as of
// V1.3) on each nested QuoteItem/QuoteFlightOption/QuoteHotelOption row —
// none of this may reach staff lacking quotes.view_margin.
const MARGIN_FIELDS = [
  'costMinor', 'markupMinor', 'serviceFeeMinor',
  'supplierCostMinor', 'supplierCurrency', 'fxRate', 'fxRateAt', 'fxSource',
] as const

// Statuses a revision may be created from — every status this codebase's own
// send/proposal-action/expiry code paths actually assign to a quote that has
// left 'draft' and reached the client (app/admin/quotes/[id]/page.tsx's own
// isSent/isAccepted groupings + the quote-proposal action route's 'declined'/
// 'changes_requested'/'expired'). Deliberately excludes: 'draft' (no
// revision needed — edit it directly), and 'converted'/'cancelled'/
// 'archived' (dead-end terminal states a staff member retired on purpose —
// revising those would resurrect a quote nobody asked to reopen). Not a new
// status; purely a read of the existing lifecycle's own vocabulary.
const REVISION_ELIGIBLE_STATUSES = new Set([
  'sent', 'viewed', 'accepted', 'declined', 'changes_requested', 'expired',
])

function stripMarginFields(row: Record<string, unknown>) {
  const clean = { ...row }
  for (const key of MARGIN_FIELDS) delete clean[key]
  return clean
}

function serializeQuote(q: Record<string, unknown>, canViewMargin: boolean) {
  const safe = { ...q }
  // Strip internal financial fields unless staff has view_margin permission
  if (!canViewMargin) {
    delete safe.internalNotes
    for (const key of MARGIN_FIELDS) delete safe[key]
    for (const arrayKey of ['items', 'flightOptions', 'hotelOptions'] as const) {
      const rows = safe[arrayKey]
      if (Array.isArray(rows)) {
        safe[arrayKey] = rows.map(row => stripMarginFields(row as Record<string, unknown>))
      }
    }
  }
  return safe
}

function bigintToNumber(obj: unknown): unknown {
  if (typeof obj === 'bigint') return Number(obj)
  if (obj instanceof Date) return obj
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
  const canDelete     = session.role === 'super_admin'

  // secureTokenHash is never returned — it is internal only
  const { secureTokenHash: _, ...quoteData } = quote as Record<string, unknown> & { secureTokenHash: string }

  const stripped = serializeQuote(quoteData, canViewMargin)

  return NextResponse.json({ ...bigintToNumber(stripped) as object, canDelete })
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
    // UX-4.2: the Inbox Create Quote drawer finalizes a draft (mints the
    // real share token) WITHOUT firing the admin email/WhatsApp — staff
    // deliver the link themselves via the Inbox conversation. Everything
    // else (token rotation, status, activity log) is unchanged.
    const suppressNotifications = fields.suppressNotifications === true

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
        metadata:  suppressNotifications ? { suppressedNotifications: true } : undefined,
      },
    })

    // Generate public link
    const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/quote-proposal/${rawToken}`

    if (!suppressNotifications) {
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

      // V1.3 fix: QuoteItem gained flightOptionId/hotelOptionId FK fields
      // (linking a generic totals-row back to its richer option row). A
      // naive `...rest` copy of items BEFORE the options exist would copy
      // those ids pointing at the ORIGINAL quote's option rows, not this
      // duplicate's — options are created FIRST here so each item's link
      // can be remapped to the new option's id via oldId->newId maps.
      const flightOptionIdMap = new Map<string, string>()
      for (const fo of full.flightOptions) {
        const { id: oldId, quoteId: _qid, createdAt: _ca, updatedAt: _ua, segments, ...foRest } = fo
        const created = await tx.quoteFlightOption.create({
          data: { ...foRest, quoteId: q.id },
        })
        flightOptionIdMap.set(oldId, created.id)
        if (segments.length) {
          await tx.quoteFlightSegment.createMany({
            data: segments.map(({ id: _sid, flightOptionId: _foid, ...sRest }) => ({
              ...sRest, flightOptionId: created.id,
            })),
          })
        }
      }

      const hotelOptionIdMap = new Map<string, string>()
      for (const ho of full.hotelOptions) {
        const { id: oldId, quoteId: _qid, createdAt: _ca, updatedAt: _ua, ...hoRest } = ho
        const created = await tx.quoteHotelOption.create({ data: { ...hoRest, quoteId: q.id } })
        hotelOptionIdMap.set(oldId, created.id)
      }

      if (full.items.length) {
        await tx.quoteItem.createMany({
          data: full.items.map(({ id: _id, quoteId: _qid, createdAt: _ca, updatedAt: _ua, metadata, flightOptionId, hotelOptionId, ...rest }) => ({
            ...rest, quoteId: q.id,
            costMinor: rest.costMinor, markupMinor: rest.markupMinor,
            serviceFeeMinor: rest.serviceFeeMinor, sellingPriceMinor: rest.sellingPriceMinor,
            metadata: metadata ?? {},
            flightOptionId: flightOptionId ? (flightOptionIdMap.get(flightOptionId) ?? null) : null,
            hotelOptionId: hotelOptionId ? (hotelOptionIdMap.get(hotelOptionId) ?? null) : null,
          })),
        })
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

  // V1.3 — Create Revision. When a quote needs commercial changes after
  // being issued/finalized, this creates a NEW, fully independent, editable
  // Quote row (deep-copying items/flight+hotel options/media, exactly like
  // `duplicate` above) rather than repurposing QuoteVersion (which has
  // exactly one live use elsewhere — a thin client-acceptance marker, kept
  // completely untouched here) or mutating the original in place. The
  // original quote — its status, acceptance record, sent link, and any
  // existing itineraryId — is never modified except for having
  // isLatestRevision flipped to false. A revision is a PURE database
  // operation: no email/WhatsApp send, no 'sent' QuoteActivity — staff
  // finalize and send the new revision later through the exact same
  // existing action:'send' flow the original used.
  if (action === 'create_revision') {
    if (!hasPermission(session, 'quotes.create')) {
      return NextResponse.json({ error: 'Forbidden — quotes.create required' }, { status: 403 })
    }

    // Server-side lifecycle gate — must not rely on the UI only rendering
    // the Create Revision button once finalized. Fails closed with zero
    // writes for any status outside the allowed set, including a direct
    // API call that bypasses the button entirely.
    if (!REVISION_ELIGIBLE_STATUSES.has(quote.status)) {
      return NextResponse.json(
        { error: 'This quote is not in a state that supports creating a revision.', code: 'QUOTE_NOT_ELIGIBLE_FOR_REVISION' },
        { status: 409 },
      )
    }

    const full = await prisma.quote.findUnique({
      where: { id: params.id },
      include: {
        items:         true,
        flightOptions: { include: { segments: true } },
        hotelOptions:  true,
        media:         true,
      },
    })
    if (!full) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

    if (quote.conversationId != null) {
      const resolved = await resolveClientActionContext(quote.conversationId, session)
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error, code: 'CLIENT_IDENTITY_REQUIRED' }, { status: resolved.status })
      }
      if (resolved.context.resolution !== 'VERIFIED' && resolved.context.resolution !== 'LINKED') {
        return NextResponse.json(
          { error: 'Verify the client identity before creating a revision of this quote.', code: 'CLIENT_IDENTITY_REQUIRED' },
          { status: 403 },
        )
      }
    }

    const rootQuoteId = full.rootQuoteId ?? full.id
    const rootReference = full.rootQuoteId
      ? (await prisma.quote.findUnique({ where: { id: rootQuoteId }, select: { reference: true } }))?.reference ?? full.reference
      : full.reference

    const rawToken = crypto.randomBytes(32).toString('hex')
    const secureTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + 14)
    const nextRevisionNumber = full.revisionNumber + 1
    const reference = `${rootReference}-R${nextRevisionNumber}`

    const newQuote = await prisma.$transaction(async (tx) => {
      // Deliberately not copied: sentAt/firstViewedAt/lastViewedAt/
      // viewCount/acceptedAt/acceptedVersion/acceptedIp/acceptedUserAgent/
      // clientSignatureName/declinedAt/declineReason/changesRequestedAt/
      // changesNote/convertedAt/convertedBookingId/itineraryId — lifecycle
      // facts specific to the instance they happened to, not attributes of
      // the trip. itineraryId in particular starts null so this revision's
      // Quote->Itinerary conversion (if any) is fully independent of the
      // original's — converting this revision never touches or un-converts
      // the original's already-existing itinerary.
      const q = await tx.quote.create({
        data: {
          reference, secureTokenHash,
          clientName: full.clientName, clientEmail: full.clientEmail,
          clientPhone: full.clientPhone, clientCountry: full.clientCountry,
          currency: full.currency, title: full.title,
          description: full.description, status: 'draft', validUntil,
          createdBy: session.email, assignedTo: full.assignedTo,
          depositMinor: full.depositMinor, depositCurrency: full.depositCurrency,
          depositPercentage: full.depositPercentage,
          subtotalMinor: full.subtotalMinor, totalMinor: full.totalMinor,
          markupMinor: full.markupMinor, serviceChargeMinor: full.serviceChargeMinor,
          discountMinor: full.discountMinor,
          internalNotes: full.internalNotes,
          leadId: full.leadId, tripId: full.tripId,
          conversationId: full.conversationId, source: full.source,
          rootQuoteId, revisionNumber: nextRevisionNumber, isLatestRevision: true,
        },
      })

      const flightOptionIdMap = new Map<string, string>()
      for (const fo of full.flightOptions) {
        const { id: oldId, quoteId: _qid, createdAt: _ca, updatedAt: _ua, segments, ...foRest } = fo
        const created = await tx.quoteFlightOption.create({ data: { ...foRest, quoteId: q.id } })
        flightOptionIdMap.set(oldId, created.id)
        if (segments.length) {
          await tx.quoteFlightSegment.createMany({
            data: segments.map(({ id: _sid, flightOptionId: _foid, ...sRest }) => ({ ...sRest, flightOptionId: created.id })),
          })
        }
      }

      const hotelOptionIdMap = new Map<string, string>()
      for (const ho of full.hotelOptions) {
        const { id: oldId, quoteId: _qid, createdAt: _ca, updatedAt: _ua, ...hoRest } = ho
        const created = await tx.quoteHotelOption.create({ data: { ...hoRest, quoteId: q.id } })
        hotelOptionIdMap.set(oldId, created.id)
      }

      if (full.items.length) {
        await tx.quoteItem.createMany({
          data: full.items.map(({ id: _id, quoteId: _qid, createdAt: _ca, updatedAt: _ua, metadata, flightOptionId, hotelOptionId, ...rest }) => ({
            ...rest, quoteId: q.id,
            metadata: metadata ?? {},
            flightOptionId: flightOptionId ? (flightOptionIdMap.get(flightOptionId) ?? null) : null,
            hotelOptionId: hotelOptionId ? (hotelOptionIdMap.get(hotelOptionId) ?? null) : null,
          })),
        })
      }

      // QuoteMedia — copied here (a gap `duplicate` above still has,
      // deliberately left as-is/out of scope for this change) since a
      // finalized, priced quote worth revising is likely to already carry
      // client-visible hotel/flight images.
      if (full.media.length) {
        await tx.quoteMedia.createMany({
          data: full.media.map(({ id: _mid, quoteId: _qid, createdAt: _ca, flightOptionId, hotelOptionId, ...mRest }) => ({
            ...mRest, quoteId: q.id,
            flightOptionId: flightOptionId ? (flightOptionIdMap.get(flightOptionId) ?? null) : null,
            hotelOptionId: hotelOptionId ? (hotelOptionIdMap.get(hotelOptionId) ?? null) : null,
          })),
        })
      }

      // Flip the previous latest revision off — atomic with the new row's
      // creation, so a concurrent reader can never see two rows both
      // marked isLatestRevision:true for the same root.
      await tx.quote.update({ where: { id: full.id }, data: { isLatestRevision: false } })

      await tx.quoteActivity.create({
        data: { quoteId: full.id, actor: session.email, actorType: 'staff', eventType: 'revised', detail: `Superseded by revision ${nextRevisionNumber} (${reference})` },
      })
      await tx.quoteActivity.create({
        data: { quoteId: q.id, actor: session.email, actorType: 'staff', eventType: 'revised', detail: `Created as revision ${nextRevisionNumber} of ${rootReference}` },
      })

      return q
    })

    return NextResponse.json({
      quote: { id: newQuote.id, reference: newQuote.reference, status: newQuote.status, revisionNumber: newQuote.revisionNumber },
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

    // Propagate quoteId to the linked Booking for revenue attribution.
    // NOTE: Quote model has no leadId field — Quote→Lead chain is not persisted in schema.
    // Jade attribution via leadId must be set explicitly (fields.leadId) at convert time.
    if (fields.bookingId) {
      const bookingUpdateData: Record<string, unknown> = { quoteId: params.id }
      // If admin explicitly passes a leadId (e.g. from the Quote's associated lead), set it
      if (typeof fields.leadId === 'string' && fields.leadId) {
        bookingUpdateData.leadId = fields.leadId
      }
      await prisma.booking.update({
        where: { id: fields.bookingId },
        data:  bookingUpdateData as { quoteId: string; leadId?: string },
      }).catch(() => { /* Booking may not yet exist — non-fatal */ })

      // Propagate Jade attribution if leadId is now known
      if (typeof fields.leadId === 'string' && fields.leadId) {
        propagateJadeAttribution(fields.bookingId, fields.leadId)
          .catch(() => { /* non-fatal */ })
      }
    }

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

  // Currency-integrity guard (V1.2.1.1 hardening) — fail-closed only, no
  // conversion, no relabeling, no FX. This generic path let staff PATCH
  // Quote.currency at ANY status with no check at all, updating only the
  // Quote row while every already-persisted QuoteItem/QuoteFlightOption/
  // QuoteHotelOption kept its own currency and cost/selling-price amounts
  // untouched — silently desynchronizing parent and children with zero
  // recomputation and zero audit trail. Audited every caller in the repo
  // (Quote Builder's handleFinalize, the quote editor's action-based PATCHes,
  // the new-quote wizard) — none sends `currency` here; this field was
  // reachable but unused. Zero legitimate workflow depends on changing
  // currency through this path, so this is pure hardening, not a behavior
  // removal. True multi-currency re-pricing (server-authoritative FX,
  // preserving original supplier amounts for reconciliation) is a separate,
  // not-yet-built workstream — this guard only prevents the unsafe no-op
  // relabel in the meantime.
  if ('currency' in fields) {
    if (quote.status !== 'draft') {
      return NextResponse.json(
        {
          error: 'Quote currency can only be changed while the quote is still a draft.',
          code: 'CURRENCY_LOCKED',
        },
        { status: 409 },
      )
    }
    const [itemCount, flightOptionCount, hotelOptionCount] = await Promise.all([
      prisma.quoteItem.count({ where: { quoteId: params.id } }),
      prisma.quoteFlightOption.count({ where: { quoteId: params.id } }),
      prisma.quoteHotelOption.count({ where: { quoteId: params.id } }),
    ])
    if (itemCount > 0 || flightOptionCount > 0 || hotelOptionCount > 0) {
      return NextResponse.json(
        {
          error: 'Quote currency can only be changed before any priced item is added to the quote.',
          code: 'CURRENCY_LOCKED',
        },
        { status: 409 },
      )
    }
  }

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

// DELETE /api/admin/quotes/[id] — permanently delete (super_admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden — super_admin only' }, { status: 403 })
  }

  const quote = await prisma.quote.findUnique({ where: { id: params.id }, select: { id: true, reference: true } })
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  await prisma.quote.delete({ where: { id: params.id } })

  return NextResponse.json({ deleted: true, reference: quote.reference })
}
