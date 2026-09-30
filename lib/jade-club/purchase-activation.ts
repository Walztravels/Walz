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
// Never imports the flight Miles redemption-freeze module. Never
// reads/writes WalzRewardsMembership or WalzMilesTransaction.

import prisma from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { AdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { activateMembershipTerms } from './entitlements'
import { applyPurchaseTierBump } from './membership'
import { isJadeCommercialTier } from './commercial-types'
import type { JadeClubTier } from './types'
import { isJadePurchaseFailureReason, RETRYABLE_ACTIVATION_FAILURE_REASONS, type JadePurchaseFailureReason } from './purchase-types'

export const MAX_ACTIVATION_ATTEMPTS = 5
const PENDING_REFERENCE_PREFIX = 'pending:'
const UNEXPIRED_TERMS_GUARD_MESSAGE = 'already has an unexpired commercial terms period'

function requireManage(admin: AdminSession) {
  if (!hasPermission(admin, 'jade_club.manage')) {
    throw new Error('FORBIDDEN: missing jade_club.manage permission')
  }
}
function requireReason(reason: unknown): string {
  if (typeof reason !== 'string' || !reason.trim()) throw new Error('A reason is required for this change')
  return reason.trim()
}

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
      after: after as Prisma.InputJsonValue,
    },
  }).catch((e) => console.warn('[jade-club] activity log write failed:', e))
}

// ─── Operational alerts ─────────────────────────────────────────────────
//
// A passive ActivityLog/DB-status row is not enough for a situation that
// genuinely needs a human to act soon (money charged twice, or a refund
// landing on an already-activated membership) — this repo's established
// pattern for "staff needs to see this" is StaffNotification (the model
// backing the real admin notification inbox at app/admin/notifications,
// the same one lib/notifications/staff.ts and the Jade Daily Brief cron
// route both write to — see app/api/cron/jade-daily-brief/route.ts for the
// reference shape this mirrors). No StaffNotificationCategory fits
// "finance/reconciliation" exactly yet, so BOOKING (the closest existing
// commercial-adjacent category) is used, with a descriptive title/body and
// `sourceType: 'jade_club_reconciliation'` making the concept explicit.
// Idempotent per (staffId, sourceId) via check-then-create, mirroring the
// daily-brief route's own delivery-idempotency pattern.
async function raiseJadeClubOperationalAlert(params: { sourceId: string; title: string; body: string }): Promise<void> {
  try {
    const staffRows = await prisma.staff.findMany({
      where: { isActive: true },
      select: { id: true, role: true, permissions: true },
    })
    const recipients = staffRows.filter((s) => hasPermission({ role: s.role, permissions: s.permissions }, 'jade_club.manage'))

    for (const staff of recipients) {
      const already = await prisma.staffNotification.findFirst({
        where: { staffId: staff.id, sourceId: params.sourceId },
        select: { id: true },
      })
      if (already) continue

      await prisma.staffNotification.create({
        data: {
          staffId: staff.id,
          category: 'BOOKING',
          title: params.title,
          body: params.body,
          important: true,
          sourceId: params.sourceId,
          sourceType: 'jade_club_reconciliation',
        },
      })
    }
  } catch (e) {
    console.warn('[jade-club] failed to raise staff operational alert:', e)
  }
}

async function raiseDuplicatePaidPurchaseAlert(purchaseId: string, winningPurchaseId: string | null): Promise<void> {
  await raiseJadeClubOperationalAlert({
    sourceId: `jade-club-duplicate-purchase:${purchaseId}`,
    title: 'Jade Club: duplicate paid membership purchase needs reconciliation',
    body: winningPurchaseId
      ? `Purchase ${purchaseId} was successfully paid but could not be activated because a different purchase (${winningPurchaseId}) already activated this membership first. Financial reconciliation (normally a refund) is required — do not retry activation, it cannot succeed.`
      : `Purchase ${purchaseId} was successfully paid but could not be activated because this membership already has an unexpired commercial terms period from another source. Financial reconciliation is required — do not retry activation, it cannot succeed.`,
  })
}

async function raiseRefundAfterActivationAlert(purchaseId: string, activationStatusAtRefund: string): Promise<void> {
  await raiseJadeClubOperationalAlert({
    sourceId: `jade-club-refund-after-activation:${purchaseId}`,
    title: 'Jade Club: refund recorded after membership activation',
    body: `Purchase ${purchaseId} was refunded by the payment provider after its membership was already activated (activationStatus at refund time: ${activationStatusAtRefund}). Financial reconciliation and a lifecycle review are required. No membership/terms/benefit data has been automatically changed — this alert exists specifically so a human decides what to do.`,
  })
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

      // A refund landing on an ALREADY-ACTIVATED purchase is exactly the
      // "needs a human financial/lifecycle decision now" situation a
      // passive DB row isn't enough for — raise a real staff alert. This
      // deliberately does NOT auto-revoke membership/terms/benefit
      // snapshots/entitlements — that needs separate lifecycle-rule
      // approval (see docs/jade-2b-purchase-state-machine.md, scenario 8).
      if (purchase.activationStatus === 'ACTIVATED') {
        await raiseRefundAfterActivationAlert(purchase.id, purchase.activationStatus)
      }
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
  // CASE B of the race-condition remediation — a DIFFERENT, distinct,
  // successfully-paid purchase for the SAME membership won the race and
  // already holds the membership's one unexpired terms period. This
  // purchase can NEVER be mechanically retried into activating (retrying
  // would just hit the exact same guard again) — it requires an explicit
  // human financial/lifecycle decision (normally a refund). Structurally
  // distinct from FAILED_PERMANENTLY so "Retry Activation" can never be
  // offered for it.
  | { outcome: 'REQUIRES_RECONCILIATION'; reason: JadePurchaseFailureReason }

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

    // activateMembershipTerms's OWN existing guard string (untouched) fires
    // in TWO genuinely different situations that must NOT be collapsed
    // into one outcome (HIGH-severity fix — see
    // docs/jade-2b-purchase-state-machine.md's race-condition addendum):
    //
    //   CASE A — another worker processing THIS SAME purchase already won
    //   the race and committed the full ACTIVATED CAS first. This purchase
    //   is NOT a failure — it IS activated, just via the other call. It
    //   must end as ALREADY_ACTIVATED, never FAILED_PERMANENTLY.
    //
    //   CASE B — a DIFFERENT, distinct, successfully-paid purchase for the
    //   SAME membership won the race. THIS purchase can never activate —
    //   but it must land in the distinct, non-retryable
    //   PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION state (a human decision,
    //   normally a refund), never a generic permanent-failure label that
    //   would misleadingly suggest nothing happened financially.
    if (message.includes(UNEXPIRED_TERMS_GUARD_MESSAGE)) {
      return resolveUnexpiredTermsCollision(purchase.id, purchase.userId)
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

/**
 * Disambiguates activateMembershipTerms's "already has an unexpired
 * commercial terms period" guard into CASE A (same purchase, a concurrent
 * attempt already won) vs CASE B (a different, distinct, successfully-paid
 * purchase won). Never writes to a purchase row that isn't in
 * PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING (every CAS below is gated on
 * that), so an already-ACTIVATED row's activationStatus/membershipTermsId
 * can never be touched by this function — invariants #1/#2 hold
 * structurally, not just by convention.
 */
async function resolveUnexpiredTermsCollision(purchaseId: string, userId: string): Promise<AttemptActivationOutcome> {
  // Re-read fresh — the winning concurrent call (CASE A) may have already
  // committed its CAS to ACTIVATED between our failed attempt and now.
  const fresh = await prisma.jadeClubPurchase.findUnique({ where: { id: purchaseId } })
  if (!fresh) return { outcome: 'NOT_READY' }
  if (fresh.activationStatus === 'ACTIVATED') return { outcome: 'ALREADY_ACTIVATED' }
  if (fresh.activationStatus !== 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING') {
    // Already moved on (e.g. a concurrent call already routed it to
    // REQUIRES_RECONCILIATION) — report that current state rather than
    // re-deriving it.
    return fresh.activationStatus === 'PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION'
      ? { outcome: 'REQUIRES_RECONCILIATION', reason: (fresh.failureReason as JadePurchaseFailureReason) ?? 'DUPLICATE_ACTIVE_TERMS' }
      : { outcome: 'NOT_READY' }
  }

  const membership = await prisma.jadeClubMembership.findUnique({ where: { userId } })
  if (!membership) {
    await markFailedPermanently(purchaseId, 'UNKNOWN_ACTIVATION_ERROR')
    return { outcome: 'FAILED_PERMANENTLY', reason: 'UNKNOWN_ACTIVATION_ERROR' }
  }

  const winningTerms = await prisma.jadeClubMembershipTerms.findFirst({
    where: { membershipId: membership.id, expiresAt: { gt: new Date() } },
    orderBy: { activatedAt: 'desc' },
  })

  if (!winningTerms) {
    // The guard tripped a moment ago but no unexpired terms exist now
    // (e.g. it expired in the interim, or a transient read anomaly) —
    // treat as retryable rather than guessing.
    return { outcome: 'FAILED_RETRYABLE', error: 'Unexpired-terms guard fired but no unexpired terms found on re-read' }
  }

  const winningPurchase = await prisma.jadeClubPurchase.findFirst({ where: { membershipTermsId: winningTerms.id } })

  if (winningPurchase && winningPurchase.id === purchaseId) {
    // CASE A, caught at an unusual moment: the winning terms ARE this same
    // purchase's own (a concurrent call for this exact purchase created
    // them) but the final CAS to ACTIVATED on this row hasn't landed yet —
    // self-heal by completing it, rather than reporting a false failure.
    const cas = await prisma.jadeClubPurchase.updateMany({
      where: { id: purchaseId, activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' },
      data: { activationStatus: 'ACTIVATED', membershipId: membership.id, membershipTermsId: winningTerms.id, activatedAt: new Date() },
    })
    if (cas.count === 1) {
      await writeAuditLog('JADE_CLUB_PURCHASE_ACTIVATED', purchaseId, 'Activated (self-healed after a concurrent-attempt race on the same purchase).', { membershipId: membership.id, termsId: winningTerms.id })
    }
    return { outcome: 'ACTIVATED', termsId: winningTerms.id }
  }

  // CASE B: a genuinely different claimant already holds the membership's
  // one unexpired terms slot — either a distinct, different PURCHASE
  // (DUPLICATE_PAID_MEMBERSHIP_PURCHASE — the scenario this fix targets),
  // or a non-purchase source (ADMIN_GRANT/PROMOTION — DUPLICATE_ACTIVE_TERMS,
  // kept for that narrower edge case). Either way this purchase can NEVER
  // mechanically retry into activating — it needs a human financial/
  // lifecycle decision, so it goes to PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION,
  // NEVER FAILED_PERMANENTLY (that status is reserved for "retry might work").
  const reason: JadePurchaseFailureReason = winningPurchase ? 'DUPLICATE_PAID_MEMBERSHIP_PURCHASE' : 'DUPLICATE_ACTIVE_TERMS'

  const cas = await prisma.jadeClubPurchase.updateMany({
    where: { id: purchaseId, activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' },
    data: { activationStatus: 'PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION', failureReason: reason },
  })
  if (cas.count === 1) {
    await writeAuditLog(
      'JADE_CLUB_PURCHASE_REQUIRES_RECONCILIATION', purchaseId,
      winningPurchase
        ? `A different, distinct, already-SUCCEEDED purchase (${winningPurchase.id}) activated this membership's terms first — this purchase was also paid but could not be activated. Requires financial reconciliation (normally a refund).`
        : `This membership already has an unexpired commercial terms period from a non-purchase source — this purchase was paid but could not be activated. Requires reconciliation.`,
      { winningPurchaseId: winningPurchase?.id ?? null, winningTermsId: winningTerms.id, reason },
    )
    await raiseDuplicatePaidPurchaseAlert(purchaseId, winningPurchase?.id ?? null)
  }

  return { outcome: 'REQUIRES_RECONCILIATION', reason }
}

// Re-exported for the admin "Retry Activation" route, so a stuck row can be
// reset out of FAILED_PERMANENTLY back into the retryable state by an
// explicit, audited, reason-required staff action — never automatically.
export async function adminResetForRetry(admin: AdminSession, purchaseId: string, reason: string): Promise<void> {
  // Defense-in-depth (A5 remediation): the permission check now lives HERE
  // too, not only in the calling route — matching entitlements.ts's own
  // requireManage() convention, so this function is safe to call from any
  // future call site without relying on that caller to have checked first.
  requireManage(admin)
  const cleanReason = requireReason(reason)

  // Reason-allowlist gate (defense-in-depth alongside the structural
  // activationStatus separation): retry must be refused for ANY reason a
  // mechanical retry cannot possibly resolve — a superseded policy, a
  // duplicate-terms collision, etc. — even if such a row somehow ended up
  // under FAILED_PERMANENTLY. PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION
  // rows (Case B of the race fix) are ALREADY excluded structurally, since
  // this CAS only ever matches activationStatus 'FAILED_PERMANENTLY'.
  const cas = await prisma.jadeClubPurchase.updateMany({
    where: {
      id: purchaseId,
      activationStatus: 'FAILED_PERMANENTLY',
      paymentStatus: 'SUCCEEDED',
      failureReason: { in: [...RETRYABLE_ACTIVATION_FAILURE_REASONS] },
    },
    data: { activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', failureReason: null, activationAttempts: 0 },
  })
  if (cas.count !== 1) {
    throw new Error(
      'This purchase is not eligible for a mechanical retry — it must be FAILED_PERMANENTLY, paymentStatus SUCCEEDED, ' +
      'and have a transient failure reason. A structural/business condition (e.g. a duplicate purchase or a ' +
      'superseded policy) needs a different, human reconciliation action, not a retry.',
    )
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
