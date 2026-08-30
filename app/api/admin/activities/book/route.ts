import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { ViatorActivityProvider } from '@/lib/activities/providers/viator'
import { viatorGet } from '@/lib/activities/providers/viator/client'
import type { ViatorScheduleResponse } from '@/lib/activities/providers/viator/types'

export const dynamic  = 'force-dynamic'
export const maxDuration = 60

// Max price increase before requiring staff review (mirrors customer-web flow)
const PRICE_TOLERANCE_PCT = Number(process.env.VIATOR_POST_PAYMENT_PRICE_TOLERANCE_PERCENT ?? '5')

// POST /api/admin/activities/book
//
// Safety guarantees:
//   Idempotency    — bookingAttemptId (stable UUID from frontend) stored as cartItemId;
//                    checked before any Viator call — double-click safe.
//   DB-first       — ActivityBooking created at SUPPLIER_CONFIRMING BEFORE /bookings;
//                    Viator ref written on success. No lost-booking window.
//   Failure class  — network timeout / 5xx → RECONCILIATION_REQUIRED (outcome unknown).
//                    4xx → SUPPLIER_BOOKING_FAILED (definite rejection).
//   Revalidation   — availability and price checked against live Viator schedule
//                    immediately before /bookings call.
//   Price change   — if supplier net rose > PRICE_TOLERANCE_PCT, booking halted and
//                    stored as PRICE_CHANGE_REQUIRES_ACTION for staff review.
//   Manual mode    — supplier='MANUAL' OR manualSupplierReference provided → no API call.
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    supplier,
    supplierProductId,
    optionCode,              // modality/option code e.g. "TG1"
    startTime,               // HH:MM from availability schedule
    activityTitle,
    location,
    travelDate,              // YYYY-MM-DD
    adults,
    children       = 0,
    infants        = 0,
    clientName,
    clientEmail,
    clientPhone,
    totalAmount,             // Walz selling price (post-markup)
    supplierNetAmount,       // supplier net cost shown in wizard
    markupAmount,
    currency       = 'GBP',
    paymentMethod  = 'MARK_PAID',
    paymentRef,
    notes,
    bookingAttemptId,        // stable UUID from frontend — idempotency key
    manualSupplierReference, // if set, skip live API and record this ref directly
  } = body

  if (!clientName || !clientEmail || !activityTitle) {
    return NextResponse.json({ error: 'clientName, clientEmail, activityTitle are required' }, { status: 400 })
  }

  const manualPaymentMethods = ['MARK_PAID', 'BANK_TRANSFER', 'CASH']
  const resolvedPaymentStatus = manualPaymentMethods.includes(paymentMethod) ? 'PAID' : 'UNPAID'

  // Whether to call the live Viator API
  const callViatorAPI = supplier === 'VIATOR' && !!supplierProductId && !manualSupplierReference

  // Walz reference — unique per booking, sent to Viator as partnerOrderId
  const walzReference = `WALZ-ACT-${Date.now().toString(36).toUpperCase()}`

  // ── 1. Idempotency guard ────────────────────────────────────────────────────
  // bookingAttemptId is generated once per wizard session and stable across retries.
  // Stored as cartItemId so duplicate requests return the existing result.
  if (bookingAttemptId) {
    const existing = await prisma.activityBooking.findFirst({
      where:  { cartItemId: bookingAttemptId, bookingSource: 'ADMIN' },
      select: { id: true, walzReference: true, supplierReference: true, status: true },
    })
    if (existing) {
      if (existing.status === 'RECONCILIATION_REQUIRED') {
        return NextResponse.json({
          success:                false,
          walzReference:          existing.walzReference,
          bookingId:              existing.id,
          reconciliationRequired: true,
          error:                  'Booking already attempted — outcome unknown. Check Activity Bookings to reconcile.',
        }, { status: 202 })
      }
      if (existing.status === 'SUPPLIER_BOOKING_FAILED') {
        return NextResponse.json({
          success:        false,
          walzReference:  existing.walzReference,
          bookingId:      existing.id,
          supplierFailed: true,
          error:          'Booking already attempted and rejected by Viator. Use the retry action in Activity Bookings.',
        }, { status: 409 })
      }
      // Success or pending — return existing result without touching Viator
      return NextResponse.json({
        success:           true,
        walzReference:     existing.walzReference,
        bookingId:         existing.id,
        supplierReference: existing.supplierReference,
      })
    }
  }

  // ── 2. Create DB record BEFORE calling Viator ───────────────────────────────
  // Anchors the booking so reconciliation can find it even if the Viator call
  // succeeds but the subsequent DB update fails.
  let bookingId: string
  try {
    const record = await prisma.activityBooking.create({
      data: {
        supplier:             supplier ?? 'MANUAL',
        supplierProductId:    supplierProductId ?? null,
        // For manual reference entries, store it immediately
        supplierReference:    manualSupplierReference ?? null,
        walzReference,
        bookingSource:        'ADMIN',
        cartItemId:           bookingAttemptId ?? null,   // idempotency anchor
        bookedByStaffId:      session.staffId ?? null,
        clientName,
        clientEmail,
        clientPhone:          clientPhone  ?? null,
        activityTitle,
        location:             location     ?? null,
        travelDate:           travelDate   ?? null,
        adults:               Number(adults)   || 1,
        children:             Number(children) || 0,
        infants:              Number(infants)  || 0,
        totalAmount:          totalAmount       != null ? Number(totalAmount)       : null,
        supplierNetAmount:    supplierNetAmount != null ? Number(supplierNetAmount) : null,
        markupAmount:         markupAmount      != null ? Number(markupAmount)      : null,
        currency,
        // Start SUPPLIER_CONFIRMING if we're about to call Viator; CONFIRMED otherwise
        status:               callViatorAPI ? 'SUPPLIER_CONFIRMING' : 'CONFIRMED',
        supplierConfirmingAt: callViatorAPI ? new Date() : null,
        supplierConfirmedAt:  callViatorAPI ? null       : new Date(),
        paymentStatus:        resolvedPaymentStatus,
        paymentRef:           paymentRef ?? null,
        notes:                notes      ?? null,
      },
    })
    bookingId = record.id
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error creating booking'
    console.error('[admin/activities/book] DB create failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // ── Non-Viator / manual reference bookings — done ─────────────────────────
  if (!callViatorAPI) {
    return NextResponse.json({
      success:           true,
      walzReference,
      bookingId,
      supplierReference: manualSupplierReference ?? undefined,
    })
  }

  // ── 3. Availability + price revalidation ────────────────────────────────────
  // Immediately before /bookings — catches sold-out and price changes since the
  // wizard search result was fetched (which may have been minutes or hours ago).
  try {
    const { status: schedStatus, data: sched } = await viatorGet<ViatorScheduleResponse>(
      `/availability/schedules/${encodeURIComponent(supplierProductId)}`
    )

    if (schedStatus !== 200 || !sched.bookableItems?.length) {
      await prisma.activityBooking.update({
        where: { id: bookingId },
        data:  { status: 'SUPPLIER_BOOKING_FAILED', failureReason: 'SOLD_OUT',
                 notes: 'Activity schedule unavailable at booking time' },
      })
      return NextResponse.json({
        success: false, walzReference, bookingId, supplierFailed: true,
        error:   'Activity is no longer available. Check the Viator portal for current availability.',
      }, { status: 409 })
    }

    const today   = new Date().toISOString().slice(0, 10)
    const dayName = travelDate
      ? new Date(`${travelDate}T12:00:00Z`)
          .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
          .toUpperCase()
      : null

    let currentNet: number | null = null
    let dateAvailable = false
    let soldOut       = false

    outer: for (const item of sched.bookableItems) {
      for (const season of item.seasons ?? []) {
        if (!travelDate || season.startDate > travelDate || season.endDate < travelDate) continue
        for (const rec of season.pricingRecords ?? []) {
          if (dayName && rec.daysOfWeek && !rec.daysOfWeek.includes(dayName)) continue
          const adult = (rec.pricingDetails ?? []).find(d => d.ageBand === 'ADULT') ?? (rec.pricingDetails ?? [])[0]
          if (!adult) continue
          const sp = adult.price.special
          const useSpecial = !!(sp?.offerStartDate && sp.offerEndDate &&
            sp.offerStartDate <= today && sp.offerEndDate >= today)
          currentNet = useSpecial ? sp!.partnerNetPrice : adult.price.original.partnerNetPrice
          if (rec.timedEntries?.length) {
            const allSold = rec.timedEntries.every(e => e.unavailableDates?.some(u => u.date === travelDate))
            if (allSold) { soldOut = true; break outer }
          }
          dateAvailable = true
          break outer
        }
      }
    }

    if (soldOut || !dateAvailable) {
      await prisma.activityBooking.update({
        where: { id: bookingId },
        data:  { status: 'SUPPLIER_BOOKING_FAILED', failureReason: 'SOLD_OUT',
                 notes:  `Date ${travelDate} sold out or unavailable at booking time` },
      })
      return NextResponse.json({
        success: false, walzReference, bookingId, supplierFailed: true,
        error:   `This activity is sold out on ${travelDate}. Please choose a different date or activity.`,
      }, { status: 409 })
    }

    // Price change: compare current Viator net against the net shown in the wizard
    if (currentNet !== null && supplierNetAmount != null) {
      const storedNet = Number(supplierNetAmount)
      if (storedNet > 0 && currentNet > storedNet) {
        const pct = ((currentNet - storedNet) / storedNet) * 100
        if (pct > PRICE_TOLERANCE_PCT) {
          await prisma.activityBooking.update({
            where: { id: bookingId },
            data: {
              status:        'PRICE_CHANGE_REQUIRES_ACTION',
              failureReason: 'PRICE_CHANGE',
              notes:         `Supplier net rose from ${storedNet} → ${currentNet} ${currency} (+${pct.toFixed(1)}%). Exceeds ${PRICE_TOLERANCE_PCT}% tolerance. Staff review required before confirming.`,
            },
          })
          return NextResponse.json({
            success:         false, walzReference, bookingId,
            priceChanged:    true,
            storedNetPrice:  storedNet,
            currentNetPrice: currentNet,
            changePct:       pct,
            error:           `Viator supplier cost increased by ${pct.toFixed(1)}% (${currency} ${storedNet.toFixed(2)} → ${currentNet.toFixed(2)}). Booking held for staff review — see Activity Bookings.`,
          }, { status: 409 })
        }
      }
    }
  } catch (revalErr) {
    // Revalidation failure is non-fatal — log and proceed.
    // The /bookings call itself will reject if truly unavailable.
    console.warn('[admin/activities/book] Revalidation failed, proceeding:', revalErr instanceof Error ? revalErr.message : revalErr)
  }

  // ── 4. Call Viator /bookings with 25-second timeout ──────────────────────────
  // 25s chosen to stay well within Vercel's 60s limit, giving time to write DB result.
  // Any error here (timeout, network reset, JSON parse failure, 5xx) is UNKNOWN outcome.
  // 4xx from Viator returns success:false without throwing → SUPPLIER_BOOKING_FAILED.
  const viator = new ViatorActivityProvider()
  let viatorResult: Awaited<ReturnType<typeof viator.book>>

  try {
    viatorResult = await Promise.race([
      viator.book({
        supplier:          'VIATOR',
        supplierProductId,
        modalityCode:      optionCode,
        date:              travelDate,
        startTime:         startTime ?? undefined,
        adults:            Number(adults)   || 1,
        children:          Number(children) || 0,
        infants:           Number(infants)  || 0,
        holderName:        clientName,
        holderEmail:       clientEmail,
        holderPhone:       clientPhone,
        currency,
        sellingPrice:      totalAmount       != null ? Number(totalAmount)       : 0,
        supplierNetPrice:  supplierNetAmount != null ? Number(supplierNetAmount) : undefined,
        walzReference,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('VIATOR_TIMEOUT')), 25_000)
      ),
    ])
  } catch (err) {
    // Timeout, network error, 5xx non-JSON, or viator.book() throwing for 5xx.
    // Outcome is UNKNOWN — must reconcile, never safe to assume failure.
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin/activities/book] Viator uncertain outcome:', msg)
    await prisma.activityBooking.update({
      where: { id: bookingId },
      data: {
        status:           'RECONCILIATION_REQUIRED',
        failureReason:    'TIMEOUT',
        lastReconciledAt: new Date(),
        notes:            `Viator outcome unknown: ${msg}. Check Viator portal for ref walz:${walzReference}.`,
      },
    })
    return NextResponse.json({
      success:                false,
      walzReference,
      bookingId,
      reconciliationRequired: true,
      error:                  'Viator did not respond in time. The booking may or may not have been created at Viator. Check the Activity Bookings page and reconcile — do NOT book again without checking the Viator portal first.',
    }, { status: 202 })
  }

  // ── 5. Persist Viator response ──────────────────────────────────────────────
  if (viatorResult.success && viatorResult.supplierReference) {
    const finalStatus = viatorResult.status === 'CONFIRMED' ? 'CONFIRMED' : 'SUPPLIER_CONFIRMING'
    await prisma.activityBooking.update({
      where: { id: bookingId },
      data: {
        status:             finalStatus,
        supplierReference:  viatorResult.supplierReference,
        supplierConfirmedAt: finalStatus === 'CONFIRMED' ? new Date() : null,
        lastReconciledAt:   new Date(),
      },
    })
    console.info(JSON.stringify({
      event:      'admin_viator_booking_created',
      walzRef:    walzReference,
      viatorRef:  viatorResult.supplierReference,
      status:     finalStatus,
    }))
    return NextResponse.json({
      success:           true,
      walzReference,
      bookingId,
      supplierReference: viatorResult.supplierReference,
    })
  }

  // 4xx definite rejection from Viator
  await prisma.activityBooking.update({
    where: { id: bookingId },
    data: {
      status:           'SUPPLIER_BOOKING_FAILED',
      failureReason:    'REJECTED',
      lastReconciledAt: new Date(),
      notes:            `Viator rejected: ${viatorResult.error ?? 'Unknown reason'}`,
    },
  })
  console.error('[admin/activities/book] Viator 4xx rejection:', viatorResult.error)
  return NextResponse.json({
    success:        false,
    walzReference,
    bookingId,
    supplierFailed: true,
    error:          `Viator rejected the booking: ${viatorResult.error ?? 'Unknown reason'}`,
  }, { status: 502 })
}
