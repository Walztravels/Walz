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
    // paymentMethod: 'MARK_PAID' | 'BANK_TRANSFER' | 'STRIPE' | 'PAYSTACK' | ...
    // MARK_PAID and BANK_TRANSFER are admin-manual confirmations; Stripe/Paystack
    // are gateway payments confirmed by webhook — never set paymentStatus=PAID for
    // gateway methods here; those are reconciled by the payment webhook handlers.
    paymentMethod = 'MARK_PAID',
    paymentRef,
    notes,
  } = body

  if (!clientName || !clientEmail || !activityTitle) {
    return NextResponse.json({ error: 'clientName, clientEmail, activityTitle are required' }, { status: 400 })
  }

  // Only admin-manual confirmation methods count as PAID at booking time.
  // Gateway payments (STRIPE, PAYSTACK) must be confirmed by their webhook handlers.
  const manualPaymentMethods = ['MARK_PAID', 'BANK_TRANSFER', 'CASH']
  const resolvedPaymentStatus = manualPaymentMethods.includes(paymentMethod) ? 'PAID' : 'UNPAID'

  // Generate a Walz reference
  const walzReference = `WALZ-ACT-${Date.now().toString(36).toUpperCase()}`

  try {
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
        adults:            Number(adults) || 1,
        children:          Number(children) || 0,
        infants:           Number(infants)  || 0,
        totalAmount:       totalAmount       != null ? Number(totalAmount)       : null,
        supplierNetAmount: supplierNetAmount != null ? Number(supplierNetAmount) : null,
        markupAmount:      markupAmount      != null ? Number(markupAmount)      : null,
        currency,
        status:            'CONFIRMED',
        paymentStatus:     resolvedPaymentStatus,
        paymentRef:        paymentRef ?? null,
        notes:             notes ?? null,
      },
    })
    return NextResponse.json({ success: true, walzReference, bookingId: booking.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error creating booking'
    console.error('[admin/activities/book] Prisma create failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
