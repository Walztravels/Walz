import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }          from '@/lib/admin-auth'
import prisma                       from '@/lib/db'
import { recordPaymentSucceeded }   from '@/lib/commercial/payment'

export const maxDuration = 60
export const dynamic     = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const {
      tourId,
      tourName,
      tourSlug,
      tourLocation,
      tourDuration,
      travelDate,
      adults       = 1,
      children     = 0,
      infants      = 0,
      holderName,
      holderEmail,
      holderPhone,
      totalNet,
      sellingPrice,
      markupPercent,
      markupAmount,
      serviceFee   = 0,
      discount     = 0,
      currency     = 'GBP',
      clientId,
      paymentMethod,
      notes,
    } = await req.json()

    if (!holderName || !holderEmail || !tourName) {
      return NextResponse.json(
        { error: 'Missing required fields: tourName, holderName, holderEmail' },
        { status: 400 }
      )
    }

    // ── Generate Walz reference ──────────────────────────────────────────────
    const walzRef = `WALZ-TUR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

    // ── Payment status ───────────────────────────────────────────────────────
    const paymentStatus = paymentMethod === 'MARK_PAID' ? 'SUCCEEDED' : 'PENDING'

    // ── Persist to DB ────────────────────────────────────────────────────────
    await prisma.booking.create({
      data: {
        bookingReference: walzRef,
        type:             'PACKAGE',
        status:           'CONFIRMED',
        paymentStatus:    paymentStatus as 'SUCCEEDED' | 'PENDING',
        totalAmount:      parseFloat(String(sellingPrice)),
        currency,
        userId:           clientId ?? null,
        contactEmail:     holderEmail,
        contactPhone:     holderPhone ?? null,
        createdByStaffId: session.staffId ?? session.id,
        hotelDetails: {
          tourId,
          tourName,
          tourSlug,
          tourLocation,
          tourDuration,
          travelDate,
          adults,
          children,
          infants,
          holderName,
          holderEmail,
          holderPhone:    holderPhone ?? null,
          supplierNet:    parseFloat(String(totalNet)),
          sellingPrice:   parseFloat(String(sellingPrice)),
          markupPercent,
          markupAmount,
          serviceFee,
          discount,
          paymentMethod,
          bookedByName:  session.name,
          bookedByEmail: session.email,
          notes:         notes ?? null,
        },
      },
    })

    // ── Audit log ────────────────────────────────────────────────────────────
    await prisma.activityLog.create({
      data: {
        staffId:     session.staffId ?? session.id,
        staffName:   session.name,
        staffRole:   session.staffRole ?? session.role,
        staffBranch: session.branch ?? '',
        action:      'TOUR_BOOKING_CREATED',
        module:      'bookings',
        entityId:    walzRef,
        entityType:  'Booking',
        detail:      `Tour ${walzRef} — ${tourName} — ${holderName} — ${currency} ${sellingPrice}`,
      },
    })

    if (paymentMethod === 'MARK_PAID') {
      recordPaymentSucceeded({
        provider:          'MANUAL',
        providerPaymentId: walzRef,
        amount:   parseFloat(String(sellingPrice)),
        currency: String(currency).toUpperCase(),
        metadata: { productType: 'tour', markedPaidBy: session.email },
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, walzRef, sellingPrice, currency })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Admin Tour Booking]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
