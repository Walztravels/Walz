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

export const JADE_PURCHASE_ACTIVATION_STATUSES = [
  'NOT_STARTED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', 'ACTIVATED', 'FAILED_PERMANENTLY',
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
] as const
export type JadePurchaseFailureReason = (typeof JADE_PURCHASE_FAILURE_REASONS)[number]

export function isJadePurchaseFailureReason(value: unknown): value is JadePurchaseFailureReason {
  return typeof value === 'string' && (JADE_PURCHASE_FAILURE_REASONS as readonly string[]).includes(value)
}
