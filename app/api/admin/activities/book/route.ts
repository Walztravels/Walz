import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { ViatorActivityProvider } from '@/lib/activities/providers/viator'

export const dynamic  = 'force-dynamic'
export const maxDuration = 60

// POST /api/admin/activities/book
// For VIATOR bookings: calls the Viator Partner API to place a live booking,
// then persists the result. The booking appears in the Viator partner portal.
// For MANUAL / other suppliers: records the booking in Walz DB only.
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    supplier,
    supplierProductId,
    optionCode,         // the modality/option code (e.g. "TG1")
    startTime,          // first available start time from the schedule
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
    // paymentMethod: 'MARK_PAID' | 'BANK_TRANSFER' | 'CASH' | 'STRIPE' | 'PAYSTACK'
    // MARK_PAID / BANK_TRANSFER / CASH are admin-manual confirmations.
    // STRIPE / PAYSTACK are confirmed by their webhook handlers — do not set PAID here.
    paymentMethod = 'MARK_PAID',
    paymentRef,
    notes,
  } = body

  if (!clientName || !clientEmail || !activityTitle) {
    return NextResponse.json({ error: 'clientName, clientEmail, activityTitle are required' }, { status: 400 })
  }

  const manualPaymentMethods = ['MARK_PAID', 'BANK_TRANSFER', 'CASH']
  const resolvedPaymentStatus = manualPaymentMethods.includes(paymentMethod) ? 'PAID' : 'UNPAID'

  const walzReference = `WALZ-ACT-${Date.now().toString(36).toUpperCase()}`

  // ── Live Viator booking ────────────────────────────────────────────────────
  let viatorReference: string | undefined
  let bookingStatus = 'CONFIRMED'  // default for manual/non-Viator

  if (supplier === 'VIATOR' && supplierProductId) {
    try {
      const viator = new ViatorActivityProvider()
      const result = await viator.book({
        supplier:         'VIATOR',
        supplierProductId,
        modalityCode:     optionCode,
        date:             travelDate,
        startTime:        startTime ?? undefined,
        adults:           Number(adults) || 1,
        children:         Number(children) || 0,
        infants:          Number(infants)  || 0,
        holderName:       clientName,
        holderEmail:      clientEmail,
        holderPhone:      clientPhone,
        currency,
        sellingPrice:     totalAmount     != null ? Number(totalAmount)     : 0,
        supplierNetPrice: supplierNetAmount != null ? Number(supplierNetAmount) : undefined,
        walzReference,
      })

      if (result.success && result.supplierReference) {
        viatorReference = result.supplierReference
        bookingStatus   = result.status === 'CONFIRMED' ? 'CONFIRMED' : 'SUPPLIER_CONFIRMING'
        console.log(`[admin/activities/book] Viator booking created: ref=${viatorReference} status=${bookingStatus}`)
      } else {
        // Viator rejected the booking — record with failure status so admin can see why
        bookingStatus = 'SUPPLIER_BOOKING_FAILED'
        console.error('[admin/activities/book] Viator booking rejected:', result.error)
        // Still persist the record so the admin sees the failure
      }
    } catch (err) {
      // Network/API error — record with failure status
      bookingStatus = 'SUPPLIER_BOOKING_FAILED'
      console.error('[admin/activities/book] Viator API error:', err instanceof Error ? err.message : err)
    }
  }

  // ── Persist to Walz DB ─────────────────────────────────────────────────────
  try {
    const booking = await prisma.activityBooking.create({
      data: {
        supplier:          supplier ?? 'MANUAL',
        supplierProductId: supplierProductId ?? null,
        supplierReference: viatorReference ?? null,
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
        status:            bookingStatus,
        paymentStatus:     resolvedPaymentStatus,
        paymentRef:        paymentRef ?? null,
        notes:             notes ?? null,
      },
    })

    if (bookingStatus === 'SUPPLIER_BOOKING_FAILED') {
      return NextResponse.json({
        success:      false,
        walzReference,
        bookingId:    booking.id,
        error:        'Viator rejected the booking. The record has been saved with SUPPLIER_BOOKING_FAILED status. Check the activity bookings page for details.',
        supplierFailed: true,
      }, { status: 502 })
    }

    return NextResponse.json({
      success:           true,
      walzReference,
      bookingId:         booking.id,
      supplierReference: viatorReference,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error creating booking'
    console.error('[admin/activities/book] Prisma create failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
