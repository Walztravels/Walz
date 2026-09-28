// lib/check-ins/policy.ts
//
// Check-In V2 — the single place that decides:
//   1. which country/currency a staff member's deduction policy resolves to
//   2. whether the deduction policy is financially "live" yet at all
//   3. whether a specific MISSED occurrence is eligible for a real deduction
//   4. how to idempotently create that one deduction row (cron-retry-safe)
//   5. how a Super Admin waives it (deduction becomes WAIVED; the missed
//      attendance record itself is never deleted or rewritten to CHECKED_IN)
//
// Nothing here infers attendance from admin/session/API/Inbox/Team-Hub
// activity — that decision is made by the caller (the cron + the manual
// check-in route) before this module is ever invoked. This module is only
// concerned with the FINANCIAL consequence of an already-decided MISSED
// occurrence.

import type { PrismaClient } from '@prisma/client'

export type CountryCode = 'NG' | 'GH'

/**
 * Resolve a staff member's deduction-policy country from their configured
 * IANA timezone — the same signal the rest of the check-in system already
 * uses to distinguish Ghana staff (see app/api/cron/check-ins/route.ts and
 * app/api/admin/check-ins/my/route.ts, both keyed off `Africa/Accra`).
 * Intentionally does NOT read Staff.country (audited as dead/unused) or
 * Staff.branch, to stay consistent with the one signal already proven to
 * be actually maintained for this population.
 */
export function resolveCountry(timezone: string | null | undefined): CountryCode {
  return timezone === 'Africa/Accra' ? 'GH' : 'NG'
}

/** "YYYY-MM" for a given date — the payroll period key used everywhere below. */
export function effectivePayrollPeriod(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export interface DeductionPolicyRow {
  country:  CountryCode
  currency: string
  amount:   number | null
  enabled:  boolean
}

export interface CheckInSettingsForPolicy {
  effectiveDeductionDate: Date | null
}

/**
 * Whether the deduction policy has any financial teeth at all for the given
 * occurrence date. False whenever:
 *   - no effectiveDeductionDate has been set yet (brief §19 — the policy
 *     stays completely inert, for every staff member, until a Super Admin
 *     explicitly opts in from a chosen date forward)
 *   - the occurrence predates that effective date (no retroactive backfill)
 */
export function isDeductionPolicyLive(
  settings: CheckInSettingsForPolicy | null | undefined,
  occurrenceDate: Date,
): boolean {
  if (!settings?.effectiveDeductionDate) return false
  return occurrenceDate.getTime() >= settings.effectiveDeductionDate.getTime()
}

export interface StaffEligibility {
  isActive:       boolean
  checkInTracked: boolean
  hireDate:       Date | null
}

/**
 * Employment-window eligibility for a specific occurrence date — handles
 * the "employment start/end date" and "inactive staff" edge cases (brief
 * §15). There is no employment END date field anywhere in this codebase
 * (audited — Staff has no termination/end-date column), so only the start
 * (hireDate) side is enforced; isActive covers the "no longer employed"
 * case in the only way the schema currently supports.
 */
export function isStaffEligibleForOccurrence(staff: StaffEligibility, occurrenceDate: Date): boolean {
  if (!staff.isActive) return false
  if (!staff.checkInTracked) return false
  if (staff.hireDate && occurrenceDate.getTime() < staff.hireDate.getTime()) return false
  return true
}

/**
 * Resolve the deduction amount/currency a MISSED occurrence should use,
 * or null when the country's policy is unconfigured/disabled — in which
 * case NO deduction is ever created (never guess an amount).
 */
export function resolveDeductionAmount(policy: DeductionPolicyRow | null | undefined): { amount: number; currency: string } | null {
  if (!policy) return null
  if (!policy.enabled) return null
  if (policy.amount === null || policy.amount === undefined) return null
  if (policy.amount <= 0) return null
  return { amount: policy.amount, currency: policy.currency }
}

/**
 * Idempotently create the ONE deduction row for a confirmed-missed
 * occurrence. Safe to call on every cron run for the same record — the
 * unique constraint on CheckInDeduction.checkInRecordId (backed by a real
 * DB unique index, prisma/migrations/staff_checkin_v2.sql) plus this
 * find-before-create guard means a second call is always a no-op.
 *
 * Returns the created row, the pre-existing row (idempotent replay), or
 * null when the occurrence is not eligible for any deduction at all
 * (policy inert, country unconfigured, staff outside policy, etc.).
 */
export async function ensureMissedCheckInDeduction(
  prisma: PrismaClient,
  params: {
    staffId:         string
    checkInRecordId: string
    windowStart:     Date
    timezone:        string | null | undefined
    settings:        CheckInSettingsForPolicy | null | undefined
    staff:           StaffEligibility
  },
): Promise<{ created: boolean; deduction: { id: string; amount: number; currency: string } | null }> {
  const { staffId, checkInRecordId, windowStart, timezone, settings, staff } = params

  // Already exists? (idempotent replay — cron retry, server restart, etc.)
  const existing = await (prisma as any).checkInDeduction.findUnique({
    where: { checkInRecordId },
    select: { id: true, amount: true, currency: true },
  })
  if (existing) return { created: false, deduction: existing }

  if (!isDeductionPolicyLive(settings, windowStart)) return { created: false, deduction: null }
  if (!isStaffEligibleForOccurrence(staff, windowStart)) return { created: false, deduction: null }

  const country = resolveCountry(timezone)
  const policyRow = await (prisma as any).checkInDeductionPolicy.findUnique({ where: { country } })
  const resolved = resolveDeductionAmount(policyRow)
  if (!resolved) return { created: false, deduction: null }

  try {
    const created = await (prisma as any).checkInDeduction.create({
      data: {
        staffId,
        checkInRecordId,
        reason:                 'MISSED_CHECK_IN',
        amount:                 resolved.amount,
        currency:               resolved.currency,
        status:                 'ACTIVE',
        effectivePayrollPeriod: effectivePayrollPeriod(windowStart),
        createdBy:              'system',
      },
      select: { id: true, amount: true, currency: true },
    })
    return { created: true, deduction: created }
  } catch (err: unknown) {
    // Unique-constraint race (two cron invocations overlapping) — treat as
    // an idempotent replay, not an error.
    const existingAfterRace = await (prisma as any).checkInDeduction.findUnique({
      where: { checkInRecordId },
      select: { id: true, amount: true, currency: true },
    })
    if (existingAfterRace) return { created: false, deduction: existingAfterRace }
    throw err
  }
}

export const WAIVER_REASONS = [
  'Approved meeting',
  'Technical issue',
  'Approved leave',
  'Emergency',
  'Management exception',
  'Other',
] as const
