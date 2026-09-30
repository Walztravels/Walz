// lib/jade-club/purchase-activation.ts — Jade Travel Club Release 2B:
// provider-agnostic purchase state transitions + the activation
// orchestration shared by the webhook handler and the reconciliation job.
//
// Every state transition here is a CAS (`updateMany` keyed on the CURRENT
// expected status + a `.count === 1` check), never a blind `.update()` —
// see docs/jade-2b-purchase-state-machine.md for the full design and why
// this makes duplicate/concurrent delivery a clean no-op.
//
// This file is deliberately Stripe-type-agnostic (plain primitives in,
// plain result unions out) so it is trivially unit-testable without a real
// Stripe SDK object, and so the SAME functions serve both the webhook
// route (app/api/webhooks/jade-club/route.ts) and the reconciliation job
// (lib/jade-club/purchase-reconciliation.ts).
//
// ── activateMembershipTerms is called EXACTLY as published — untouched ──
// This file never modifies lib/jade-club/entitlements.ts. It constructs a
// synthetic, non-interactive AdminSession (SYSTEM_ADMIN below) purely to
// satisfy that function's existing signature and 'jade_club.manage'
// permission check — see SYSTEM_ADMIN's own comment for the one accepted,
// documented trade-off this implies (activateMembershipTerms's OWN
// internal per-call ActivityLog write will fail its staffId foreign key
// for this synthetic id and be silently caught by THAT function's own
// existing `.catch()` — this file compensates with its own ActivityLog
// entries below, which use `staffId: null`, a valid value).
//
// ── Freeze / boundary compliance ─────────────────────────────────────────
// Never imports lib/payments/authority.ts. Never reads/writes
// WalzRewardsMembership or WalzMilesTransaction.

import prisma from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { AdminSession } from '@/lib/admin-auth'
import { activateMembershipTerms } from './entitlements'
import { applyPurchaseTierBump } from './membership'
import { isJadeCommercialTier } from './commercial-types'
import type { JadeClubTier } from './types'
import { isJadePurchaseFailureReason, type JadePurchaseFailureReason } from './purchase-types'

export const MAX_ACTIVATION_ATTEMPTS = 5
const PENDING_REFERENCE_PREFIX = 'pending:'

// A synthetic, permission-bearing session used ONLY to call
// activateMembershipTerms/applyPurchaseTierBump from an automated context
// (no interactive staff member is involved in a customer-triggered
// purchase). `id` does not correspond to any real Staff row — see this
// file's header comment.
const SYSTEM_ADMIN: AdminSession = {
  id: 'SYSTEM_JADE_CLUB_PURCHASE',
  email: 'system@walztravels.com',
  name: 'Jade Club Purchase (system)',
  roleTitle: 'System',
  sendingEmail: 'system@walztravels.com',
  signatureTagline: null,
  role: 'super_admin',
  staffRole: 'super_admin',
  permissions: { 'jade_club.manage': true, 'jade_club': true },
  branch: 'HQ',
  department: 'system',
  isActive: true,
}

async function writeAuditLog(action: string, purchaseId: string, detail: string, after: Record<string, unknown>): Promise<void> {
  await prisma.activityLog.create({
    data: {
      staffId: null,
      staffName: 'Jade Club Purchase (system)',
      staffRole: 'system',
      action,
      module: 'jade_club',
      entityType: 'JadeClubPurchase',
      entityId: purchaseId,
      detail,
      before: Prisma.JsonNull,
      after,
    },
  }).catch((e) => console.warn('[jade-club] activity log write failed:', e))
}

// ─── Payment-side transitions (called from the webhook) ───────────────────

export type RecordCheckoutPaidOutcome =
  | { outcome: 'PURCHASE_NOT_FOUND' }
  | { outcome: 'DUPLICATE_IGNORED' }
  | { outcome: 'AMOUNT_MISMATCH' }
  | { outcome: 'CONFIRMED_PENDING_ACTIVATION'; purchaseId: string }

/**
 * Looks up the purchase by (provider, providerReference) ONLY — never by a
 * client-echoed id. `purchaseIdHint` (sourced from Stripe's own verified
 * session.metadata, never the browser) is used only to self-heal the rare
 * crash window between creating the purchase row and patching its
 * providerReference from the placeholder — see
 * lib/jade-club/purchase.ts::createJadeClubCheckout. The heal itself is a
 * CAS: it only ever patches a row that is STILL carrying our own
 * placeholder reference, so it can never hijack an unrelated purchase.
 */
export async function recordCheckoutSessionPaid(params: {
  providerReference: string
  amountTotalMinor: number
  currency: string
  purchaseIdHint?: string | null
}): Promise<RecordCheckoutPaidOutcome> {
  let purchase = await prisma.jadeClubPurchase.findFirst({
    where: { provider: 'STRIPE', providerReference: params.providerReference },
  })

  if (!purchase && params.purchaseIdHint) {
    const healCas = await prisma.jadeClubPurchase.updateMany({
      where: { id: params.purchaseIdHint, provider: 'STRIPE', providerReference: { startsWith: PENDING_REFERENCE_PREFIX } },
      data: { providerReference: params.providerReference },
    })
    if (healCas.count === 1) {
      purchase = await prisma.jadeClubPurchase.findUnique({ where: { id: params.purchaseIdHint } })
    }
  }

  if (!purchase) return { outcome: 'PURCHASE_NOT_FOUND' }
  if (purchase.paymentStatus !== 'PENDING') return { outcome: 'DUPLICATE_IGNORED' }

  const amountMatches = params.amountTotalMinor === purchase.amountMinor
  const currencyMatches = params.currency.toUpperCase() === purchase.currency.toUpperCase()

  if (!amountMatches || !currencyMatches) {
    // Money genuinely moved — record SUCCEEDED truthfully, but NEVER
    // activate a mismatched charge. Fails safe: staff-visible, never
    // silently reconciled, never silently granted.
    const reason: JadePurchaseFailureReason = amountMatches ? 'CURRENCY_MISMATCH' : 'AMOUNT_MISMATCH'
    const cas = await prisma.jadeClubPurchase.updateMany({
      where: { id: purchase.id, paymentStatus: 'PENDING' },
      data: { paymentStatus: 'SUCCEEDED', paidAt: new Date(), activationStatus: 'FAILED_PERMANENTLY', failureReason: reason },
    })
    if (cas.count === 1) {
      await writeAuditLog(
        'JADE_CLUB_PURCHASE_AMOUNT_MISMATCH', purchase.id,
        'Paid amount/currency did not match the checkout amount — activation blocked for manual review.',
        { expectedMinor: purchase.amountMinor, expectedCurrency: purchase.currency, gotMinor: params.amountTotalMinor, gotCurrency: params.currency },
      )
    }
    return { outcome: 'AMOUNT_MISMATCH' }
  }

  const paidCas = await prisma.jadeClubPurchase.updateMany({
    where: { id: purchase.id, paymentStatus: 'PENDING' },
    data: { paymentStatus: 'SUCCEEDED', paidAt: new Date() },
  })
  if (paidCas.count !== 1) return { outcome: 'DUPLICATE_IGNORED' } // lost a race to a concurrent delivery

  // Best-effort — if this loses a race (already advanced by a concurrent
  // delivery, which cannot really happen right after we just won the
  // paidCas above, but fails safe regardless), attemptActivation below
  // still reads the CURRENT state and behaves correctly either way.
  await prisma.jadeClubPurchase.updateMany({
    where: { id: purchase.id, activationStatus: 'NOT_STARTED' },
    data: { activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' },
  })

  return { outcome: 'CONFIRMED_PENDING_ACTIVATION', purchaseId: purchase.id }
}

/** checkout.session.expired / a definitive card decline. */
export async function recordCheckoutSessionFailed(providerReference: string, reason: JadePurchaseFailureReason): Promise<void> {
  await prisma.jadeClubPurchase.updateMany({
    where: { provider: 'STRIPE', providerReference, paymentStatus: 'PENDING' },
    data: { paymentStatus: 'FAILED', failureReason: reason },
  })
}

/** charge.refunded, resolved back to our providerReference (Checkout Session id) by the caller. */
export async function recordRefund(providerReference: string): Promise<void> {
  const cas = await prisma.jadeClubPurchase.updateMany({
    where: { provider: 'STRIPE', providerReference, paymentStatus: 'SUCCEEDED' },
    data: { paymentStatus: 'REFUNDED' },
  })
  if (cas.count === 1) {
    const purchase = await prisma.jadeClubPurchase.findFirst({ where: { provider: 'STRIPE', providerReference } })
    if (purchase) {
      await writeAuditLog('JADE_CLUB_PURCHASE_REFUNDED', purchase.id, 'Payment refunded by provider.', { activationStatusAtRefund: purchase.activationStatus })
    }
  }
}

// ─── Activation orchestration (shared by webhook + reconciliation) ────────

export type AttemptActivationOutcome =
  | { outcome: 'ALREADY_ACTIVATED' }
  | { outcome: 'NOT_READY' }
  | { outcome: 'ACTIVATED'; termsId: string }
  | { outcome: 'FAILED_RETRYABLE'; error: string }
  | { outcome: 'FAILED_PERMANENTLY'; reason: JadePurchaseFailureReason }

/**
 * Idempotent. Safe to call any number of times for the same purchaseId —
 * from the webhook right after payment confirmation, or from the
 * reconciliation job on a schedule. Calls applyPurchaseTierBump (2B, new)
 * then activateMembershipTerms (2A, UNTOUCHED) in that order, exactly as
 * the mission requires.
 */
export async function attemptActivation(purchaseId: string): Promise<AttemptActivationOutcome> {
  const purchase = await prisma.jadeClubPurchase.findUnique({ where: { id: purchaseId } })
  if (!purchase) return { outcome: 'NOT_READY' }

  if (purchase.activationStatus === 'ACTIVATED') return { outcome: 'ALREADY_ACTIVATED' }
  if (purchase.activationStatus !== 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING') return { outcome: 'NOT_READY' }

  // Re-check payment status immediately before every attempt — a refund
  // landing between payment confirmation and activation must stop
  // activation cold (design doc scenario 7).
  if (purchase.paymentStatus === 'REFUNDED') {
    await markFailedPermanently(purchase.id, 'REFUNDED_BEFORE_ACTIVATION')
    return { outcome: 'FAILED_PERMANENTLY', reason: 'REFUNDED_BEFORE_ACTIVATION' }
  }
  if (purchase.paymentStatus !== 'SUCCEEDED') return { outcome: 'NOT_READY' }

  if (!isJadeCommercialTier(purchase.tier)) {
    await markFailedPermanently(purchase.id, 'UNKNOWN_ACTIVATION_ERROR')
    return { outcome: 'FAILED_PERMANENTLY', reason: 'UNKNOWN_ACTIVATION_ERROR' }
  }

  const attemptRow = await prisma.jadeClubPurchase.update({
    where: { id: purchase.id },
    data: { activationAttempts: { increment: 1 } },
    select: { activationAttempts: true },
  })

  try {
    // Re-read the policy fresh. Its scalar fields are immutable once ACTIVE
    // (see lib/jade-club/commercial-policy.ts), so this is not the same
    // thing as re-resolving "the current ACTIVE policy for this scope" —
    // we always activate against purchase.policyId, the exact policy the
    // member paid for (see design doc, "why policyVersion is copied at
    // checkout-creation time").
    const policy = await prisma.jadeClubCommercialPolicy.findUnique({ where: { id: purchase.policyId } })
    if (!policy) throw new Error('POLICY_ROW_MISSING')
    if (policy.status !== 'ACTIVE') {
      await markFailedPermanently(purchase.id, 'POLICY_NO_LONGER_ACTIVE')
      return { outcome: 'FAILED_PERMANENTLY', reason: 'POLICY_NO_LONGER_ACTIVE' }
    }

    await applyPurchaseTierBump({ userId: purchase.userId, tier: purchase.tier as JadeClubTier, durationMonths: policy.durationMonths })

    const membership = await prisma.jadeClubMembership.findUnique({ where: { userId: purchase.userId } })
    if (!membership) throw new Error('MEMBERSHIP_ROW_MISSING_AFTER_TIER_BUMP')

    const activation = await activateMembershipTerms(
      SYSTEM_ADMIN,
      membership.id,
      purchase.policyId,
      `Jade Club purchase ${purchase.id} — payment verified via ${purchase.provider}:${purchase.providerReference}`,
      'PURCHASE',
    )

    const cas = await prisma.jadeClubPurchase.updateMany({
      where: { id: purchase.id, activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' },
      data: { activationStatus: 'ACTIVATED', membershipId: membership.id, membershipTermsId: activation.termsId, activatedAt: new Date() },
    })
    if (cas.count !== 1) {
      // A concurrent attempt for this SAME purchase finished first —
      // harmless, not an error.
      return { outcome: 'ALREADY_ACTIVATED' }
    }

    await writeAuditLog(
      'JADE_CLUB_PURCHASE_ACTIVATED', purchase.id,
      `Activated ${purchase.tier} membership via purchase after ${attemptRow.activationAttempts} attempt(s).`,
      { membershipId: membership.id, termsId: activation.termsId },
    )

    return { outcome: 'ACTIVATED', termsId: activation.termsId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // activateMembershipTerms's OWN existing guard string (untouched) —
    // treat as non-retryable (design doc scenario 10).
    if (message.includes('already has an unexpired commercial terms period')) {
      await markFailedPermanently(purchase.id, 'DUPLICATE_ACTIVE_TERMS')
      return { outcome: 'FAILED_PERMANENTLY', reason: 'DUPLICATE_ACTIVE_TERMS' }
    }

    console.error('[jade-club/purchase-activation] attempt failed for', purchase.id, ':', message)

    if (attemptRow.activationAttempts >= MAX_ACTIVATION_ATTEMPTS) {
      await markFailedPermanently(purchase.id, 'MAX_RETRIES_EXCEEDED')
      return { outcome: 'FAILED_PERMANENTLY', reason: 'MAX_RETRIES_EXCEEDED' }
    }
    return { outcome: 'FAILED_RETRYABLE', error: message }
  }
}

async function markFailedPermanently(purchaseId: string, reason: JadePurchaseFailureReason): Promise<void> {
  const cas = await prisma.jadeClubPurchase.updateMany({
    where: { id: purchaseId, activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' },
    data: { activationStatus: 'FAILED_PERMANENTLY', failureReason: reason },
  })
  if (cas.count === 1) {
    await writeAuditLog('JADE_CLUB_PURCHASE_ACTIVATION_FAILED_PERMANENTLY', purchaseId, `Activation permanently failed: ${reason}`, { reason })
  }
}

// Re-exported for the admin "Retry Activation" route, so a stuck row can be
// reset out of FAILED_PERMANENTLY back into the retryable state by an
// explicit, audited, reason-required staff action — never automatically.
export async function adminResetForRetry(admin: AdminSession, purchaseId: string, reason: string): Promise<void> {
  const cleanReason = (reason ?? '').trim()
  if (!cleanReason) throw new Error('A reason is required to retry a stuck activation')

  const cas = await prisma.jadeClubPurchase.updateMany({
    where: { id: purchaseId, activationStatus: 'FAILED_PERMANENTLY', paymentStatus: 'SUCCEEDED' },
    data: { activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', failureReason: null, activationAttempts: 0 },
  })
  if (cas.count !== 1) {
    throw new Error('This purchase is not in a FAILED_PERMANENTLY + SUCCEEDED state — nothing to retry')
  }

  await prisma.activityLog.create({
    data: {
      staffId: admin.id, staffName: admin.name, staffRole: admin.role,
      action: 'JADE_CLUB_PURCHASE_ACTIVATION_RETRY_RESET', module: 'jade_club',
      entityType: 'JadeClubPurchase', entityId: purchaseId, detail: cleanReason,
      before: { activationStatus: 'FAILED_PERMANENTLY' },
      after: { activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' },
    },
  }).catch((e) => console.warn('[jade-club] activity log write failed:', e))
}

export function safeFailureReason(candidate: unknown): JadePurchaseFailureReason {
  return isJadePurchaseFailureReason(candidate) ? candidate : 'UNKNOWN_ACTIVATION_ERROR'
}
