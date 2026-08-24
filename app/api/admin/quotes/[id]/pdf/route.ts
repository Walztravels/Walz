import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { QuoteProposalPDF } from '@/lib/pdf/QuoteProposalPDF'

export const dynamic = 'force-dynamic'

// GET /api/admin/quotes/[id]/pdf — download the quote as a PDF
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return new NextResponse('Unauthorized', { status: 401 })
  if (!hasPermission(session, 'quotes')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: {
      items:         { where: { clientVisible: true }, orderBy: { sortOrder: 'asc' } },
      flightOptions: { orderBy: { sortOrder: 'asc' }, include: { segments: { orderBy: { segmentOrder: 'asc' } } } },
      hotelOptions:  { orderBy: { sortOrder: 'asc' } },
    },
  })

  if (!quote) return new NextResponse('Quote not found', { status: 404 })

  const props = {
    reference:   quote.reference,
    title:       quote.title,
    clientName:  quote.clientName,
    clientEmail: quote.clientEmail,
    currency:    quote.currency,
    validUntil:  quote.validUntil.toISOString(),
    description: quote.description ?? undefined,
    totalMinor:  Number(quote.totalMinor),
    depositMinor:       quote.depositMinor != null ? Number(quote.depositMinor) : undefined,
    depositPercentage:  quote.depositPercentage != null ? Number(quote.depositPercentage) : undefined,
    staffName:   session.name,
    selectedFlightOptionId: quote.selectedFlightOptionId ?? undefined,
    selectedHotelOptionId:  quote.selectedHotelOptionId ?? undefined,
    flightOptions: quote.flightOptions.map(fo => ({
      id: fo.id, label: fo.label ?? undefined, isRecommended: fo.isRecommended,
      sortOrder: fo.sortOrder, airline: fo.airline, airlineCode: fo.airlineCode ?? undefined,
      tripType: fo.tripType, cabinClass: fo.cabinClass,
      isRefundable: fo.isRefundable, changesAllowed: fo.changesAllowed,
      changeFee: fo.changeFee ?? undefined,
      seatIncluded: fo.seatIncluded, mealIncluded: fo.mealIncluded,
      personalItem: fo.personalItem ?? undefined,
      cabinBaggage: fo.cabinBaggage ?? undefined,
      checkedBaggage: fo.checkedBaggage ?? undefined,
      sellingPriceMinor: Number(fo.sellingPriceMinor),
      currency: fo.currency,
      clientNote: fo.clientNote ?? undefined,
      segments: fo.segments.map(seg => ({
        segmentOrder: seg.segmentOrder,
        originCode: seg.originCode, originCity: seg.originCity ?? undefined,
        departureAt: seg.departureAt.toISOString(),
        destinationCode: seg.destinationCode, destinationCity: seg.destinationCity ?? undefined,
        arrivalAt: seg.arrivalAt.toISOString(),
        flightNumber: seg.flightNumber ?? undefined,
        durationMinutes: seg.durationMinutes ?? undefined,
        stops: seg.stops,
      })),
    })),
    hotelOptions: quote.hotelOptions.map(ho => ({
      id: ho.id, label: ho.label ?? undefined, isRecommended: ho.isRecommended,
      hotelName: ho.hotelName, starRating: ho.starRating ?? undefined,
      city: ho.city ?? undefined, country: ho.country ?? undefined,
      description: ho.description ?? undefined,
      checkIn: ho.checkIn.toISOString(), checkOut: ho.checkOut.toISOString(),
      nights: ho.nights, rooms: ho.rooms, adults: ho.adults, children: ho.children,
      roomType: ho.roomType ?? undefined, mealPlan: ho.mealPlan ?? undefined,
      breakfastIncluded: ho.breakfastIncluded, isRefundable: ho.isRefundable,
      amenities: ho.amenities,
      sellingPriceMinor: Number(ho.sellingPriceMinor), currency: ho.currency,
      clientNote: ho.clientNote ?? undefined,
    })),
    items: quote.items.map(item => ({
      id: item.id, type: item.type, title: item.title,
      sellingPriceMinor: Number(item.sellingPriceMinor), currency: item.currency,
      showPriceToClient: item.showPriceToClient, clientNote: item.clientNote ?? undefined,
    })),
  }

  const element = React.createElement(QuoteProposalPDF, props)
  const pdfBuffer = await renderToBuffer(element as React.ReactElement)

  const filename = `Walz-Travels-${quote.reference}.pdf`

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBuffer.length),
    },
  })
}
