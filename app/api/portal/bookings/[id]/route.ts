// app/api/portal/bookings/[id]/route.ts — Release 6.3: Customer booking detail (IDOR-protected)
// Ownership is validated in the WHERE clause — never fetch then check.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { toCustomerBookingDetail } from '@/lib/portal/booking-dto'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const email = session.user.email?.toLowerCase() ?? ''

  const booking = await prisma.booking.findFirst({
    where: {
      id: params.id,
      OR: [
        { userId },
        ...(email ? [{ contactEmail: email }] : []),
      ],
    },
    select: {
      id: true,
      bookingReference: true,
      type: true,
      status: true,
      paymentStatus: true,
      totalAmount: true,
      currency: true,
      pnr: true,
      contactEmail: true,
      contactPhone: true,
      flightDetails: true,
      hotelDetails: true,
      passengers: true,
      createdAt: true,
      // tickets relation
      tickets: {
        select: {
          id: true,
          htmlSnapshot: true,
          createdAt: true,
        },
      },
      // NEVER selected: notes, fxRate, fxMargin, fxSource, fxQuotedAt,
      // fareAmount, fareCurrency, stripeClientSecret, stripePaymentIntentId,
      // cryptoInvoiceId, cryptoPaidCurrency, cryptoAmountReceived,
      // jadeAssisted, leadId, quoteId, createdByStaffId, branch
    },
  })

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  return NextResponse.json(toCustomerBookingDetail(booking as Parameters<typeof toCustomerBookingDetail>[0]))
}
