// Recovery opportunity detection (Release 3A)
//
// Three detection functions — each called from the cron or event hooks.
// All are idempotent: safe to call multiple times without creating duplicates.
//
// Detection cadence:
//   Abandoned carts   — cron every 30 min
//   Supplier failures — cron every 5 min (piggybacked on activity-reconciliation)
//
// Failed payments are created reactively in the Stripe webhook, not in cron.

import prisma from '@/lib/db'
import { createOrUpdateOpportunity, resolveAssignment } from './opportunity'
import { calculatePriority } from './scoring'
import { createStaffNotification } from '@/lib/notifications/staff'

// ── Configuration ─────────────────────────────────────────────────────────────
const ABANDON_MINUTES = parseInt(process.env.CART_ABANDON_MINUTES ?? '60', 10)

// ── Abandoned cart detection ──────────────────────────────────────────────────
//
// Reuses the existing CartSession abandonment definition:
//   convertedAt IS NULL AND updatedAt < (now - ABANDON_MINUTES) AND totalAmount > 0
//
// Called from the recovery-detect cron.
export async function detectAbandonedCarts(): Promise<number> {
  if (process.env.RECOVERY_ENGINE_ENABLED !== 'true') return 0

  const threshold = new Date(Date.now() - ABANDON_MINUTES * 60 * 1000)

  const abandonedCarts = await prisma.cartSession.findMany({
    where: {
      convertedAt: null,
      totalAmount: { gt: 0 },
      updatedAt:   { lt: threshold },
    },
    select: {
      id:          true,
      sessionId:   true,
      userId:      true,
      leadId:      true,
      totalAmount: true,
      currency:    true,
    },
    take: 100,  // process in batches
  })

  let created = 0
  for (const cart of abandonedCarts) {
    const assignedToId = await resolveAssignment({ leadId: cart.leadId })
    const priority = calculatePriority({ type: 'ABANDONED_CART', amount: cart.totalAmount })

    await createOrUpdateOpportunity({
      type:         'ABANDONED_CART',
      reason:       `Cart inactive for over ${ABANDON_MINUTES} minutes — not converted`,
      priority,
      amount:       cart.totalAmount,
      currency:     cart.currency,
      userId:       cart.userId,
      leadId:       cart.leadId,
      cartSessionId: cart.id,
      assignedToId,
    })
    created++
  }

  return created
}

// ── Supplier failure detection ────────────────────────────────────────────────
//
// Scans ActivityBookings in SUPPLIER_BOOKING_FAILED or RECONCILIATION_REQUIRED
// that do not yet have an open RecoveryOpportunity (via dedupeKey).
// Called from the recovery-detect cron and from the activity-reconciliation cron.
export async function detectSupplierFailures(): Promise<number> {
  if (process.env.RECOVERY_ENGINE_ENABLED !== 'true') return 0

  const failedBookings = await prisma.activityBooking.findMany({
    where: {
      status: { in: ['SUPPLIER_BOOKING_FAILED', 'RECONCILIATION_REQUIRED'] },
    },
    select: {
      id:           true,
      status:       true,
      walzReference: true,
      activityTitle: true,
      totalAmount:  true,
      currency:     true,
      supplier:     true,
      clientName:   true,
      bookedByStaffId: true,
      convertedToLeadId: true,
      createdAt:    true,
    },
    take: 50,
  })

  let created = 0
  for (const booking of failedBookings) {
    const assignedToId = await resolveAssignment({
      leadId:            booking.convertedToLeadId,
      activityBookingId: booking.id,
    })

    const reason = booking.status === 'RECONCILIATION_REQUIRED'
      ? `Payment received — supplier confirmation timed out (${booking.supplier}). Reconciliation in progress.`
      : `Payment received — supplier ${booking.supplier} rejected booking. Customer needs resolution.`

    const oppId = await createOrUpdateOpportunity({
      type:              'SUPPLIER_FAILURE',
      reason,
      priority:          'URGENT',  // always URGENT — customer money held
      amount:            booking.totalAmount,
      currency:          booking.currency,
      activityBookingId: booking.id,
      bookingId:         null,
      assignedToId,
    })

    // Create staff notification for urgent supplier failures (idempotent via sourceId)
    if (assignedToId) {
      await createStaffNotification({
        staffId:    assignedToId,
        category:   'SUPPLIER',
        title:      `URGENT: Customer paid — supplier issue`,
        body:       `${booking.clientName}'s booking for ${booking.activityTitle ?? 'activity'} (${booking.walzReference}) is in ${booking.status}. Do NOT ask customer to pay again.`,
        important:  true,
        sourceId:   `recovery:supplier:${booking.id}`,
        sourceType: 'recovery',
        data:       { opportunityId: oppId, activityBookingId: booking.id, walzReference: booking.walzReference },
      })
    }

    created++
  }

  return created
}

// ── Incomplete trip detection ─────────────────────────────────────────────────
//
// Trips in DRAFT with >= MIN_ITEMS items or >= MIN_VALUE total cost, where the
// last update was more than INCOMPLETE_HOURS ago and no checkout has been started.
const INCOMPLETE_HOURS = parseInt(process.env.INCOMPLETE_TRIP_HOURS ?? '24', 10)
const INCOMPLETE_MIN_ITEMS = parseInt(process.env.INCOMPLETE_TRIP_MIN_ITEMS ?? '3', 10)
const INCOMPLETE_MIN_VALUE = parseInt(process.env.INCOMPLETE_TRIP_MIN_VALUE ?? '300', 10)

export async function detectIncompleteTrips(): Promise<number> {
  if (process.env.RECOVERY_ENGINE_ENABLED !== 'true') return 0

  const threshold = new Date(Date.now() - INCOMPLETE_HOURS * 60 * 60 * 1000)

  const candidateTrips = await prisma.trip.findMany({
    where: {
      status:    'DRAFT',
      updatedAt: { lt: threshold },
    },
    select: {
      id:          true,
      userId:      true,
      leadId:      true,
      destination: true,
      currency:    true,
      items:       { select: { cost: true, type: true } },
    },
    take: 50,
  })

  let created = 0
  for (const trip of candidateTrips) {
    const itemCount  = trip.items.length
    const totalValue = trip.items.reduce((sum, i) => sum + (i.cost ?? 0), 0)

    if (itemCount < INCOMPLETE_MIN_ITEMS && totalValue < INCOMPLETE_MIN_VALUE) continue

    const assignedToId = await resolveAssignment({ leadId: trip.leadId })
    const priority     = calculatePriority({ type: 'INCOMPLETE_TRIP', amount: totalValue })

    await createOrUpdateOpportunity({
      type:        'INCOMPLETE_TRIP',
      reason:      `Trip to ${trip.destination ?? 'destination'} has ${itemCount} items (value ~${Math.round(totalValue)} ${trip.currency ?? 'GBP'}) but no checkout started after ${INCOMPLETE_HOURS}h`,
      priority,
      amount:      totalValue > 0 ? totalValue : null,
      currency:    trip.currency,
      userId:      trip.userId,
      leadId:      trip.leadId,
      tripId:      trip.id,
      assignedToId,
    })
    created++
  }

  return created
}
