// lib/jade-club/purchase-types.ts — Jade Travel Club Release 2B: shared
// purchase/checkout types.
//
// TypeScript-side enforcement layer mirroring the DB CHECK constraints in
// prisma/migrations/jade_travel_club_purchase_v2b.sql — this repo's
// convention: TEXT column + validated-in-TypeScript union, not a native
// Postgres enum (see lib/jade-club/types.ts's header for why).
//
// Two independent state machines — see docs/jade-2b-purchase-state-machine.md.

export const JADE_PURCHASE_PAYMENT_STATUSES = [
  'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED',
] as const
export type JadePurchasePaymentStatus = (typeof JADE_PURCHASE_PAYMENT_STATUSES)[number]

// PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION (added in the HIGH-severity
// race-condition remediation) is DELIBERATELY DISTINCT from
// FAILED_PERMANENTLY: FAILED_PERMANENTLY means "a mechanical retry MIGHT
// still succeed" (a transient technical failure exhausted its retries), so
// the admin "Retry Activation" action is gated on that status. This new
// status means the opposite — a human financial/lifecycle decision is
// required and a mechanical retry can NEVER succeed (e.g. a second,
// genuinely different, successfully-paid purchase for a membership that
// another purchase already activated first). Retry Activation must never
// be offered for this status — see lib/jade-club/purchase-activation.ts's
// adminResetForRetry, which structurally cannot target this status (its
// CAS only matches FAILED_PERMANENTLY).
export const JADE_PURCHASE_ACTIVATION_STATUSES = [
  'NOT_STARTED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', 'ACTIVATED',
  'FAILED_PERMANENTLY', 'PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION',
] as const
export type JadePurchaseActivationStatus = (typeof JADE_PURCHASE_ACTIVATION_STATUSES)[number]

export const JADE_PURCHASE_PROVIDERS = ['STRIPE'] as const
export type JadePurchaseProvider = (typeof JADE_PURCHASE_PROVIDERS)[number]

export function isJadePurchasePaymentStatus(value: unknown): value is JadePurchasePaymentStatus {
  return typeof value === 'string' && (JADE_PURCHASE_PAYMENT_STATUSES as readonly string[]).includes(value)
}

export function isJadePurchaseActivationStatus(value: unknown): value is JadePurchaseActivationStatus {
  return typeof value === 'string' && (JADE_PURCHASE_ACTIVATION_STATUSES as readonly string[]).includes(value)
}

export function isJadePurchaseProvider(value: unknown): value is JadePurchaseProvider {
  return typeof value === 'string' && (JADE_PURCHASE_PROVIDERS as readonly string[]).includes(value)
}

// Safe, machine-readable failure reasons only — NEVER a raw provider error
// string (which can contain card data hints, internal IDs, etc.). Every
// call site that sets JadeClubPurchase.failureReason must use one of these.
export const JADE_PURCHASE_FAILURE_REASONS = [
  'CARD_DECLINED',
  'SESSION_EXPIRED',
  'AMOUNT_MISMATCH',
  'CURRENCY_MISMATCH',
  'POLICY_NO_LONGER_ACTIVE',
  'DUPLICATE_ACTIVE_TERMS',
  'REFUNDED_BEFORE_ACTIVATION',
  'MAX_RETRIES_EXCEEDED',
  'UNKNOWN_ACTIVATION_ERROR',
  // CASE B of the race-condition remediation: a DIFFERENT, distinct,
  // successfully-paid purchase already activated this membership's terms
  // first. Machine-readable on purpose (not folded into DUPLICATE_ACTIVE_TERMS)
  // so the admin UI and any future automation can branch on "this needs a
  // refund/reconciliation decision" specifically, distinct from a generic
  // stale-guard collision. Always paired with activationStatus
  // PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION, never FAILED_PERMANENTLY.
  'DUPLICATE_PAID_MEMBERSHIP_PURCHASE',
] as const
export type JadePurchaseFailureReason = (typeof JADE_PURCHASE_FAILURE_REASONS)[number]

export function isJadePurchaseFailureReason(value: unknown): value is JadePurchaseFailureReason {
  return typeof value === 'string' && (JADE_PURCHASE_FAILURE_REASONS as readonly string[]).includes(value)
}

// The ONLY failure reasons a mechanical retry can plausibly resolve — every
// other reason represents a structural/business condition where retrying
// the same activation attempt will deterministically fail again. Used by
// the admin "Retry Activation" gate (defense-in-depth alongside the
// activationStatus check) — see purchase-activation.ts::adminResetForRetry.
export const RETRYABLE_ACTIVATION_FAILURE_REASONS: readonly JadePurchaseFailureReason[] = [
  'MAX_RETRIES_EXCEEDED',
  'UNKNOWN_ACTIVATION_ERROR',
]

export function isRetryableActivationFailureReason(value: unknown): boolean {
  return isJadePurchaseFailureReason(value) && RETRYABLE_ACTIVATION_FAILURE_REASONS.includes(value)
}
