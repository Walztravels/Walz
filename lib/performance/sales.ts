/**
 * Staff Performance Management — the SINGLE authoritative source of truth
 * for "what counts as a completed sale" and "how many days since a staff
 * member's last completed sale".
 *
 * ── AUTHORITATIVE SALE DEFINITION (documented per mission brief §3) ────────
 *
 *   A completed sale = a Booking row where
 *     status        = 'CONFIRMED'   (BookingStatus enum)
 *     AND paymentStatus = 'SUCCEEDED' (PaymentStatus enum)
 *   attributed to the staff member named in Booking.createdByStaffId,
 *   dated by Booking.updatedAt (Booking has no confirmedAt/paidAt column,
 *   so updatedAt is the closest available proxy for "when it became a
 *   confirmed, paid sale" — see LIMITATIONS below).
 *
 *   This mirrors the bar the codebase's OWN Revenue Intelligence route
 *   already uses and calls "Confirmed GBV" (app/api/admin/revenue/route.ts)
 *   and the "(authoritative)" comment on the newer Trip flow in
 *   lib/commercial/jade-analytics.ts — applied here to the one
 *   revenue-bearing model that actually carries a staff-attribution field.
 *
 * ── REJECTED CANDIDATES AND WHY ─────────────────────────────────────────────
 *   - Quote.acceptedAt / convertedAt — too early; several revenue rules in
 *     this codebase (lib/intelligence/revenue-rules.ts) explicitly treat an
 *     accepted-but-unconverted quote as a still-open opportunity, not a
 *     sale. Quote.createdBy is also inconsistently interpreted elsewhere in
 *     the codebase (sometimes an email, sometimes a StaffMember.id) — not
 *     safe to trust as identity for a disciplinary process.
 *   - Trip.status IN (CONFIRMED, COMPLETED) — the codebase's own newer,
 *     more complete revenue model, and explicitly labelled authoritative in
 *     code comments, but Trip has NO staff-attribution field at all. There
 *     is no reliable way to attribute a Trip to the staff member who made
 *     the sale.
 *   - Invoice.paidAt — Invoice.status is manually typed via a plain PATCH
 *     endpoint with no payment-webhook enforcement found anywhere in the
 *     codebase; trivially editable, not authoritative.
 *   - Commission — no Commission model exists in this schema at all.
 *   - PaymentLink.paidAt — genuinely webhook-verified money received, but
 *     it represents payment for a REQUEST (deposit, visa fee, etc.), not
 *     necessarily a completed sale of a bookable product, and its
 *     requestedBy staff may differ from who actually made the sale.
 *   - Lead.status = 'Deposit Paid' / 'Closed' — free-text, manually typed,
 *     too ambiguous to serve as a sales ledger.
 *   - Itinerary.status — free-text, no enforced enum, a proposal-stage
 *     document rather than a payment record.
 *
 * ── KNOWN LIMITATIONS (documented honestly, not silently assumed away) ─────
 *   1. Booking.updatedAt is not a dedicated "confirmedAt" timestamp — any
 *      unrelated edit to a CONFIRMED+SUCCEEDED booking row would shift its
 *      apparent sale date. No confirmedAt column exists to fix this without
 *      a Booking schema change, which is out of scope for this feature
 *      (Booking is a live, heavily-used table outside this feature's remit).
 *   2. Booking.createdByStaffId has no foreign key — a manual join against
 *      Staff.id is required and is what every query below does.
 *   3. Sales attribution before createdByStaffId was consistently populated
 *      cannot be distinguished from "genuinely zero sales" — see
 *      `hasAnyBookingEver` below, which callers use to flag a
 *      possible-attribution-gap warning rather than assuming poor
 *      performance for staff with a long tenure and zero recorded bookings.
 */

import prisma from '@/lib/db'

export const SALE_WHERE = {
  status: 'CONFIRMED' as const,
  paymentStatus: 'SUCCEEDED' as const,
}

export interface StaffSalesSummary {
  staffId: string
  lastCompletedSaleAt: Date | null
  daysSinceLastSale: number | null
  salesLast30: number
  salesLast90: number
  salesLast120: number
  salesCurrentYear: number
  /** Revenue attributed within the last 120 days, kept per currency —
   *  NEVER summed across currencies (matches the existing Revenue
   *  Intelligence / Staff Intelligence convention in this codebase). */
  revenueByCurrency: Record<string, number>
  /** True if this staff member has EVER had a CONFIRMED+SUCCEEDED
   *  booking attributed to them, at any point in time (not just the
   *  windows above). Used to distinguish "sold before, now cold" from
   *  "zero bookings ever recorded" (a possible attribution gap rather
   *  than a genuine performance signal) — see roles.ts / queue.ts. */
  hasAnyBookingEver: boolean
}

const DAY_MS = 86_400_000

function withinDays(rows: { updatedAt: Date }[], days: number, now: Date): number {
  const cutoff = now.getTime() - days * DAY_MS
  return rows.filter((r) => r.updatedAt.getTime() >= cutoff).length
}

/**
 * Full sales evidence for ONE staff member (used on the Staff Performance
 * Review screen, section C). Bounded to a 400-day window plus a separate
 * all-time existence/last-sale check, so this never does an unbounded
 * full-table scan per staff member.
 */
export async function computeStaffSalesSummary(
  staffId: string,
  now: Date = new Date(),
): Promise<StaffSalesSummary> {
  const [allTime, windowRows] = await Promise.all([
    prisma.booking.aggregate({
      where: { createdByStaffId: staffId, ...SALE_WHERE },
      _max: { updatedAt: true },
      _count: { _all: true },
    }),
    prisma.booking.findMany({
      where: {
        createdByStaffId: staffId,
        ...SALE_WHERE,
        updatedAt: { gte: new Date(now.getTime() - 400 * DAY_MS) },
      },
      select: { updatedAt: true, totalAmount: true, currency: true },
    }),
  ])

  const lastCompletedSaleAt = allTime._max.updatedAt ?? null
  const daysSinceLastSale = lastCompletedSaleAt
    ? Math.floor((now.getTime() - lastCompletedSaleAt.getTime()) / DAY_MS)
    : null

  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  const salesCurrentYear = windowRows.filter((r) => r.updatedAt >= yearStart).length

  const revenueByCurrency: Record<string, number> = {}
  const cutoff120 = now.getTime() - 120 * DAY_MS
  for (const r of windowRows) {
    if (r.updatedAt.getTime() < cutoff120) continue
    revenueByCurrency[r.currency] = (revenueByCurrency[r.currency] ?? 0) + r.totalAmount
  }

  return {
    staffId,
    lastCompletedSaleAt,
    daysSinceLastSale,
    salesLast30: withinDays(windowRows, 30, now),
    salesLast90: withinDays(windowRows, 90, now),
    salesLast120: withinDays(windowRows, 120, now),
    salesCurrentYear,
    revenueByCurrency,
    hasAnyBookingEver: allTime._count._all > 0,
  }
}

/**
 * Batch version for the review queue — runs the per-staff computation in
 * parallel. Intended for admin-dashboard-scale staff counts (tens to low
 * hundreds), not a high-frequency or high-volume path. If staff counts
 * grow substantially, replace with a set of prisma.booking.groupBy calls
 * keyed on createdByStaffId (documented here rather than implemented
 * pre-emptively, since no Booking index changes are made by this feature
 * — see the mission report's "known scaling note").
 */
export async function computeStaffSalesSummaries(
  staffIds: string[],
  now: Date = new Date(),
): Promise<Map<string, StaffSalesSummary>> {
  const results = await Promise.all(staffIds.map((id) => computeStaffSalesSummary(id, now)))
  return new Map(results.map((r) => [r.staffId, r]))
}

/** Count of completed sales strictly within an arbitrary [start, end]
 *  window — used when generating a warning document tied to a specific
 *  review period (which may differ from the rolling 30/60/90/120 windows
 *  shown on the queue/review screen). */
export async function computeSalesInPeriod(staffId: string, start: Date, end: Date): Promise<number> {
  return prisma.booking.count({
    where: { createdByStaffId: staffId, ...SALE_WHERE, updatedAt: { gte: start, lte: end } },
  })
}

/** Additional non-sales evidence (section D of the review screen).
 *  Deliberately narrow — only reuses fields this codebase already
 *  captures; never invents a metric Walz does not track. */
export interface StaffActivityEvidence {
  quotesCreated: number
  quotesAccepted: number
  leadsAssigned: number
}

export async function computeStaffActivityEvidence(
  staff: { id: string; email: string },
  periodStart: Date,
  periodEnd: Date,
): Promise<StaffActivityEvidence> {
  const [quotes, leadsAssigned] = await Promise.all([
    prisma.quote.findMany({
      where: {
        createdBy: { equals: staff.email, mode: 'insensitive' },
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: { acceptedAt: true, convertedAt: true },
    }).catch(() => []),
    prisma.lead.count({
      where: { assignedToId: staff.id, createdAt: { gte: periodStart, lte: periodEnd } },
    }).catch(() => 0),
  ])

  return {
    quotesCreated: quotes.length,
    quotesAccepted: quotes.filter((q) => q.acceptedAt || q.convertedAt).length,
    leadsAssigned,
  }
}
