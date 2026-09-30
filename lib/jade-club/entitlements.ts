// lib/jade-club/entitlements.ts — Jade Travel Club Release 2A: membership
// commercial-terms activation + the entitlement-slot concurrency-safety
// engine.
//
// ── Activation (write-once) ────────────────────────────────────────────
// activateMembershipTerms is the ONLY place a JadeClubMembershipTerms row
// is ever created. It copies every scalar commercial field off the target
// JadeClubCommercialPolicy (which MUST be ACTIVE) into an immutable terms
// row, snapshots each JadeClubPolicyBenefit into a
// JadeClubMembershipBenefitSnapshot, and — for every COUNT_PER_PERIOD
// benefit — pre-issues ALL N entitlement slots in the SAME transaction.
// After this function returns, nothing here ever reads
// JadeClubCommercialPolicy/JadeClubPolicyBenefit again for a calculation —
// every downstream read goes through the copied terms/snapshot/slot rows
// only, so a later policy version change or catalog rename can never affect
// an already-activated member.
//
// ── Entitlement slots (the concurrency-safety mechanism) ───────────────
// Slots are pre-issued inventory, never created on demand. Reservation and
// consumption NEVER follow a "count consumed, compare to allowance, then
// insert" pattern (explicitly forbidden by the accepted architecture) —
// they ALWAYS use the atomic compare-and-swap already established
// throughout this codebase (Staff Check-in V2's waive-deduction fix, Quote
// Builder's recalculate-currency route):
//   prisma.jadeClubEntitlementSlot.updateMany({ where: { id, status: 'AVAILABLE' }, data: { status: 'RESERVED', ... } })
// checking `.count === 1` to know if the caller won. The
// @@unique([membershipTermsId, benefitSnapshotId, periodKey, slotNumber])
// constraint on the slot table makes a phantom/duplicate slot structurally
// impossible regardless of what the application layer does.
//
// ── Provider idempotency — NOT VERIFIED / out of scope ──────────────────
// `reservedBy` is an INTERNAL correlation token only. This file makes no
// claim about, and never calls, any eSIM provider (lib/esimaccess.ts,
// lib/airalo.ts) — Release 2A explicitly excludes live provider order
// wiring. `linkedProviderReference` is a nullable, generic, unused-for-now
// column reserved for a future provider order id.
//
// ── Freeze / boundary compliance ────────────────────────────────────────
// This file never imports the flight Miles redemption-freeze module (see
// the repo-wide regression test for the exact guarded path) and never
// reads or writes WalzRewardsMembership / WalzMilesTransaction.

import prisma from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { AdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { ENTITLEMENT_RESERVATION_TTL_MS, ENTITLEMENT_RESERVATION_MAX_ATTEMPTS } from './entitlement-config'
import { isJadeClubMembershipSource, type JadeClubMembershipSource } from './types'

type Tx = Prisma.TransactionClient

function requireManage(admin: AdminSession) {
  if (!hasPermission(admin, 'jade_club.manage')) {
    throw new Error('FORBIDDEN: missing jade_club.manage permission')
  }
}
function requireReason(reason: unknown): string {
  if (typeof reason !== 'string' || !reason.trim()) throw new Error('A reason is required for this change')
  return reason.trim()
}

// ─── Activation ─────────────────────────────────────────────────────────

export interface ActivateMembershipTermsResult {
  termsId: string
  expiresAt: Date
  benefitCount: number
  slotsIssued: number
}

/**
 * Creates the immutable commercial-contract snapshot for one membership
 * against one ACTIVE policy, and pre-issues every COUNT_PER_PERIOD
 * benefit's slots, all in one transaction.
 *
 * Requires 'jade_club.manage' + a non-empty reason. The target policy MUST
 * be ACTIVE (never DRAFT/SUPERSEDED) and its tier must match the
 * membership's CURRENT tier (adminAdjustMembership sets the tier; this
 * function only ever builds the matching commercial contract for a tier
 * already granted — it never itself changes JadeClubMembership.tier).
 */
export async function activateMembershipTerms(
  admin: AdminSession,
  membershipId: string,
  policyId: string,
  reason: string,
  source: string = 'ADMIN_GRANT',
): Promise<ActivateMembershipTermsResult> {
  requireManage(admin)
  const cleanReason = requireReason(reason)
  if (!isJadeClubMembershipSource(source)) throw new Error('Invalid source')

  // SECURITY FIX (independent review — HIGH finding): the "no unexpired
  // terms already exists" check and the terms/snapshot/slot creation used
  // to run as a standalone pre-check followed by a SEPARATE transaction,
  // with no DB constraint backing the "at most one unexpired terms period
  // per membership" invariant (a partial unique index isn't viable here
  // since `expiresAt > now()` isn't an IMMUTABLE condition Postgres can
  // index on). Two concurrent activation calls for the SAME membership
  // could both pass the pre-check before either committed, silently
  // double-granting a full set of entitlement slots.
  //
  // Fixed by taking a row lock on the membership (`SELECT ... FOR UPDATE`)
  // as the FIRST statement inside the SAME transaction that re-checks
  // existingUnexpired and creates everything — a second concurrent call
  // for the same membershipId blocks on the lock until the first
  // transaction commits or rolls back, then re-reads and correctly sees
  // the just-created row, and bails out with the same clear error instead
  // of racing past the check.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM jade_club_memberships WHERE id = ${membershipId} FOR UPDATE`

    const membership = await tx.jadeClubMembership.findUnique({ where: { id: membershipId } })
    if (!membership) throw new Error('Membership not found')

    const policy = await tx.jadeClubCommercialPolicy.findUnique({ where: { id: policyId }, include: { benefits: true } })
    if (!policy) throw new Error('Policy not found')
    if (policy.status !== 'ACTIVE') throw new Error(`Policy must be ACTIVE to activate terms from it (this one is ${policy.status})`)
    if (policy.tier !== membership.tier) {
      throw new Error(`Policy tier (${policy.tier}) does not match the membership's current tier (${membership.tier}) — adjust the membership tier first`)
    }

    const now = new Date()
    const existingUnexpired = await tx.jadeClubMembershipTerms.findFirst({
      where: { membershipId, expiresAt: { gt: now } },
      orderBy: { activatedAt: 'desc' },
    })
    if (existingUnexpired) {
      throw new Error('This membership already has an unexpired commercial terms period — renewal is not implemented in Release 2A')
    }

    const expiresAt = addMonths(now, policy.durationMonths)

    const terms = await tx.jadeClubMembershipTerms.create({
      data: {
        membershipId,
        policyId: policy.id,
        policyVersion: policy.version,
        tier: policy.tier,
        market: policy.market,
        currency: policy.currency,
        annualPriceMinor: policy.annualPriceMinor,
        durationMonths: policy.durationMonths,
        serviceFeeDiscountPercent: policy.serviceFeeDiscountPercent,
        activatedAt: now,
        expiresAt,
        source,
      },
    })

    let slotsIssued = 0
    for (const benefit of policy.benefits) {
      const catalogBenefit = await tx.jadeClubBenefit.findUnique({ where: { key: benefit.benefitKey }, select: { name: true } })
      const snapshot = await tx.jadeClubMembershipBenefitSnapshot.create({
        data: {
          membershipTermsId: terms.id,
          benefitKey: benefit.benefitKey,
          benefitName: catalogBenefit?.name ?? benefit.benefitKey,
          entitlementType: benefit.entitlementType,
          countPerPeriod: benefit.countPerPeriod,
          costCapMinorUsd: benefit.costCapMinorUsd,
          booleanEligible: benefit.booleanEligible,
        },
      })

      if (benefit.entitlementType === 'COUNT_PER_PERIOD' && (benefit.countPerPeriod ?? 0) > 0) {
        slotsIssued += await issueSlotsForSnapshot(tx, {
          membershipTermsId: terms.id,
          benefitSnapshotId: snapshot.id,
          periodKey: 'Y1',
          countPerPeriod: benefit.countPerPeriod as number,
        })
      }
    }

    return {
      termsId: terms.id, expiresAt: terms.expiresAt, benefitCount: policy.benefits.length, slotsIssued,
      policyId: policy.id, policyVersion: policy.version, tier: policy.tier,
    }
  })

  await prisma.activityLog.create({
    data: {
      staffId: admin.id, staffName: admin.name, staffRole: admin.role,
      action: 'JADE_CLUB_TERMS_ACTIVATED', module: 'jade_club',
      entityType: 'JadeClubMembershipTerms', entityId: result.termsId, detail: cleanReason,
      before: Prisma.JsonNull,
      after: { membershipId, policyId: result.policyId, policyVersion: result.policyVersion, tier: result.tier, expiresAt: result.expiresAt, slotsIssued: result.slotsIssued },
    },
  }).catch((e) => console.warn('[jade-club] activity log write failed:', e))

  return result
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime())
  d.setMonth(d.getMonth() + months)
  return d
}

/**
 * Pre-issues slotNumber 1..countPerPeriod for one benefit snapshot, each
 * with its own ISSUED event, inside the caller's transaction. Idempotent:
 * a slot that already exists for (membershipTermsId, benefitSnapshotId,
 * periodKey, slotNumber) is left untouched and not recounted — calling
 * this twice with the same identifiers never creates extra slots, backed
 * by the table's own unique constraint as the structural guarantee.
 */
export async function issueSlotsForSnapshot(
  tx: Tx,
  params: { membershipTermsId: string; benefitSnapshotId: string; periodKey: string; countPerPeriod: number },
): Promise<number> {
  let issued = 0
  for (let slotNumber = 1; slotNumber <= params.countPerPeriod; slotNumber++) {
    const already = await tx.jadeClubEntitlementSlot.findUnique({
      where: {
        membershipTermsId_benefitSnapshotId_periodKey_slotNumber: {
          membershipTermsId: params.membershipTermsId,
          benefitSnapshotId: params.benefitSnapshotId,
          periodKey: params.periodKey,
          slotNumber,
        },
      },
    })
    if (already) continue // already issued — idempotent no-op

    const slot = await tx.jadeClubEntitlementSlot.create({
      data: {
        membershipTermsId: params.membershipTermsId,
        benefitSnapshotId: params.benefitSnapshotId,
        periodKey: params.periodKey,
        slotNumber,
        status: 'AVAILABLE',
      },
    })
    await tx.jadeClubEntitlementEvent.create({
      data: { slotId: slot.id, eventType: 'ISSUED', detail: 'Pre-issued at membership terms activation', metadata: {} },
    })
    issued++
  }
  return issued
}

// ─── Reservation / consumption ──────────────────────────────────────────

export type ReservationFailureReason = 'NO_ENTITLEMENT_AVAILABLE' | 'BENEFIT_NOT_FOUND' | 'NOT_COUNT_PER_PERIOD'

export type ReservationResult =
  | { ok: true; slotId: string; reservedBy: string; reservationExpiresAt: Date }
  | { ok: false; reason: ReservationFailureReason }

export interface ReserveEntitlementSlotParams {
  membershipTermsId: string
  benefitKey: string
  reservedBy: string
  periodKey?: string
  actorUserId?: string
  actorStaffId?: string
}

/**
 * Reserves ONE available slot for a COUNT_PER_PERIOD benefit. Idempotent
 * per (membershipTermsId, benefitKey, periodKey, reservedBy): a repeated
 * call with the same reservedBy token while a live (non-expired)
 * reservation already exists returns that SAME slot rather than consuming
 * a second one.
 */
export async function reserveEntitlementSlot(params: ReserveEntitlementSlotParams): Promise<ReservationResult> {
  const periodKey = params.periodKey ?? 'Y1'

  const snapshot = await prisma.jadeClubMembershipBenefitSnapshot.findUnique({
    where: { membershipTermsId_benefitKey: { membershipTermsId: params.membershipTermsId, benefitKey: params.benefitKey } },
  })
  if (!snapshot) return { ok: false, reason: 'BENEFIT_NOT_FOUND' }
  if (snapshot.entitlementType !== 'COUNT_PER_PERIOD') return { ok: false, reason: 'NOT_COUNT_PER_PERIOD' }

  return prisma.$transaction(async (tx) => {
    const now = new Date()

    // Idempotent replay: the same caller already holds a live reservation.
    const existingHeld = await tx.jadeClubEntitlementSlot.findFirst({
      where: {
        membershipTermsId: params.membershipTermsId,
        benefitSnapshotId: snapshot.id,
        periodKey,
        status: 'RESERVED',
        reservedBy: params.reservedBy,
        reservationExpiresAt: { gt: now },
      },
    })
    if (existingHeld) {
      return { ok: true, slotId: existingHeld.id, reservedBy: params.reservedBy, reservationExpiresAt: existingHeld.reservationExpiresAt as Date }
    }

    // Lazily reclaim any reservations that have expired for this scope
    // before searching for AVAILABLE candidates.
    await reclaimExpiredReservationsInTx(tx, { membershipTermsId: params.membershipTermsId, benefitSnapshotId: snapshot.id, periodKey }, now)

    for (let attempt = 0; attempt < ENTITLEMENT_RESERVATION_MAX_ATTEMPTS; attempt++) {
      const candidate = await tx.jadeClubEntitlementSlot.findFirst({
        where: { membershipTermsId: params.membershipTermsId, benefitSnapshotId: snapshot.id, periodKey, status: 'AVAILABLE' },
        orderBy: { slotNumber: 'asc' },
      })
      if (!candidate) return { ok: false, reason: 'NO_ENTITLEMENT_AVAILABLE' }

      const reservationExpiresAt = new Date(now.getTime() + ENTITLEMENT_RESERVATION_TTL_MS)
      const cas = await tx.jadeClubEntitlementSlot.updateMany({
        where: { id: candidate.id, status: 'AVAILABLE' },
        data: { status: 'RESERVED', reservedAt: now, reservedBy: params.reservedBy, reservationExpiresAt },
      })
      if (cas.count === 1) {
        await tx.jadeClubEntitlementEvent.create({
          data: {
            slotId: candidate.id, eventType: 'RESERVED',
            actorUserId: params.actorUserId ?? null, actorStaffId: params.actorStaffId ?? null,
            metadata: { reservedBy: params.reservedBy },
          },
        })
        return { ok: true, slotId: candidate.id, reservedBy: params.reservedBy, reservationExpiresAt }
      }
      // Someone else won this slot between our find and our CAS — retry.
    }
    return { ok: false, reason: 'NO_ENTITLEMENT_AVAILABLE' }
  })
}

/** Releases expired RESERVED slots for one scope back to AVAILABLE, with an audit event each. Safe to call repeatedly (cron-friendly). */
async function reclaimExpiredReservationsInTx(
  tx: Tx,
  scope: { membershipTermsId: string; benefitSnapshotId: string; periodKey: string },
  now: Date,
): Promise<number> {
  const expired = await tx.jadeClubEntitlementSlot.findMany({
    where: { ...scope, status: 'RESERVED', reservationExpiresAt: { lt: now } },
  })
  let released = 0
  for (const slot of expired) {
    const cas = await tx.jadeClubEntitlementSlot.updateMany({
      where: { id: slot.id, status: 'RESERVED' },
      data: { status: 'AVAILABLE', reservedAt: null, reservedBy: null, reservationExpiresAt: null },
    })
    if (cas.count === 1) {
      await tx.jadeClubEntitlementEvent.create({
        data: { slotId: slot.id, eventType: 'RESERVATION_RELEASED', detail: 'Reservation TTL expired', metadata: {} },
      })
      released++
    }
  }
  return released
}

/** Public maintenance entry point — scans and releases expired reservations across the whole table. Intended for a scheduled job; also used directly by tests to simulate TTL expiry deterministically. */
export async function releaseExpiredReservations(now: Date = new Date()): Promise<number> {
  const expired = await prisma.jadeClubEntitlementSlot.findMany({
    where: { status: 'RESERVED', reservationExpiresAt: { lt: now } },
  })
  let released = 0
  for (const slot of expired) {
    released += await prisma.$transaction(async (tx) =>
      reclaimExpiredReservationsInTx(tx, { membershipTermsId: slot.membershipTermsId, benefitSnapshotId: slot.benefitSnapshotId, periodKey: slot.periodKey }, now),
    )
  }
  return released
}

export type ConsumptionFailureReason = 'NOT_FOUND' | 'NOT_RESERVED' | 'RESERVATION_MISMATCH' | 'RESERVATION_EXPIRED' | 'ALREADY_CONSUMED' | 'TERMINAL'

export type ConsumptionResult =
  | { ok: true; slotId: string }
  | { ok: false; reason: ConsumptionFailureReason }

/**
 * Consumes a slot that is currently RESERVED by `reservedBy`. Rejects a
 * repeat consumption attempt on an already-CONSUMED slot, consumption
 * without a prior reservation (AVAILABLE), and consumption against an
 * expired reservation (auto-reclaims it to AVAILABLE first, then reports
 * RESERVATION_EXPIRED rather than silently succeeding).
 */
export async function consumeEntitlementSlot(params: {
  slotId: string
  reservedBy: string
  actorUserId?: string
  actorStaffId?: string
  linkedProviderReference?: string | null
}): Promise<ConsumptionResult> {
  return prisma.$transaction(async (tx) => {
    const now = new Date()
    const slot = await tx.jadeClubEntitlementSlot.findUnique({ where: { id: params.slotId } })
    if (!slot) return { ok: false, reason: 'NOT_FOUND' }

    if (slot.status === 'RESERVED' && slot.reservationExpiresAt && slot.reservationExpiresAt.getTime() < now.getTime()) {
      await reclaimExpiredReservationsInTx(tx, { membershipTermsId: slot.membershipTermsId, benefitSnapshotId: slot.benefitSnapshotId, periodKey: slot.periodKey }, now)
      return { ok: false, reason: 'RESERVATION_EXPIRED' }
    }
    if (slot.status === 'CONSUMED') return { ok: false, reason: 'ALREADY_CONSUMED' }
    if (slot.status === 'REVERSED') return { ok: false, reason: 'TERMINAL' }
    if (slot.status === 'AVAILABLE') return { ok: false, reason: 'NOT_RESERVED' }
    if (slot.reservedBy !== params.reservedBy) return { ok: false, reason: 'RESERVATION_MISMATCH' }

    const cas = await tx.jadeClubEntitlementSlot.updateMany({
      where: { id: slot.id, status: 'RESERVED', reservedBy: params.reservedBy },
      data: { status: 'CONSUMED', consumedAt: now, linkedProviderReference: params.linkedProviderReference ?? undefined },
    })
    if (cas.count !== 1) return { ok: false, reason: 'ALREADY_CONSUMED' } // lost a race to a concurrent consume/reversal in between

    await tx.jadeClubEntitlementEvent.create({
      data: {
        slotId: slot.id, eventType: 'CONSUMED',
        actorUserId: params.actorUserId ?? null, actorStaffId: params.actorStaffId ?? null,
        metadata: { reservedBy: params.reservedBy, linkedProviderReference: params.linkedProviderReference ?? null },
      },
    })
    return { ok: true, slotId: slot.id }
  })
}

// ─── Admin reversal + replacement (audited, mandatory reason) ──────────

export async function reverseConsumedSlot(admin: AdminSession, slotId: string, reason: string): Promise<void> {
  requireManage(admin)
  const cleanReason = requireReason(reason)

  await prisma.$transaction(async (tx) => {
    const slot = await tx.jadeClubEntitlementSlot.findUnique({ where: { id: slotId } })
    if (!slot) throw new Error('Slot not found')
    if (slot.status !== 'CONSUMED') throw new Error(`Only a CONSUMED slot can be reversed (this one is ${slot.status})`)

    const cas = await tx.jadeClubEntitlementSlot.updateMany({ where: { id: slotId, status: 'CONSUMED' }, data: { status: 'REVERSED' } })
    if (cas.count !== 1) throw new Error('This slot was no longer CONSUMED — it may have been reversed already by a concurrent request')

    await tx.jadeClubEntitlementEvent.create({
      data: { slotId, eventType: 'REVERSED', actorStaffId: admin.id, detail: cleanReason, metadata: {} },
    })
  })

  await prisma.activityLog.create({
    data: {
      staffId: admin.id, staffName: admin.name, staffRole: admin.role,
      action: 'JADE_CLUB_ENTITLEMENT_SLOT_REVERSED', module: 'jade_club',
      entityType: 'JadeClubEntitlementSlot', entityId: slotId, detail: cleanReason,
      before: { status: 'CONSUMED' }, after: { status: 'REVERSED' },
    },
  }).catch((e) => console.warn('[jade-club] activity log write failed:', e))
}

/**
 * Explicit admin action that creates a genuinely NEW slot row — never
 * resurrects a REVERSED one.
 *
 * RELIABILITY FIX (independent review — MEDIUM finding): `nextSlotNumber`
 * is derived by a read-then-write (`findFirst` + max+1) with no CAS on the
 * insert itself. Data integrity was never at risk here — the
 * `@@unique([membershipTermsId, benefitSnapshotId, periodKey, slotNumber])`
 * constraint already rejects a genuine duplicate slot number outright — but
 * a losing concurrent call surfaced a raw, unhandled Prisma P2002 error
 * instead of a clean message. Fixed with a small retry-on-conflict loop,
 * mirroring the exact P2002-catch-and-translate pattern already used in
 * activatePolicy() above: on a unique-constraint collision, re-read the
 * current max slotNumber (which the winning transaction just advanced) and
 * retry, rather than surfacing the raw DB error to the caller.
 */
export async function createReplacementSlot(admin: AdminSession, benefitSnapshotId: string, reason: string): Promise<{ slotId: string; slotNumber: number }> {
  requireManage(admin)
  const cleanReason = requireReason(reason)

  const snapshot = await prisma.jadeClubMembershipBenefitSnapshot.findUnique({ where: { id: benefitSnapshotId } })
  if (!snapshot) throw new Error('Benefit snapshot not found')
  if (snapshot.entitlementType !== 'COUNT_PER_PERIOD') throw new Error('Replacement slots only apply to COUNT_PER_PERIOD benefits')

  const MAX_ATTEMPTS = 5
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const maxSlot = await tx.jadeClubEntitlementSlot.findFirst({
          where: { benefitSnapshotId, periodKey: 'Y1' },
          orderBy: { slotNumber: 'desc' },
          select: { slotNumber: true, membershipTermsId: true },
        })
        const nextSlotNumber = (maxSlot?.slotNumber ?? 0) + 1
        const membershipTermsId = maxSlot?.membershipTermsId ?? (await tx.jadeClubMembershipBenefitSnapshot.findUniqueOrThrow({ where: { id: benefitSnapshotId } })).membershipTermsId

        const slot = await tx.jadeClubEntitlementSlot.create({
          data: { membershipTermsId, benefitSnapshotId, periodKey: 'Y1', slotNumber: nextSlotNumber, status: 'AVAILABLE' },
        })
        await tx.jadeClubEntitlementEvent.create({
          data: { slotId: slot.id, eventType: 'ISSUED', actorStaffId: admin.id, detail: `Replacement grant: ${cleanReason}`, metadata: {} },
        })
        return { slotId: slot.id, slotNumber: nextSlotNumber }
      })

      await prisma.activityLog.create({
        data: {
          staffId: admin.id, staffName: admin.name, staffRole: admin.role,
          action: 'JADE_CLUB_ENTITLEMENT_SLOT_REPLACEMENT_GRANTED', module: 'jade_club',
          entityType: 'JadeClubEntitlementSlot', entityId: result.slotId, detail: cleanReason,
          before: Prisma.JsonNull, after: { benefitSnapshotId, slotNumber: result.slotNumber },
        },
      }).catch((e) => console.warn('[jade-club] activity log write failed:', e))

      return result
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code
      if (code === 'P2002' && attempt < MAX_ATTEMPTS - 1) continue // a concurrent replacement grant won this slotNumber first — retry with a fresh read
      if (code === 'P2002') throw new Error('Another replacement grant is in progress for this benefit — please retry')
      throw err
    }
  }
  // Unreachable — the loop always returns or throws — but keeps tsc happy.
  throw new Error('Failed to create replacement slot')
}

// ─── Read-only support/audit views ─────────────────────────────────────

export async function getMembershipTermsHistory(membershipId: string) {
  return prisma.jadeClubMembershipTerms.findMany({
    where: { membershipId },
    orderBy: { activatedAt: 'desc' },
    include: { benefits: { include: { slots: { include: { events: { orderBy: { createdAt: 'asc' } } } } } } },
  })
}
