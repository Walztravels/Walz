import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic  = 'force-dynamic'
export const maxDuration = 60

// POST /api/admin/activities/book
// Creates an ActivityBooking record for an admin-initiated booking.
// Does NOT call the supplier API — the booking is recorded as CONFIRMED
// only after the admin has verified with the supplier (or for manual bookings).
// To book live with Hotelbeds use /api/hotelbeds/activities/book.
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    supplier,
    supplierProductId,
    supplierReference,
    activityTitle,
    location,
    travelDate,
    adults,
    children = 0,
    infants  = 0,
    clientName,
    clientEmail,
    clientPhone,
    totalAmount,
    supplierNetAmount,
    markupAmount,
    currency = 'GBP',
    notes,
  } = body

  if (!clientName || !clientEmail || !activityTitle) {
    return NextResponse.json({ error: 'clientName, clientEmail, activityTitle are required' }, { status: 400 })
  }

  // Generate a Walz reference
  const walzReference = `WALZ-ACT-${Date.now().toString(36).toUpperCase()}`

  const booking = await prisma.activityBooking.create({
    data: {
      supplier:          supplier ?? 'MANUAL',
      supplierProductId: supplierProductId ?? null,
      supplierReference: supplierReference ?? null,
      walzReference,
      bookingSource:     'ADMIN',
      bookedByStaffId:   session.staffId ?? null,
      clientName,
      clientEmail,
      clientPhone:       clientPhone ?? null,
      activityTitle,
      location:          location ?? null,
      travelDate:        travelDate ?? null,
      adults:            adults ?? 1,
      children,
      infants,
      totalAmount:       totalAmount ?? null,
      supplierNetAmount: supplierNetAmount ?? null,
      markupAmount:      markupAmount ?? null,
      currency,
      status:            'CONFIRMED',
      paymentStatus:     'UNPAID',
      notes:             notes ?? null,
    },
  })

  return NextResponse.json({ success: true, walzReference, bookingId: booking.id })
}
