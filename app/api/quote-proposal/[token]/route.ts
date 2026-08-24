// Public quote-proposal page API — client-safe fields only.
// NEVER expose: costMinor, markupMinor, serviceFeeMinor, internalNote,
//               duffelOfferId, secureTokenHash, or any staff-internal data.

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

function hashToken(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

// Strips all supplier-cost and staff-internal fields from an option
function safeFlightOption(fo: Record<string, unknown>) {
  return {
    id:            fo.id,
    label:         fo.label,
    isRecommended: fo.isRecommended,
    sortOrder:     fo.sortOrder,
    airline:       fo.airline,
    airlineCode:   fo.airlineCode,
    airlineLogoUrl: fo.airlineLogoUrl,
    operatingAirline: fo.operatingAirline,
    tripType:      fo.tripType,
    cabinClass:    fo.cabinClass,
    fareFamily:    fo.fareFamily,
    isRefundable:  fo.isRefundable,
    changesAllowed: fo.changesAllowed,
    changeFee:     fo.changeFee,
    noShowRule:    fo.noShowRule,
    seatIncluded:  fo.seatIncluded,
    mealIncluded:  fo.mealIncluded,
    personalItem:  fo.personalItem,
    cabinBaggage:  fo.cabinBaggage,
    checkedBaggage: fo.checkedBaggage,
    checkedPieces:  fo.checkedPieces,
    checkedWeight:  fo.checkedWeight,
    sellingPriceMinor: Number(fo.sellingPriceMinor),
    currency:      fo.currency,
    fareExpiresAt: fo.fareExpiresAt,
    clientNote:    fo.clientNote,
    // segments and media are nested via include
    segments: Array.isArray(fo.segments) ? (fo.segments as Array<Record<string, unknown>>).map(seg => ({
      id:            seg.id,
      segmentOrder:  seg.segmentOrder,
      originCode:    seg.originCode,
      originCity:    seg.originCity,
      originTerminal: seg.originTerminal,
      departureAt:   seg.departureAt,
      destinationCode: seg.destinationCode,
      destinationCity: seg.destinationCity,
      destinationTerminal: seg.destinationTerminal,
      arrivalAt:     seg.arrivalAt,
      flightNumber:  seg.flightNumber,
      operatingCarrier: seg.operatingCarrier,
      marketingCarrier: seg.marketingCarrier,
      aircraft:      seg.aircraft,
      durationMinutes: seg.durationMinutes,
      stops:         seg.stops,
      layoverMinutes: seg.layoverMinutes,
    })) : [],
    media: Array.isArray(fo.media) ? (fo.media as Array<Record<string, unknown>>).filter(m => m.clientVisible).map(m => ({
      id: m.id, url: m.url, caption: m.caption, altText: m.altText,
      sortOrder: m.sortOrder, isHero: m.isHero, mediaType: m.mediaType,
    })) : [],
  }
}

function safeHotelOption(ho: Record<string, unknown>) {
  return {
    id:               ho.id,
    label:            ho.label,
    isRecommended:    ho.isRecommended,
    sortOrder:        ho.sortOrder,
    hotelName:        ho.hotelName,
    starRating:       ho.starRating,
    address:          ho.address,
    city:             ho.city,
    country:          ho.country,
    description:      ho.description,
    checkIn:          ho.checkIn,
    checkOut:         ho.checkOut,
    nights:           ho.nights,
    rooms:            ho.rooms,
    adults:           ho.adults,
    children:         ho.children,
    roomType:         ho.roomType,
    bedType:          ho.bedType,
    mealPlan:         ho.mealPlan,
    breakfastIncluded: ho.breakfastIncluded,
    checkInTime:      ho.checkInTime,
    checkOutTime:     ho.checkOutTime,
    cancellationPolicy: ho.cancellationPolicy,
    isRefundable:     ho.isRefundable,
    amenities:        ho.amenities,
    rateExpiresAt:    ho.rateExpiresAt,
    sellingPriceMinor: Number(ho.sellingPriceMinor),
    currency:         ho.currency,
    showPerNight:     ho.showPerNight,
    clientNote:       ho.clientNote,
    media: Array.isArray(ho.media) ? (ho.media as Array<Record<string, unknown>>).filter(m => m.clientVisible).map(m => ({
      id: m.id, url: m.url, caption: m.caption, altText: m.altText,
      sortOrder: m.sortOrder, isHero: m.isHero, mediaType: m.mediaType,
    })) : [],
  }
}

// GET /api/quote-proposal/[token]
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const tokenHash = hashToken(params.token)

  const quote = await prisma.quote.findUnique({
    where: { secureTokenHash: tokenHash },
    include: {
      items:         { where: { clientVisible: true }, orderBy: { sortOrder: 'asc' } },
      flightOptions: {
        orderBy: { sortOrder: 'asc' },
        include: {
          segments: { orderBy: { segmentOrder: 'asc' } },
          media:    { where: { clientVisible: true }, orderBy: { sortOrder: 'asc' } },
        },
      },
      hotelOptions: {
        orderBy: { sortOrder: 'asc' },
        include: {
          media: { where: { clientVisible: true }, orderBy: { sortOrder: 'asc' } },
        },
      },
      media: { where: { clientVisible: true }, orderBy: { sortOrder: 'asc' } },
    },
  })

  if (!quote) {
    return NextResponse.json({ error: 'Quote not found or link is invalid.' }, { status: 404 })
  }

  if (new Date() > quote.validUntil) {
    if (quote.status !== 'expired') {
      await prisma.quote.update({ where: { id: quote.id }, data: { status: 'expired' } })
    }
    return NextResponse.json(
      { error: 'This quote has expired. Please contact your travel agent for a new quote.' },
      { status: 410 }
    )
  }

  // Update view tracking
  const isFirstView = !quote.firstViewedAt
  const updateData: Record<string, unknown> = { viewCount: { increment: 1 }, lastViewedAt: new Date() }
  if (isFirstView) {
    updateData.firstViewedAt = new Date()
    if (quote.status === 'sent') updateData.status = 'viewed'
  }

  await prisma.quote.update({ where: { id: quote.id }, data: updateData })

  if (isFirstView && quote.status === 'sent') {
    await prisma.quoteActivity.create({
      data: {
        quoteId: quote.id, actor: 'client', actorType: 'client',
        eventType: 'viewed',
        ipAddress: req.headers.get('x-forwarded-for') ?? null,
        userAgent: req.headers.get('user-agent') ?? null,
      },
    })
  }

  // Build client-safe response — no supplier costs, no internal notes, no secureTokenHash
  return NextResponse.json({
    id:           quote.id,
    reference:    quote.reference,
    status:       quote.status === 'sent' ? 'viewed' : quote.status,
    clientName:   quote.clientName,
    currency:     quote.currency,
    title:        quote.title,
    description:  quote.description,
    version:      quote.version,
    validUntil:   quote.validUntil,
    totalMinor:   Number(quote.totalMinor),
    subtotalMinor: Number(quote.subtotalMinor),
    depositMinor: quote.depositMinor != null ? Number(quote.depositMinor) : null,
    depositCurrency: quote.depositCurrency,
    depositPercentage: quote.depositPercentage,
    selectedFlightOptionId: quote.selectedFlightOptionId,
    selectedHotelOptionId:  quote.selectedHotelOptionId,
    clientSignatureName: quote.clientSignatureName,
    items: (quote.items as Array<Record<string, unknown>>).map(item => ({
      id:               item.id,
      type:             item.type,
      title:            item.title,
      description:      item.description,
      sortOrder:        item.sortOrder,
      sellingPriceMinor: Number(item.sellingPriceMinor),
      currency:         item.currency,
      showPriceToClient: item.showPriceToClient,
      clientNote:       item.clientNote,
      metadata:         item.metadata,
    })),
    flightOptions: (quote.flightOptions as Array<Record<string, unknown>>).map(fo =>
      safeFlightOption(fo)
    ),
    hotelOptions: (quote.hotelOptions as Array<Record<string, unknown>>).map(ho =>
      safeHotelOption(ho)
    ),
    media: (quote.media as Array<Record<string, unknown>>).map(m => ({
      id: m.id, url: m.url, caption: m.caption, altText: m.altText,
      sortOrder: m.sortOrder, isHero: m.isHero, mediaType: m.mediaType,
    })),
  })
}
