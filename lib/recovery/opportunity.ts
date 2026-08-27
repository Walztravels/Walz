// Recovery opportunity CRUD (Release 3A + 3C)
//
// All writes go through createOrUpdateOpportunity() — idempotent via dedupeKey.
// One active opportunity per (type, primary entity). Subsequent cron runs update
// lastActivityAt but do not create duplicates.
//
// 3C: initial nextActionAt is set on CREATE from schedule.initialNextActionAt(type)
// unless the caller provides an explicit nextActionAt.

import prisma from '@/lib/db'
import { makeDedupeKey, type CreateOpportunityOpts, type RecoveryStatus } from './types'
import { initialNextActionAt } from './schedule'

// ── Create or update (idempotent) ─────────────────────────────────────────────
//
// If an OPEN/CONTACTED/IN_PROGRESS opportunity already exists for this dedupeKey,
// updates lastActivityAt. If it's RECOVERED/LOST/DISMISSED, creates a fresh one
// (new opportunity for a returning event — e.g. cart abandoned again after being dismissed).
export async function createOrUpdateOpportunity(
  opts: CreateOpportunityOpts
): Promise<string> {
  const primaryEntityId = (
    opts.cartSessionId ??
    opts.activityBookingId ??
    opts.bookingId ??
    opts.quoteId ??
    opts.tripId ??
    opts.leadId ??
    opts.userId ??
    'unknown'
  )
  const dedupeKey = makeDedupeKey(opts.type, primaryEntityId)

  const existing = await prisma.recoveryOpportunity.findUnique({
    where:  { dedupeKey },
    select: { id: true, status: true },
  })

  const activeStatuses: RecoveryStatus[] = ['OPEN', 'CONTACTED', 'IN_PROGRESS']

  if (existing && activeStatuses.includes(existing.status as RecoveryStatus)) {
    // Refresh last-seen timestamp without overwriting status/priority
    await prisma.recoveryOpportunity.update({
      where: { id: existing.id },
      data:  { lastActivityAt: new Date() },
    })
    return existing.id
  }

  // Create fresh opportunity (or replace a closed one by deleting and recreating)
  if (existing) {
    await prisma.recoveryOpportunity.delete({ where: { id: existing.id } })
  }

  const opp = await prisma.recoveryOpportunity.create({
    data: {
      dedupeKey,
      type:              opts.type,
      status:            'OPEN',
      priority:          opts.priority,
      reason:            opts.reason,
      amount:            opts.amount   ?? null,
      currency:          opts.currency ?? null,
      userId:            opts.userId   ?? null,
      leadId:            opts.leadId   ?? null,
      tripId:            opts.tripId   ?? null,
      cartSessionId:     opts.cartSessionId     ?? null,
      quoteId:           opts.quoteId           ?? null,
      bookingId:         opts.bookingId         ?? null,
      activityBookingId: opts.activityBookingId ?? null,
      assignedToId:      opts.assignedToId      ?? null,
      // 3C: schedule initial customer contact unless caller overrides
      nextActionAt:      opts.nextActionAt !== undefined
        ? opts.nextActionAt
        : initialNextActionAt(opts.type),
      detectedAt:        new Date(),
      lastActivityAt:    new Date(),
    },
  })
  return opp.id
}

// ── Mark a cart opportunity as RECOVERED when payment succeeds ────────────────
export async function markCartRecovered(
  cartSessionId: string,
  recoveredAmount: number,
  currency: string,
  recoveredBookingId?: string,
): Promise<void> {
  await prisma.recoveryOpportunity.updateMany({
    where: {
      cartSessionId,
      type:   'ABANDONED_CART',
      status: { in: ['OPEN', 'CONTACTED', 'IN_PROGRESS'] },
    },
    data: {
      status:            'RECOVERED',
      recoveredAt:       new Date(),
      recoveredAmount,
      recoveredCurrency: currency,
      recoveredBookingId: recoveredBookingId ?? null,
    },
  })
}

// ── Mark a supplier-failure opportunity as RECOVERED when reconciliation confirms
export async function markSupplierFailureRecovered(
  activityBookingId: string,
  supplierRef: string,
): Promise<void> {
  await prisma.recoveryOpportunity.updateMany({
    where: {
      activityBookingId,
      type:   'SUPPLIER_FAILURE',
      status: { in: ['OPEN', 'CONTACTED', 'IN_PROGRESS'] },
    },
    data: {
      status:            'RECOVERED',
      recoveredAt:       new Date(),
      recoveredBookingId: supplierRef,
    },
  })
}

// ── Resolve assignment — inherit from Lead.assignedToId or booking staff ───────
//
// Order of precedence:
//   1. Lead.assignedToId (if leadId is known)
//   2. ActivityBooking.bookedByStaffId (if activityBookingId is known)
//   3. null → shows in general queue
export async function resolveAssignment(opts: {
  leadId?:           string | null
  activityBookingId?: string | null
}): Promise<string | null> {
  if (opts.leadId) {
    const lead = await prisma.lead.findUnique({
      where:  { id: opts.leadId },
      select: { assignedToId: true },
    })
    if (lead?.assignedToId) return lead.assignedToId
  }

  if (opts.activityBookingId) {
    const booking = await prisma.activityBooking.findUnique({
      where:  { id: opts.activityBookingId },
      select: { bookedByStaffId: true },
    })
    if (booking?.bookedByStaffId) return booking.bookedByStaffId
  }

  return null
}
