// Price verification endpoint — returns customer-safe display price only.
// Supplier net amount, duffelOfferId, and staff fields are never included in the response.

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { sendFlightQuoteApprovalNotification } from '@/lib/email-flight-quote'

export const dynamic = 'force-dynamic'

// GET /api/flight-quote/[token] — client loads the quote page
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const quote = await prisma.flightQuote.findUnique({ where: { token: params.token } })

  if (!quote) {
    return NextResponse.json({ error: 'Quote not found.' }, { status: 404 })
  }

  if (new Date() > quote.expiresAt) {
    if (quote.status !== 'expired') {
      await prisma.flightQuote.update({
        where: { id: quote.id },
        data:  { status: 'expired' },
      })
    }
    return NextResponse.json(
      { error: 'This quote has expired. Please contact your travel agent for a new quote.' },
      { status: 410 }
    )
  }

  if (quote.status === 'pending') {
    await prisma.flightQuote.update({
      where: { id: quote.id },
      data:  { status: 'viewed', viewedAt: new Date() },
    })
  }

  // Return only customer-safe fields — no duffelOfferId, no supplier cost, no staff data
  return NextResponse.json({
    id:            quote.id,
    status:        quote.status === 'pending' ? 'viewed' : quote.status,
    clientName:    quote.clientName,
    origin:        quote.origin,
    destination:   quote.destination,
    departureDate: quote.departureDate,
    returnDate:    quote.returnDate,
    airline:       quote.airline,
    cabinClass:    quote.cabinClass,
    displayPrice:  quote.displayPrice.toString(),
    currency:      quote.currency,
    expiresAt:     quote.expiresAt,
  })
}

// POST /api/flight-quote/[token] — client approves the quote
export async function POST(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const quote = await prisma.flightQuote.findUnique({ where: { token: params.token } })

  if (!quote) {
    return NextResponse.json({ error: 'Quote not found.' }, { status: 404 })
  }
  if (new Date() > quote.expiresAt) {
    return NextResponse.json({ error: 'Quote has expired.' }, { status: 410 })
  }
  if (quote.status === 'approved' || quote.status === 'booked') {
    return NextResponse.json({ approved: true, alreadyApproved: true })
  }

  await prisma.flightQuote.update({
    where: { id: quote.id },
    data:  { status: 'approved', approvedAt: new Date() },
  })

  // Notify the staff member who created the quote
  const staff = await prisma.staff.findUnique({ where: { email: quote.createdBy } })
  if (staff?.email) {
    sendFlightQuoteApprovalNotification({
      to:           staff.email,
      staffName:    staff.name,
      clientName:   quote.clientName ?? 'Your client',
      origin:       quote.origin,
      destination:  quote.destination,
      airline:      quote.airline,
      displayPrice: Number(quote.displayPrice),
      currency:     quote.currency,
      quoteId:      quote.id,
    }).catch(() => {})
  }

  return NextResponse.json({ approved: true })
}
