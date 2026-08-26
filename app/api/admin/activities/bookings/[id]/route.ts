import { NextRequest, NextResponse }   from 'next/server'
import { getAdminSession }             from '@/lib/admin-auth'
import prisma                          from '@/lib/db'
import { ViatorActivityProvider }      from '@/lib/activities/providers/viator'
import { reconcileViatorBooking }      from '@/lib/activities/booking'

// ── PATCH — update notes, status override, etc. ────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data    = await req.json()
  const booking = await prisma.activityBooking.update({ where: { id: params.id }, data })
  return NextResponse.json({ booking })
}

// ── POST — named admin actions ─────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, notes } = await req.json()

  const booking = await prisma.activityBooking.findUnique({
    where:  { id: params.id },
    select: {
      id: true, status: true, supplier: true, supplierReference: true,
      walzReference: true, activityTitle: true, reconciliationAttempts: true,
      paymentStatus: true, failureReason: true, supplierConfirmingAt: true,
    },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // ── check-supplier-status ─────────────────────────────────────────────────
  // Query Viator for the current booking status without making any changes.
  if (action === 'check-supplier-status') {
    if (booking.supplier !== 'VIATOR') {
      return NextResponse.json({ error: 'Only VIATOR bookings support status lookup' }, { status: 400 })
    }
    const provider = new ViatorActivityProvider()
    let found = null

    if (booking.supplierReference) {
      try { found = await provider.getBooking(booking.supplierReference) } catch { /* continue */ }
    }
    if (!found && booking.walzReference) {
      found = await provider.getBookingByPartnerRef(booking.walzReference)
    }

    // Log admin action
    await prisma.activityBooking.update({
      where: { id: params.id },
      data:  { lastReconciledAt: new Date() },
    })

    return NextResponse.json({
      bookingId:         booking.id,
      walzReference:     booking.walzReference,
      currentWalzStatus: booking.status,
      supplierResult:    found ? {
        found:             true,
        supplierReference: found.supplierReference,
        status:            found.status,
      } : { found: false },
    })
  }

  // ── reconcile ─────────────────────────────────────────────────────────────
  // Run the full reconciliation logic: query Viator, update status if found.
  if (action === 'reconcile') {
    if (booking.supplier !== 'VIATOR') {
      return NextResponse.json({ error: 'Only VIATOR bookings can be reconciled' }, { status: 400 })
    }
    if (!['RECONCILIATION_REQUIRED', 'SUPPLIER_CONFIRMING'].includes(booking.status)) {
      return NextResponse.json({
        error: `Cannot reconcile a booking in status '${booking.status}'`,
      }, { status: 400 })
    }
    const outcome = await reconcileViatorBooking(params.id)
    return NextResponse.json({ outcome, bookingId: params.id, walzReference: booking.walzReference })
  }

  // ── retry-if-safe ─────────────────────────────────────────────────────────
  // The backend determines whether a retry is safe — not the button alone.
  // Safe conditions: SUPPLIER_BOOKING_FAILED with no supplierReference, attempts < 3.
  if (action === 'retry-if-safe') {
    if (booking.supplier !== 'VIATOR') {
      return NextResponse.json({ error: 'Only VIATOR bookings support retry' }, { status: 400 })
    }
    if (booking.supplierReference) {
      return NextResponse.json({
        error: 'Retry not safe: supplier reference already exists — Viator booking may have been created',
        supplierReference: booking.supplierReference,
      }, { status: 409 })
    }
    if (!['SUPPLIER_BOOKING_FAILED', 'RECONCILIATION_REQUIRED'].includes(booking.status)) {
      return NextResponse.json({
        error: `Retry not safe: current status is '${booking.status}'`,
      }, { status: 409 })
    }
    if (booking.reconciliationAttempts >= 3) {
      return NextResponse.json({
        error: `Retry not safe: max attempts (3) reached. Use manual booking.`,
        attempts: booking.reconciliationAttempts,
      }, { status: 409 })
    }
    // Reset to PAYMENT_RECEIVED so the reconciliation cron or webhook can re-claim
    await prisma.activityBooking.update({
      where: { id: params.id },
      data: {
        status:                 'PAYMENT_RECEIVED',
        supplierConfirmingAt:   null,
        failureReason:          null,
        reconciliationAttempts: { increment: 1 },
        notes: `Admin retry requested by ${session.email ?? 'staff'}: ${notes ?? 'no note'}`,
      },
    })
    // Run reconcile immediately
    const outcome = await reconcileViatorBooking(params.id)
    return NextResponse.json({ outcome, bookingId: params.id, walzReference: booking.walzReference })
  }

  // ── add-note ──────────────────────────────────────────────────────────────
  if (action === 'add-note') {
    const updated = await prisma.activityBooking.update({
      where: { id: params.id },
      data:  { notes: notes ?? '' },
    })
    return NextResponse.json({ success: true, notes: updated.notes })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
