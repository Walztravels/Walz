/**
 * Staff Performance Management — role & eligibility rules.
 *
 * NO WARNING IS EVER GENERATED OR SENT AUTOMATICALLY SOLELY BECAUSE A
 * STAFF MEMBER HAS ZERO SALES. This module only classifies whether a
 * staff member should appear in the automatic review QUEUE (a management
 * signal) — it never creates a case, never drafts a warning, and never
 * takes any action. A Super Admin can still open "Review Performance" on
 * ANY staff member directly from their profile even if this module would
 * exclude them from the automatic queue.
 */

import type { Staff } from '@prisma/client'

/**
 * Roles with day-to-day sales/booking responsibility, per the RBAC role
 * catalogue in lib/rbac/roles.ts. Roles NOT in this list (visa_officer,
 * accountant, customer_support, operations_manager, general_manager,
 * senior_manager, super_admin) do not automatically appear in the
 * performance review queue — they can still be reviewed manually.
 *
 * This is a design interpretation of an ambiguous brief requirement
 * ("identify sales staff... do not have sales responsibilities should
 * not blindly appear") made in the audit phase; documented in the final
 * report for the Super Admin to adjust if the intended scope differs.
 */
export const SALES_ROLES = [
  'sales_agent',
  'sales_rep',
  'coordinator',
  'flight_staff',
  'tours_staff',
  'hotel_staff',
] as const

export type SalesRole = (typeof SALES_ROLES)[number]

export function isSalesRole(role: string): boolean {
  return (SALES_ROLES as readonly string[]).includes(role)
}

/** Minimum tenure (days) before a staff member is auto-surfaced for a
 *  zero/low-sales signal. Staff.hireDate is nullable and NOT backfilled —
 *  see eligibility() below for how the null case is handled. */
export const MIN_TENURE_DAYS = 120

export interface QueueEligibility {
  eligible: boolean
  reasons: string[] // human-readable reasons this staff member is excluded from (or flagged within) the automatic queue
  tenureUnknown: boolean
}

type EligibilityStaff = Pick<
  Staff,
  | 'id'
  | 'isActive'
  | 'role'
  | 'hireDate'
  | 'performanceReviewExempt'
  | 'performanceReviewExemptReason'
  | 'performanceReviewExemptUntil'
>

/**
 * Whether a staff member should be included in the AUTOMATIC performance
 * review queue. This never blocks a Super Admin from manually opening a
 * review on any individual staff member — it only governs the default
 * queue listing described in the brief (section 3: "handle staff who
 * joined <4 months ago / are on leave / non-sales roles / etc — these
 * should not blindly appear as warning candidates").
 */
export function evaluateQueueEligibility(staff: EligibilityStaff, now: Date = new Date()): QueueEligibility {
  const reasons: string[] = []

  if (!staff.isActive) {
    reasons.push('Staff member is inactive')
  }
  if (!isSalesRole(staff.role)) {
    reasons.push(`Role "${staff.role}" is not a sales-responsibility role`)
  }

  let tenureUnknown = false
  if (staff.hireDate) {
    const days = Math.floor((now.getTime() - staff.hireDate.getTime()) / 86_400_000)
    if (days < MIN_TENURE_DAYS) {
      reasons.push(`Joined ${days} day(s) ago — below the ${MIN_TENURE_DAYS}-day minimum tenure`)
    }
  } else {
    // No hireDate captured. We do NOT assume "recently hired" (which
    // would wrongly suppress a genuine long-tenured zero-sales signal)
    // — we surface the gap so a Super Admin can verify manually instead
    // of the system silently guessing either way.
    tenureUnknown = true
  }

  if (
    staff.performanceReviewExempt &&
    (!staff.performanceReviewExemptUntil || staff.performanceReviewExemptUntil > now)
  ) {
    reasons.push(
      `Marked exempt from performance review${staff.performanceReviewExemptReason ? `: ${staff.performanceReviewExemptReason}` : ''}`,
    )
  }

  return { eligible: reasons.length === 0, reasons, tenureUnknown }
}

export type PerformanceSignal = 'NONE' | 'MONITOR_30' | 'MONITOR_60' | 'MONITOR_90' | 'REVIEW_RECOMMENDED_120'

/**
 * Pure classification of a days-since-last-sale number into the
 * management SIGNAL bands from the brief. This is a descriptive label
 * only ("a management signal") — never an instruction, and the UI must
 * never render the forbidden phrase "Employee must be warned".
 */
export function classifySalesSignal(daysSinceLastSale: number | null): PerformanceSignal {
  if (daysSinceLastSale == null) return 'NONE'
  if (daysSinceLastSale >= 120) return 'REVIEW_RECOMMENDED_120'
  if (daysSinceLastSale >= 90) return 'MONITOR_90'
  if (daysSinceLastSale >= 60) return 'MONITOR_60'
  if (daysSinceLastSale >= 30) return 'MONITOR_30'
  return 'NONE'
}

export const SIGNAL_LABEL: Record<PerformanceSignal, string> = {
  NONE: 'No signal',
  MONITOR_30: 'No completed sale for 30 days',
  MONITOR_60: 'No completed sale for 60 days',
  MONITOR_90: 'No completed sale for 90 days',
  REVIEW_RECOMMENDED_120: 'PERFORMANCE REVIEW RECOMMENDED',
}
