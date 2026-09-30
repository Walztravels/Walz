// lib/jade-club/purchase-activation.ts — Jade Travel Club Release 2B:
// provider-agnostic purchase state transitions + the ATOMIC activation
// orchestration shared by the webhook handler and the reconciliation job.
//
// ── STRUCTURAL REMEDIATION (post-independent-review, Phase 1) ───────────
// The activation sequence below is ONE top-level interactive transaction,
// exactly matching the approved model:
//   1. SELECT JadeClubPurchase ... FOR UPDATE
//   2. Re-read authoritative purchase state
//   3. Direct, authoritative lookup: JadeClubMembershipTerms by unique
//      purchaseId = currentPurchase.id (Correction 2 — NOT a reverse
//      pointer/status inference; NOT dependent on expiresAt being in the
//      future)
//   4. If found: idempotent same-purchase recovery — reconcile, never
//      re-create
//   5. Require paymentStatus === SUCCEEDED (a branch, not an exception)
//   6. Lock the membership (this file's OWN pre-check, reusing the exact
//      same lock statement/query shape createMembershipTermsCore itself
//      uses moments later — entitlements.ts is untouched)
//   7. Re-check for an unexpired terms period on the membership
//   8. If a DIFFERENT unexpired terms period exists (this purchase LOSES):
//      explicit branch (Correction 3 — NOT throw/catch) ->
//      PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION -> commit normally.
//      CANONICAL MEMBERSHIP STATE (tier/status/terms/snapshots/
//      entitlements) IS NEVER MUTATED ON THIS PATH — see the "winner
//      determined before mutation" note below.
//   9-11. Otherwise (this purchase WINS): apply the tier bump — ONLY NOW,
//      never speculatively before step 8's determination — then create
//      JadeClubMembershipTerms (source: 'PURCHASE', purchaseId:
//      currentPurchase.id) + benefit snapshots + entitlement slots/events
//      — all via lib/jade-club/entitlements.ts's shared
//      createMembershipTermsCore, which takes `tx` and opens no
//      transactions of its own, and is completely unmodified by this fix
//   12. Update the SAME purchase row (activationStatus: ACTIVATED,
//       membershipTermsId) — SAME transaction, SAME commit as 9-11
//   13. Commit
//
// NO POST-COMMIT PURCHASE-ATTRIBUTION WRITE EXISTS ANYWHERE IN THIS FILE —
// every write to JadeClubPurchase for the activation path happens inside
// the SAME `prisma.$transaction` callback that also creates the terms.
//
// ── WINNER DETERMINED BEFORE ANY CANONICAL STATE MUTATION (narrow fix,
// independent-review HIGH finding) ──────────────────────────────────────
// applyPurchaseTierBump (the ONLY function anywhere in this codebase that
// mutates JadeClubMembership.tier/status from the automated purchase
// flow — adminAdjustMembership is the one other tier-mutating path, and
// it is a wholly separate, interactive, admin-only mechanism never
// invoked by this file) is called ONLY after step 7's collision check has
// already confirmed this purchase wins. It is never called speculatively
// before that determination. Previously it ran BEFORE the collision
// check (to satisfy createMembershipTermsCore's own internal
// policy-tier-matches-membership-tier guard) — with two DIFFERENT-TIER
// purchases racing the same membership, the loser's tier bump could still
// land and permanently diverge from the tier of the terms the winner
// actually got issued. This is now structurally impossible: a losing
// purchase's transaction branch (step 8) never calls
// applyPurchaseTierBump at all.
//
// ── LOCK ORDER INVARIANT (read this before touching this file) ──────────
// Whenever a transaction in this codebase holds BOTH a JadeClubPurchase
// row lock AND the JadeClubMembership row lock, the PURCHASE lock is
// ALWAYS acquired FIRST, the membership lock SECOND — NEVER the reverse.
// attemptActivation (below) is the only function that takes both:
// purchase lock at the top of its transaction, membership lock moments
// later inside createMembershipTermsCore. recordRefund (below) only ever
// takes the purchase lock. A future feature that needs both locks in one
// transaction MUST follow this same order or it can deadlock against
// attemptActivation.
//
// Every non-activation state transition here (recordCheckoutSessionPaid,
// recordCheckoutSessionFailed) keeps its existing CAS (`updateMany` keyed
// on the CURRENT expected status + a `.count === 1` check) — that pattern
// already correctly handles duplicate/concurrent webhook delivery for a
// single boolean-ish PENDING -> SUCCEEDED transition, and the mission does
// not ask for it to be converted to the heavier lock+transaction treatment
// reserved for the more complex activation step.
//
// ── entitlements.ts / membership.ts are called via their SHARED CORES ───
// createMembershipTermsCore (entitlements.ts) and applyPurchaseTierBump
// (membership.ts) both take `tx` and open zero transactions of their own
// — this file owns the ONE top-level transaction for the whole activation
// sequence. See entitlements.ts's own header for the 2A-compatibility
// proof (activateMembershipTerms, the admin wrapper, is unaffected).
//
// ── Freeze / boundary compliance ─────────────────────────────────────────
// Never imports the flight Miles redemption-freeze module. Never
// reads/writes WalzRewardsMembership or WalzMilesTransaction.

import prisma from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { AdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { createMembershipTermsCore, type Tx } from './entitlements'
import { applyPurchaseTierBump, ensureMembershipInTx } from './membership'
import { isJadeCommercialTier } from './commercial-types'
import type { JadeClubTier } from './types'
import { isJadePurchaseFailureReason, RETRYABLE_ACTIVATION_FAILURE_REASONS, type JadePurchaseFailureReason } from './purchase-types'

export const MAX_ACTIVATION_ATTEMPTS = 5
const PENDING_REFERENCE_PREFIX = 'pending:'

// ── Fail-closed invariant guard (final correction) ──────────────────────
//
// This is NOT a business-outcome error — it is a bug detector. It fires
// ONLY if createMembershipTermsCore reports a collision AFTER
// attemptActivation's own pre-check has already proven (under the SAME
// still-held membership row lock) that no collision exists, and AFTER
// applyPurchaseTierBump has already run. That combination is supposed to
// be structurally impossible (the lock is held continuously across both
// checks, so no other transaction could have raced in between) — if it
// ever fires anyway, an assumption behind this design was wrong
// somewhere, and the correct response is to fail loudly and roll back
// EVERYTHING this transaction did, never to quietly reconcile it as if it
// were a normal collision. Named/shaped per this repo's existing
// custom-error convention (see lib/fx/types.ts's NgnRateUnavailableError).
export class JadePurchaseActivationInvariantError extends Error {
  readonly code = 'JADE_PURCHASE_ACTIVATION_INVARIANT_VIOLATION'
  constructor(message: string) {
    super(message)
    this.name = 'JadePurchaseActivationInvariantError'
  }
}

function requireManage(admin: AdminSession) {
  if (!hasPermission(admin, 'jade_club.manage')) {
    throw new Error('FORBIDDEN: missing jade_club.manage permission')
  }
}
function requireReason(reason: unknown): string {
  if (typeof reason !== 'string' || !reason.trim()) throw new Error('A reason is required for this change')
  return reason.trim()
}

async function writeAuditLog(client: Tx, action: string, purchaseId: string, detail: string, after: Record<string, unknown>): Promise<void> {
  await client.activityLog.create({
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
  }).catch((e: unknown) => console.warn('[jade-club] activity log write failed:', e))
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
//
// Takes the SAME `tx` as the surrounding transaction (structural
// remediation) so the alert is co-committed atomically with the state
// transition it documents — but its own internal try/catch means an
// alert-write failure never aborts the (far more important) state
// transition it's attached to.
async function raiseJadeClubOperationalAlert(client: Tx, params: { sourceId: string; title: string; body: string }): Promise<void> {
  try {
    const staffRows = await client.staff.findMany({
      where: { isActive: true },
      select: { id: true, role: true, permissions: true },
    })
    const recipients = staffRows.filter((s) => hasPermission({ role: s.role, permissions: s.permissions }, 'jade_club.manage'))

    for (const staff of recipients) {
      const already = await client.staffNotification.findFirst({
        where: { staffId: staff.id, sourceId: params.sourceId },
        select: { id: true },
      })
      if (already) continue

      await client.staffNotification.create({
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

async function raiseDuplicatePaidPurchaseAlert(client: Tx, purchaseId: string, winningPurchaseId: string | null): Promise<void> {
  await raiseJadeClubOperationalAlert(client, {
    sourceId: `jade-club-duplicate-purchase:${purchaseId}`,
    title: 'Jade Club: duplicate paid membership purchase needs reconciliation',
    body: winningPurchaseId
      ? `Purchase ${purchaseId} was successfully paid but could not be activated because a different purchase (${winningPurchaseId}) already activated this membership first. Financial reconciliation (normally a refund) is required — do not retry activation, it cannot succeed.`
      : `Purchase ${purchaseId} was successfully paid but could not be activated because this membership already has an unexpired commercial terms period from another source. Financial reconciliation is required — do not retry activation, it cannot succeed.`,
  })
}

async function raiseRefundAfterActivationAlert(client: Tx, purchaseId: string, activationStatusAtRefund: string): Promise<void> {
  await raiseJadeClubOperationalAlert(client, {
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
 *
 * Not converted to the lock+transaction pattern (see this file's header)
 * — this is a single boolean-ish PENDING -> SUCCEEDED transition already
 * correctly handled by the existing CAS.
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
        prisma as unknown as Tx, 'JADE_CLUB_PURCHASE_AMOUNT_MISMATCH', purchase.id,
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

/**
 * charge.refunded, resolved back to our providerReference (Checkout
 * Session id) by the caller.
 *
 * STRUCTURAL REMEDIATION — refund/activation serialization: this function
 * now locks the SAME purchase row (`SELECT ... FOR UPDATE`) inside its own
 * transaction, so a refund landing concurrently with attemptActivation for
 * the SAME purchase is serialized by Postgres itself — whichever
 * transaction's lock acquisition wins goes first; the other blocks until
 * the first commits, then re-reads the (now up to date) row. This is the
 * ONLY function besides attemptActivation that locks JadeClubPurchase —
 * it never also locks JadeClubMembership, so the lock-order invariant
 * (purchase before membership) is trivially satisfied here.
 */
export async function recordRefund(providerReference: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Lock by the natural key directly — avoids a TOCTOU gap between a
    // separate lookup-by-reference and acquiring the lock.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM jade_club_purchases WHERE provider = 'STRIPE' AND provider_reference = ${providerReference} FOR UPDATE
    `
    if (locked.length === 0) return // no such purchase — nothing to refund

    const purchase = await tx.jadeClubPurchase.findUnique({ where: { id: locked[0].id } })
    if (!purchase) return
    if (purchase.paymentStatus !== 'SUCCEEDED') return // already refunded, or never succeeded — idempotent no-op

    await tx.jadeClubPurchase.update({ where: { id: purchase.id }, data: { paymentStatus: 'REFUNDED' } })
    await writeAuditLog(tx, 'JADE_CLUB_PURCHASE_REFUNDED', purchase.id, 'Payment refunded by provider.', { activationStatusAtRefund: purchase.activationStatus })

    // A refund landing on an ALREADY-ACTIVATED purchase is exactly the
    // "needs a human financial/lifecycle decision now" situation a
    // passive DB row isn't enough for — raise a real staff alert. This
    // deliberately does NOT auto-revoke membership/terms/benefit
    // snapshots/entitlements — that needs separate lifecycle-rule
    // approval (see docs/jade-2b-purchase-state-machine.md, scenario 8).
    if (purchase.activationStatus === 'ACTIVATED') {
      await raiseRefundAfterActivationAlert(tx, purchase.id, purchase.activationStatus)
    }
  })
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
 * reconciliation job on a schedule.
 *
 * ATOMIC — see this file's header for the full 13-step sequence. Steps
 * 1-13 (purchase lock through purchase finalization) are ONE
 * `prisma.$transaction` — there is no window in which terms/snapshots/
 * entitlements exist without the purchase row also reflecting ACTIVATED,
 * and no window in which the purchase reflects ACTIVATED without the
 * terms/snapshots/entitlements existing (database invariant #7).
 *
 * The activationAttempts counter is bumped in its OWN small, always-
 * committed statement BEFORE the main transaction — deliberately NOT
 * inside it, so a genuine technical failure that rolls back the main
 * transaction does not also erase the fact that an attempt was made
 * (otherwise the same failure could repeat forever without ever tripping
 * MAX_ACTIVATION_ATTEMPTS).
 */
export async function attemptActivation(purchaseId: string): Promise<AttemptActivationOutcome> {
  // Cheap, lock-free pre-check so a no-op call (already terminal) never
  // bumps the attempt counter at all.
  const precheck = await prisma.jadeClubPurchase.findUnique({ where: { id: purchaseId }, select: { activationStatus: true, failureReason: true } })
  if (!precheck) return { outcome: 'NOT_READY' }
  if (precheck.activationStatus === 'ACTIVATED') return { outcome: 'ALREADY_ACTIVATED' }
  if (precheck.activationStatus === 'PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION') {
    return { outcome: 'REQUIRES_RECONCILIATION', reason: safeFailureReason(precheck.failureReason) }
  }
  if (precheck.activationStatus !== 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING') return { outcome: 'NOT_READY' }

  // Independent, always-committed statement — survives a later rollback
  // of the main attempt below, so MAX_ACTIVATION_ATTEMPTS is enforced
  // correctly even if the exact same technical failure repeats every time.
  const attemptRow = await prisma.jadeClubPurchase.update({
    where: { id: purchaseId },
    data: { activationAttempts: { increment: 1 } },
    select: { activationAttempts: true },
  })

  try {
    return await prisma.$transaction(async (tx) => {
      // ── Step 1: lock the PURCHASE row FIRST (lock-order invariant). ──
      await tx.$queryRaw`SELECT id FROM jade_club_purchases WHERE id = ${purchaseId} FOR UPDATE`

      // ── Step 2: re-read authoritative purchase state, under the lock. ──
      const purchase = await tx.jadeClubPurchase.findUnique({ where: { id: purchaseId } })
      if (!purchase) return { outcome: 'NOT_READY' } as const

      if (purchase.activationStatus === 'ACTIVATED') return { outcome: 'ALREADY_ACTIVATED' } as const
      if (purchase.activationStatus === 'PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION') {
        return { outcome: 'REQUIRES_RECONCILIATION', reason: safeFailureReason(purchase.failureReason) } as const
      }
      if (purchase.activationStatus !== 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING') return { outcome: 'NOT_READY' } as const

      // ── Step 3 (Correction 2): direct, authoritative same-purchase lookup. ──
      // purchaseId is @unique on JadeClubMembershipTerms — this is the
      // SINGLE source of truth for "did THIS purchase already create its
      // terms?". It does NOT depend on expiresAt (a purchase's terms can
      // legitimately be historically expired and still be that exact
      // purchase's own terms — see Test A), a reverse pointer on the
      // purchase row, the membership's current tier, or any client/webhook
      // state.
      const ownTerms = await tx.jadeClubMembershipTerms.findFirst({ where: { purchaseId: purchase.id } })
      if (ownTerms) {
        // ── Step 4: idempotent same-purchase recovery — reconcile, never re-create. ──
        // We only ever reach this branch with activationStatus still
        // PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING (the ACTIVATED case
        // already returned earlier above), so this row always needs its
        // ACTIVATED/membershipTermsId reconciled here — a concurrent
        // attempt for this exact purchase must have already created
        // `ownTerms` without this row's own finalization step (step 12)
        // having landed yet.
        await tx.jadeClubPurchase.update({
          where: { id: purchase.id },
          data: {
            activationStatus: 'ACTIVATED',
            membershipId: ownTerms.membershipId,
            membershipTermsId: ownTerms.id,
            activatedAt: purchase.activatedAt ?? new Date(),
          },
        })
        return { outcome: 'ACTIVATED', termsId: ownTerms.id } as const
      }

      // ── Step 5: payment-status branch — NOT an exception. ──
      if (purchase.paymentStatus === 'REFUNDED') {
        await tx.jadeClubPurchase.update({ where: { id: purchase.id }, data: { activationStatus: 'FAILED_PERMANENTLY', failureReason: 'REFUNDED_BEFORE_ACTIVATION' } })
        await writeAuditLog(tx, 'JADE_CLUB_PURCHASE_ACTIVATION_FAILED_PERMANENTLY', purchase.id, 'Activation permanently failed: REFUNDED_BEFORE_ACTIVATION', { reason: 'REFUNDED_BEFORE_ACTIVATION' })
        return { outcome: 'FAILED_PERMANENTLY', reason: 'REFUNDED_BEFORE_ACTIVATION' } as const
      }
      if (purchase.paymentStatus !== 'SUCCEEDED') return { outcome: 'NOT_READY' } as const

      if (!isJadeCommercialTier(purchase.tier)) {
        await tx.jadeClubPurchase.update({ where: { id: purchase.id }, data: { activationStatus: 'FAILED_PERMANENTLY', failureReason: 'UNKNOWN_ACTIVATION_ERROR' } })
        await writeAuditLog(tx, 'JADE_CLUB_PURCHASE_ACTIVATION_FAILED_PERMANENTLY', purchase.id, 'Activation permanently failed: UNKNOWN_ACTIVATION_ERROR (invalid tier)', { reason: 'UNKNOWN_ACTIVATION_ERROR' })
        return { outcome: 'FAILED_PERMANENTLY', reason: 'UNKNOWN_ACTIVATION_ERROR' } as const
      }

      // Re-read the policy fresh. Its scalar fields are immutable once
      // ACTIVE (see lib/jade-club/commercial-policy.ts), so this is NOT
      // the same thing as re-resolving "the current ACTIVE policy for
      // this scope" — we always activate against purchase.policyId, the
      // exact policy the member paid for.
      const policy = await tx.jadeClubCommercialPolicy.findUnique({ where: { id: purchase.policyId } })
      if (!policy) {
        await tx.jadeClubPurchase.update({ where: { id: purchase.id }, data: { activationStatus: 'FAILED_PERMANENTLY', failureReason: 'UNKNOWN_ACTIVATION_ERROR' } })
        await writeAuditLog(tx, 'JADE_CLUB_PURCHASE_ACTIVATION_FAILED_PERMANENTLY', purchase.id, 'Activation permanently failed: UNKNOWN_ACTIVATION_ERROR (policy row missing)', { reason: 'UNKNOWN_ACTIVATION_ERROR' })
        return { outcome: 'FAILED_PERMANENTLY', reason: 'UNKNOWN_ACTIVATION_ERROR' } as const
      }
      if (policy.status !== 'ACTIVE') {
        await tx.jadeClubPurchase.update({ where: { id: purchase.id }, data: { activationStatus: 'FAILED_PERMANENTLY', failureReason: 'POLICY_NO_LONGER_ACTIVE' } })
        await writeAuditLog(tx, 'JADE_CLUB_PURCHASE_ACTIVATION_FAILED_PERMANENTLY', purchase.id, 'Activation permanently failed: POLICY_NO_LONGER_ACTIVE', { reason: 'POLICY_NO_LONGER_ACTIVE' })
        return { outcome: 'FAILED_PERMANENTLY', reason: 'POLICY_NO_LONGER_ACTIVE' } as const
      }

      // get-or-create — mirrors the fact that applyPurchaseTierBump used to
      // implicitly create this row (via its own former pre-collision-check
      // call). A brand-new customer's very first purchase must not fail
      // here just because no membership row exists yet.
      const membership = await ensureMembershipInTx(tx, purchase.userId)

      // ── NARROW FIX (independent review — HIGH finding): "winner" must be
      // determined BEFORE any canonical membership state is mutated, never
      // speculatively-then-compensated. A purchase that does not win
      // activation must not mutate JadeClubMembership.tier — not even
      // transiently — because with two DIFFERENT-TIER purchases racing the
      // same membership, a speculative pre-collision-check tier bump could
      // leave membership.tier reflecting the LOSING purchase's tier while
      // the actually-issued terms/benefits belong to the WINNER.
      //
      // This pre-check locks the membership and re-reads its unexpired
      // terms using the EXACT SAME lock statement and query shape
      // lib/jade-club/entitlements.ts::createMembershipTermsCore uses as
      // its own first two operations — entitlements.ts itself is NOT
      // modified; this is a read-only, side-effect-free determination of
      // winner status, reusing the identical lock/collision-check pattern
      // rather than editing the shared core. Because this transaction
      // already holds the membership row's FOR UPDATE lock from this
      // point forward, createMembershipTermsCore's own (unchanged) lock+
      // recheck moments later is guaranteed to observe the SAME "no
      // collision" state — no other transaction can have raced in between
      // (any transaction targeting the same membership row blocks on this
      // exact lock until this one commits or rolls back).
      await tx.$queryRaw`SELECT id FROM jade_club_memberships WHERE id = ${membership.id} FOR UPDATE`
      const preCheckNow = new Date()
      const conflictingUnexpiredTerms = await tx.jadeClubMembershipTerms.findFirst({
        where: { membershipId: membership.id, expiresAt: { gt: preCheckNow } },
        orderBy: { activatedAt: 'desc' },
      })

      if (conflictingUnexpiredTerms) {
        // ── LOSER — branch, not exception (Correction 3, unchanged). Membership
        // tier/status is NEVER touched on this path — the fix. ──
        const reason: JadePurchaseFailureReason = conflictingUnexpiredTerms.purchaseId ? 'DUPLICATE_PAID_MEMBERSHIP_PURCHASE' : 'DUPLICATE_ACTIVE_TERMS'
        await tx.jadeClubPurchase.update({ where: { id: purchase.id }, data: { activationStatus: 'PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION', failureReason: reason } })
        await writeAuditLog(
          tx, 'JADE_CLUB_PURCHASE_REQUIRES_RECONCILIATION', purchase.id,
          conflictingUnexpiredTerms.purchaseId
            ? `A different, distinct, already-SUCCEEDED purchase (${conflictingUnexpiredTerms.purchaseId}) activated this membership's terms first — this purchase was also paid but could not be activated. Requires financial reconciliation (normally a refund). This purchase's membership tier was NEVER mutated.`
            : `This membership already has an unexpired commercial terms period from a non-purchase source — this purchase was paid but could not be activated. Requires reconciliation. This purchase's membership tier was NEVER mutated.`,
          { winningPurchaseId: conflictingUnexpiredTerms.purchaseId, winningTermsId: conflictingUnexpiredTerms.id, reason },
        )
        await raiseDuplicatePaidPurchaseAlert(tx, purchase.id, conflictingUnexpiredTerms.purchaseId)
        return { outcome: 'REQUIRES_RECONCILIATION', reason } as const
      }

      // ── WINNER — confirmed. Only NOW does canonical membership state change. ──
      await applyPurchaseTierBump(tx, { userId: purchase.userId, tier: purchase.tier as JadeClubTier, durationMonths: policy.durationMonths })

      // ── Steps 6-11: shared core — same lock discipline, same validation
      // order, same guard behavior as 2A's activateMembershipTerms. Its own
      // internal collision check is now provably redundant (we already
      // proved "no collision" above, under the SAME still-held lock) but
      // is deliberately left completely unmodified — it remains the sole
      // authoritative creator of JadeClubMembershipTerms, exactly as
      // accepted. ──
      const core = await createMembershipTermsCore(tx, {
        membershipId: membership.id, policyId: purchase.policyId, source: 'PURCHASE', purchaseId: purchase.id,
      })

      if (!core.ok) {
        // FAIL CLOSED (final correction — independent review): this is the
        // "provably redundant" re-check above turning out NOT to have been
        // redundant after all — an internal invariant violation, not a
        // business collision. Throw, do NOT branch to
        // PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION, do NOT write anything
        // to the purchase row, do NOT attempt to manually revert the tier
        // bump above. Throwing here lets Postgres/Prisma roll back
        // EVERYTHING this transaction did (the tier bump, any purchase-row
        // mutation, any terms/snapshot/entitlement writes) — the database
        // transaction is the correct, simplest mechanism for "an
        // unexpected invariant failed, undo it all," and a hand-rolled
        // compensating write here would only add a second way for this
        // exact class of bug to go wrong. This throw is NEVER caught
        // anywhere inside this transaction callback — it propagates
        // straight out of `prisma.$transaction`, where the outer catch
        // below treats it as a technical failure (never as ACTIVATED,
        // never as REQUIRES_RECONCILIATION).
        throw new JadePurchaseActivationInvariantError(
          `Collision detected after membership tier mutation under purchase/member locks (purchaseId=${purchase.id}, membershipId=${membership.id})`,
        )
      }

      // ── Steps 9-12: finalize — SAME transaction, SAME commit. ──
      await tx.jadeClubPurchase.update({
        where: { id: purchase.id },
        data: { activationStatus: 'ACTIVATED', membershipId: membership.id, membershipTermsId: core.termsId, activatedAt: new Date() },
      })
      await writeAuditLog(
        tx, 'JADE_CLUB_PURCHASE_ACTIVATED', purchase.id,
        `Activated ${purchase.tier} membership via purchase after ${attemptRow.activationAttempts} attempt(s).`,
        { membershipId: membership.id, termsId: core.termsId },
      )

      return { outcome: 'ACTIVATED', termsId: core.termsId } as const
    })
  } catch (err) {
    // Genuine, unexpected technical failure (Correction 3 — real
    // throw/catch, reserved EXCLUSIVELY for this case): the transaction
    // above rolled back completely — no terms, no snapshots, no
    // entitlements, no purchase-row mutation from this attempt survive.
    const message = err instanceof Error ? err.message : String(err)
    console.error('[jade-club/purchase-activation] attempt failed for', purchaseId, ':', message)

    // Secondary, optional diagnostic (final correction) — ONLY after the
    // transaction above has already fully rolled back, NEVER from inside
    // it (a write from inside would itself be undone by the rollback) and
    // NEVER before the outcome is known. Safe identifiers only — purchase
    // id, membership id (both already logged in the error message
    // constructed above, never any payment/card/PII data) plus the
    // error's own `code` and this operation's name.
    if (err instanceof JadePurchaseActivationInvariantError) {
      console.error('[jade-club/purchase-activation] INVARIANT VIOLATION (fail-closed, rolled back):', {
        purchaseId, code: err.code, operation: 'attemptActivation',
      })
      await raiseJadeClubOperationalAlert(prisma as unknown as Tx, {
        sourceId: `jade-club-activation-invariant-violation:${purchaseId}`,
        title: 'Jade Club: internal invariant violation during purchase activation (rolled back)',
        body: `Purchase ${purchaseId} hit an internal invariant violation during activation (code: ${err.code}) — the entire attempt was rolled back automatically (no tier change, no terms/entitlements were created). This indicates a bug, not a normal duplicate-purchase collision, and needs engineering attention.`,
      }).catch((e) => console.warn('[jade-club] failed to raise invariant-violation alert:', e))
    }

    if (attemptRow.activationAttempts >= MAX_ACTIVATION_ATTEMPTS) {
      const cas = await prisma.jadeClubPurchase.updateMany({
        where: { id: purchaseId, activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' },
        data: { activationStatus: 'FAILED_PERMANENTLY', failureReason: 'MAX_RETRIES_EXCEEDED' },
      })
      if (cas.count === 1) {
        await writeAuditLog(prisma as unknown as Tx, 'JADE_CLUB_PURCHASE_ACTIVATION_FAILED_PERMANENTLY', purchaseId, 'Activation permanently failed: MAX_RETRIES_EXCEEDED', { reason: 'MAX_RETRIES_EXCEEDED' })
      }
      return { outcome: 'FAILED_PERMANENTLY', reason: 'MAX_RETRIES_EXCEEDED' }
    }
    return { outcome: 'FAILED_RETRYABLE', error: message }
  }
}

// Re-exported for the admin "Retry Activation" route, so a stuck row can be
// reset out of FAILED_PERMANENTLY back into the retryable state by an
// explicit, audited, reason-required staff action — never automatically.
export async function adminResetForRetry(admin: AdminSession, purchaseId: string, reason: string): Promise<void> {
  // Defense-in-depth: the permission check lives HERE too, not only in the
  // calling route — matching entitlements.ts's own requireManage()
  // convention, so this function is safe to call from any future call
  // site without relying on that caller to have checked first.
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
