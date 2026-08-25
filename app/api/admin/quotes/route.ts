import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { generateQuoteReference } from '@/lib/quote-reference'
import { sendQuoteProposalEmail } from '@/lib/email-quote-proposal'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

// GET /api/admin/quotes — list quotes with optional filters
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp     = req.nextUrl.searchParams
  const status = sp.get('status') ?? undefined
  const search = sp.get('q')?.trim() ?? undefined
  const page   = Math.max(1, parseInt(sp.get('page') ?? '1', 10))
  const skip   = (page - 1) * PAGE_SIZE

  const where: Record<string, unknown> = {}
  if (status && status !== 'all') where.status = status
  if (search) {
    where.OR = [
      { clientName:  { contains: search, mode: 'insensitive' } },
      { clientEmail: { contains: search, mode: 'insensitive' } },
      { reference:   { contains: search, mode: 'insensitive' } },
      { title:       { contains: search, mode: 'insensitive' } },
    ]
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let total = 0, quotes: any[] = []

  try {
    ;[total, quotes] = await Promise.all([
      prisma.quote.count({ where }),
      prisma.quote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
        select: {
          id: true, reference: true, status: true, version: true,
          clientName: true, clientEmail: true, clientPhone: true,
          currency: true, title: true,
          totalMinor: true, subtotalMinor: true,
          validUntil: true, sentAt: true, viewCount: true,
          firstViewedAt: true, acceptedAt: true, declinedAt: true,
          createdBy: true, assignedTo: true, createdAt: true, updatedAt: true,
          _count: { select: { items: true, flightOptions: true, hotelOptions: true } },
        },
      }),
    ])
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Table not set up yet — return empty list rather than crashing
    if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('table')) {
      return NextResponse.json({ items: [], total: 0, page: 1, pages: 0, setupRequired: true })
    }
    console.error('[quotes GET]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const canViewMargin = hasPermission(session, 'quotes.view_margin')

  return NextResponse.json({
    items: quotes.map(q => ({
      ...q,
      totalMinor:    Number(q.totalMinor),
      subtotalMinor: Number(q.subtotalMinor),
      canViewMargin,
    })),
    total,
    page,
    pages: Math.ceil(total / PAGE_SIZE),
  })
}

// POST /api/admin/quotes — create a new quote
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  const {
    clientName, clientEmail, clientPhone, clientCountry,
    currency = 'GBP',
    title, description,
    validDays = 14,
    assignedTo,
    depositMinor, depositCurrency, depositPercentage,
    internalNotes,
    items = [],
    flightOptions = [],
    hotelOptions  = [],
    sendEmail = false,
  } = body

  if (!clientName || !clientEmail || !title) {
    return NextResponse.json({ error: 'clientName, clientEmail and title are required' }, { status: 400 })
  }

  const reference = await generateQuoteReference()

  const rawToken = crypto.randomBytes(32).toString('hex')
  const secureTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

  const validUntil = new Date()
  validUntil.setDate(validUntil.getDate() + validDays)

  // Calculate totals from visible items + recommended options
  const itemsTotal = (items as Array<{ sellingPriceMinor?: number; clientVisible?: boolean }>)
    .filter(i => i.clientVisible !== false)
    .reduce((sum, i) => sum + (i.sellingPriceMinor ?? 0), 0)

  const flightTotal = (flightOptions as Array<{ sellingPriceMinor?: number; isRecommended?: boolean }>)
    .filter(f => f.isRecommended)
    .reduce((sum, f) => sum + (f.sellingPriceMinor ?? 0), 0)

  const hotelTotal = (hotelOptions as Array<{ sellingPriceMinor?: number; isRecommended?: boolean }>)
    .filter(h => h.isRecommended)
    .reduce((sum, h) => sum + (h.sellingPriceMinor ?? 0), 0)

  const subtotalMinor = BigInt(itemsTotal + flightTotal + hotelTotal)

  let quote: Awaited<ReturnType<typeof prisma.quote.create>>
  try {
    quote = await prisma.$transaction(async (tx) => {
    const q = await tx.quote.create({
      data: {
        reference,
        secureTokenHash,
        clientName,
        clientEmail,
        clientPhone:     clientPhone ?? null,
        clientCountry:   clientCountry ?? null,
        currency,
        title,
        description:     description ?? null,
        status:          'draft',
        validUntil,
        createdBy:       session.email,
        assignedTo:      assignedTo ?? null,
        depositMinor:    depositMinor != null ? BigInt(depositMinor) : null,
        depositCurrency: depositCurrency ?? null,
        depositPercentage: depositPercentage ?? null,
        subtotalMinor,
        totalMinor:      subtotalMinor,
        internalNotes:   internalNotes ?? null,
      },
    })

    // Items
    if (items.length > 0) {
      await tx.quoteItem.createMany({
        data: (items as Array<Record<string, unknown>>).map((item, idx) => ({
          quoteId:           q.id,
          type:              String(item.type ?? 'custom'),
          title:             String(item.title ?? ''),
          description:       (item.description as string | null) ?? null,
          sortOrder:         Number(item.sortOrder ?? idx),
          supplier:          (item.supplier as string | null) ?? null,
          supplierRef:       (item.supplierRef as string | null) ?? null,
          sourceType:        String(item.sourceType ?? 'manual'),
          costMinor:         BigInt(Number(item.costMinor ?? 0)),
          markupMinor:       BigInt(Number(item.markupMinor ?? 0)),
          serviceFeeMinor:   BigInt(Number(item.serviceFeeMinor ?? 0)),
          sellingPriceMinor: BigInt(Number(item.sellingPriceMinor ?? 0)),
          currency:          String(item.currency ?? currency),
          clientVisible:     item.clientVisible !== false,
          showPriceToClient: item.showPriceToClient !== false,
          clientNote:        (item.clientNote as string | null) ?? null,
          internalNote:      (item.internalNote as string | null) ?? null,
          metadata:          (item.metadata as object) ?? {},
        })),
      })
    }

    // Flight options
    for (let fi = 0; fi < (flightOptions as Array<Record<string, unknown>>).length; fi++) {
      const fo = (flightOptions as Array<Record<string, unknown>>)[fi]
      const segments = (fo.segments as Array<Record<string, unknown>> | undefined) ?? []

      const created = await tx.quoteFlightOption.create({
        data: {
          quoteId:           q.id,
          label:             (fo.label as string | null) ?? null,
          isRecommended:     Boolean(fo.isRecommended),
          sortOrder:         Number(fo.sortOrder ?? fi),
          airline:           String(fo.airline ?? ''),
          airlineCode:       (fo.airlineCode as string | null) ?? null,
          airlineLogoUrl:    (fo.airlineLogoUrl as string | null) ?? null,
          operatingAirline:  (fo.operatingAirline as string | null) ?? null,
          tripType:          String(fo.tripType ?? 'roundtrip'),
          cabinClass:        String(fo.cabinClass ?? 'ECONOMY'),
          fareClass:         (fo.fareClass as string | null) ?? null,
          fareFamily:        (fo.fareFamily as string | null) ?? null,
          isRefundable:      Boolean(fo.isRefundable),
          changesAllowed:    Boolean(fo.changesAllowed),
          changeFee:         (fo.changeFee as string | null) ?? null,
          noShowRule:        (fo.noShowRule as string | null) ?? null,
          seatIncluded:      Boolean(fo.seatIncluded),
          mealIncluded:      Boolean(fo.mealIncluded),
          personalItem:      (fo.personalItem as string | null) ?? null,
          cabinBaggage:      (fo.cabinBaggage as string | null) ?? null,
          checkedBaggage:    (fo.checkedBaggage as string | null) ?? null,
          checkedPieces:     fo.checkedPieces != null ? Number(fo.checkedPieces) : null,
          checkedWeight:     (fo.checkedWeight as string | null) ?? null,
          duffelOfferId:     (fo.duffelOfferId as string | null) ?? null,
          costMinor:         BigInt(Number(fo.costMinor ?? 0)),
          markupMinor:       BigInt(Number(fo.markupMinor ?? 0)),
          serviceFeeMinor:   BigInt(Number(fo.serviceFeeMinor ?? 0)),
          sellingPriceMinor: BigInt(Number(fo.sellingPriceMinor ?? 0)),
          currency:          String(fo.currency ?? currency),
          fareExpiresAt:     fo.fareExpiresAt ? new Date(fo.fareExpiresAt as string) : null,
          sourceType:        String(fo.sourceType ?? 'manual'),
          clientNote:        (fo.clientNote as string | null) ?? null,
          internalNote:      (fo.internalNote as string | null) ?? null,
        },
      })

      if (segments.length > 0) {
        await tx.quoteFlightSegment.createMany({
          data: segments.map((seg, si) => ({
            flightOptionId:       created.id,
            segmentOrder:         Number(seg.segmentOrder ?? si),
            originCode:           String(seg.originCode ?? ''),
            originCity:           (seg.originCity as string | null) ?? null,
            originTerminal:       (seg.originTerminal as string | null) ?? null,
            departureAt:          new Date(String(seg.departureAt ?? '').replace(/([+-]\d{2}:\d{2}|Z)$/, '')),
            destinationCode:      String(seg.destinationCode ?? ''),
            destinationCity:      (seg.destinationCity as string | null) ?? null,
            destinationTerminal:  (seg.destinationTerminal as string | null) ?? null,
            arrivalAt:            new Date(String(seg.arrivalAt ?? '').replace(/([+-]\d{2}:\d{2}|Z)$/, '')),
            flightNumber:         (seg.flightNumber as string | null) ?? null,
            operatingCarrier:     (seg.operatingCarrier as string | null) ?? null,
            marketingCarrier:     (seg.marketingCarrier as string | null) ?? null,
            aircraft:             (seg.aircraft as string | null) ?? null,
            durationMinutes:      seg.durationMinutes != null ? Number(seg.durationMinutes) : null,
            stops:                Number(seg.stops ?? 0),
            layoverMinutes:       seg.layoverMinutes != null ? Number(seg.layoverMinutes) : null,
          })),
        })
      }
    }

    // Hotel options
    if (hotelOptions.length > 0) {
      for (let hi = 0; hi < (hotelOptions as Array<Record<string, unknown>>).length; hi++) {
        const ho = (hotelOptions as Array<Record<string, unknown>>)[hi]
        await tx.quoteHotelOption.create({
          data: {
            quoteId:            q.id,
            label:              (ho.label as string | null) ?? null,
            isRecommended:      Boolean(ho.isRecommended),
            sortOrder:          Number(ho.sortOrder ?? hi),
            hotelName:          String(ho.hotelName ?? ''),
            starRating:         ho.starRating != null ? Number(ho.starRating) : null,
            address:            (ho.address as string | null) ?? null,
            city:               (ho.city as string | null) ?? null,
            country:            (ho.country as string | null) ?? null,
            description:        (ho.description as string | null) ?? null,
            checkIn:            new Date(ho.checkIn as string),
            checkOut:           new Date(ho.checkOut as string),
            nights:             Number(ho.nights ?? 1),
            rooms:              Number(ho.rooms ?? 1),
            adults:             Number(ho.adults ?? 2),
            children:           Number(ho.children ?? 0),
            roomType:           (ho.roomType as string | null) ?? null,
            bedType:            (ho.bedType as string | null) ?? null,
            mealPlan:           (ho.mealPlan as string | null) ?? null,
            breakfastIncluded:  Boolean(ho.breakfastIncluded),
            checkInTime:        (ho.checkInTime as string | null) ?? null,
            checkOutTime:       (ho.checkOutTime as string | null) ?? null,
            cancellationPolicy: (ho.cancellationPolicy as string | null) ?? null,
            isRefundable:       Boolean(ho.isRefundable),
            amenities:          (ho.amenities as string[]) ?? [],
            supplier:           (ho.supplier as string | null) ?? null,
            supplierRef:        (ho.supplierRef as string | null) ?? null,
            rateExpiresAt:      ho.rateExpiresAt ? new Date(ho.rateExpiresAt as string) : null,
            costMinor:          BigInt(Number(ho.costMinor ?? 0)),
            markupMinor:        BigInt(Number(ho.markupMinor ?? 0)),
            serviceFeeMinor:    BigInt(Number(ho.serviceFeeMinor ?? 0)),
            sellingPriceMinor:  BigInt(Number(ho.sellingPriceMinor ?? 0)),
            currency:           String(ho.currency ?? currency),
            showPerNight:       Boolean(ho.showPerNight),
            sourceType:         String(ho.sourceType ?? 'manual'),
            clientNote:         (ho.clientNote as string | null) ?? null,
            internalNote:       (ho.internalNote as string | null) ?? null,
          },
        })
      }
    }

    // Activity
    await tx.quoteActivity.create({
      data: {
        quoteId:   q.id,
        actor:     session.email,
        actorType: 'staff',
        eventType: 'created',
        detail:    `Quote created — ${reference}`,
      },
    })

      return q
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[quotes POST]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/quote-proposal/${rawToken}`

  // Optionally send email to client
  if (sendEmail && body.clientEmail) {
    sendQuoteProposalEmail({
      to:         body.clientEmail,
      clientName: body.clientName,
      reference,
      title,
      link,
      validUntil,
      staffName:  session.name,
    }).catch(() => {})
  }

  return NextResponse.json({
    quote: {
      id:        quote.id,
      reference: quote.reference,
      token:     rawToken,
      link,
      status:    quote.status,
    },
  })
}
