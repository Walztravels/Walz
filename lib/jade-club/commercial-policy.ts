// lib/jade-club/commercial-policy.ts — Jade Travel Club Release 2A:
// versioned commercial policy + policy-benefit configuration.
//
// JadeClubCommercialPolicy is the UNIVERSAL tier-terms envelope (price,
// duration, service-fee discount %) for one (tier, market, currency) scope.
// JadeClubPolicyBenefit rows are generic typed benefit grants hanging off
// one policy version. NO hardcoded Club/Club+ percentage or price value
// lives anywhere in this file or any caller — every number here is read
// from, or written into, a policy row an admin explicitly authored. This
// migration/model ships with ZERO seed policy rows.
//
// Invariant enforced here (not just at the DB layer): only one ACTIVE
// policy may exist per (tier, market, currency) at a time. The DB backs
// this with a partial unique index —
//   CREATE UNIQUE INDEX ... ON jade_club_commercial_policies (tier, market, currency)
//     WHERE status = 'ACTIVE'
// (see prisma/migrations/jade_travel_club_commercial_v2a.sql) — and
// activatePolicy below additionally supersedes the prior ACTIVE row for the
// same scope inside the SAME transaction that activates the new one, so the
// two writes are atomic even before the index is asked to arbitrate a race.
//
// Immutability: once a policy's status is or ever was ACTIVE, its
// JadeClubPolicyBenefit rows must never be updated or deleted again — that
// rule is enforced here (application layer), not by a DB trigger, matching
// this repo's established convention of keeping business rules in
// TypeScript above hand-written SQL. Only a DRAFT policy's benefit rows may
// be freely added/edited/removed.
//
// All mutations here require an AdminSession with 'jade_club.manage' and a
// non-empty `reason`, and always write a before/after ActivityLog row
// (module: 'jade_club') — the exact pattern established by
// lib/jade-club/membership.ts::adminAdjustMembership, which this file uses
// as its template.

import prisma from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { AdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import {
  type JadeCommercialTier, type JadePolicyStatus, type JadeEntitlementType,
  isJadeCommercialTier, isJadeEntitlementType,
} from './commercial-types'

function requireManage(admin: AdminSession) {
  if (!hasPermission(admin, 'jade_club.manage')) {
    throw new Error('FORBIDDEN: missing jade_club.manage permission')
  }
}

function requireReason(reason: unknown): string {
  if (typeof reason !== 'string' || !reason.trim()) {
    throw new Error('A reason is required for this change')
  }
  return reason.trim()
}

// ─── Policy DTOs ────────────────────────────────────────────────────────

export interface PolicyBenefitRecord {
  id: string
  policyId: string
  benefitKey: string
  entitlementType: JadeEntitlementType
  countPerPeriod: number | null
  costCapMinorUsd: number | null
  booleanEligible: boolean | null
  createdAt: Date
}

export interface PolicyRecord {
  id: string
  tier: JadeCommercialTier
  market: string
  currency: string
  annualPriceMinor: number
  durationMonths: number
  serviceFeeDiscountPercent: number
  effectiveFrom: Date
  effectiveTo: Date | null
  version: number
  status: JadePolicyStatus
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

function toPolicyRecord(row: {
  id: string; tier: string; market: string; currency: string; annualPriceMinor: number
  durationMonths: number; serviceFeeDiscountPercent: number; effectiveFrom: Date; effectiveTo: Date | null
  version: number; status: string; createdBy: string; createdAt: Date; updatedAt: Date
}): PolicyRecord {
  return {
    id: row.id,
    tier: row.tier as JadeCommercialTier,
    market: row.market,
    currency: row.currency,
    annualPriceMinor: row.annualPriceMinor,
    durationMonths: row.durationMonths,
    serviceFeeDiscountPercent: row.serviceFeeDiscountPercent,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    version: row.version,
    status: row.status as JadePolicyStatus,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toBenefitRecord(row: {
  id: string; policyId: string; benefitKey: string; entitlementType: string
  countPerPeriod: number | null; costCapMinorUsd: number | null; booleanEligible: boolean | null; createdAt: Date
}): PolicyBenefitRecord {
  return {
    id: row.id,
    policyId: row.policyId,
    benefitKey: row.benefitKey,
    entitlementType: row.entitlementType as JadeEntitlementType,
    countPerPeriod: row.countPerPeriod,
    costCapMinorUsd: row.costCapMinorUsd,
    booleanEligible: row.booleanEligible,
    createdAt: row.createdAt,
  }
}

// ─── Reads ──────────────────────────────────────────────────────────────

export async function listPolicies(filter?: { tier?: string; market?: string; currency?: string }): Promise<PolicyRecord[]> {
  const rows = await prisma.jadeClubCommercialPolicy.findMany({
    where: {
      ...(filter?.tier ? { tier: filter.tier } : {}),
      ...(filter?.market ? { market: filter.market } : {}),
      ...(filter?.currency ? { currency: filter.currency } : {}),
    },
    orderBy: [{ tier: 'asc' }, { market: 'asc' }, { currency: 'asc' }, { version: 'desc' }],
  })
  return rows.map(toPolicyRecord)
}

export async function getPolicyWithBenefits(policyId: string): Promise<{ policy: PolicyRecord; benefits: PolicyBenefitRecord[] } | null> {
  const row = await prisma.jadeClubCommercialPolicy.findUnique({
    where: { id: policyId },
    include: { benefits: true },
  })
  if (!row) return null
  return { policy: toPolicyRecord(row), benefits: row.benefits.map(toBenefitRecord) }
}

// ─── Mutations ──────────────────────────────────────────────────────────

export interface CreateDraftPolicyInput {
  tier: string
  market: string
  currency: string
  annualPriceMinor: number
  durationMonths?: number
  serviceFeeDiscountPercent: number
  effectiveFrom: Date
  effectiveTo?: Date | null
  reason: string
}

/**
 * Creates a new DRAFT policy version for a (tier, market, currency) scope.
 * `version` is server-computed as (max existing version for that scope) + 1
 * — never client-supplied. Every scalar field is validated explicitly;
 * the request body is NEVER spread into the Prisma call.
 */
export async function createDraftPolicy(admin: AdminSession, input: CreateDraftPolicyInput): Promise<PolicyRecord> {
  requireManage(admin)
  const reason = requireReason(input.reason)

  if (!isJadeCommercialTier(input.tier)) throw new Error('Invalid tier — must be CLUB or CLUB_PLUS')
  if (typeof input.market !== 'string' || !input.market.trim()) throw new Error('market is required')
  if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) throw new Error('currency must be a 3-letter ISO 4217 code')
  if (!Number.isInteger(input.annualPriceMinor) || input.annualPriceMinor < 0) throw new Error('annualPriceMinor must be a non-negative integer')
  const durationMonths = input.durationMonths ?? 12
  if (!Number.isInteger(durationMonths) || durationMonths <= 0) throw new Error('durationMonths must be a positive integer')
  if (!Number.isInteger(input.serviceFeeDiscountPercent) || input.serviceFeeDiscountPercent < 0 || input.serviceFeeDiscountPercent > 100) {
    throw new Error('serviceFeeDiscountPercent must be an integer between 0 and 100')
  }
  if (!(input.effectiveFrom instanceof Date) || isNaN(input.effectiveFrom.getTime())) throw new Error('effectiveFrom is required')
  if (input.effectiveTo !== undefined && input.effectiveTo !== null) {
    if (!(input.effectiveTo instanceof Date) || isNaN(input.effectiveTo.getTime())) throw new Error('Invalid effectiveTo')
    if (input.effectiveTo.getTime() <= input.effectiveFrom.getTime()) throw new Error('effectiveTo must be after effectiveFrom')
  }

  const market = input.market.trim()
  const currency = input.currency

  const latest = await prisma.jadeClubCommercialPolicy.findFirst({
    where: { tier: input.tier, market, currency },
    orderBy: { version: 'desc' },
    select: { version: true },
  })
  const version = (latest?.version ?? 0) + 1

  const created = await prisma.jadeClubCommercialPolicy.create({
    data: {
      tier: input.tier,
      market,
      currency,
      annualPriceMinor: input.annualPriceMinor,
      durationMonths,
      serviceFeeDiscountPercent: input.serviceFeeDiscountPercent,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      version,
      status: 'DRAFT',
      createdBy: admin.id,
    },
  })

  await prisma.activityLog.create({
    data: {
      staffId: admin.id,
      staffName: admin.name,
      staffRole: admin.role,
      action: 'JADE_CLUB_POLICY_CREATED',
      module: 'jade_club',
      entityType: 'JadeClubCommercialPolicy',
      entityId: created.id,
      detail: reason,
      before: Prisma.JsonNull,
      after: { tier: created.tier, market: created.market, currency: created.currency, version: created.version, status: created.status },
    },
  }).catch((e) => console.warn('[jade-club] activity log write failed:', e))

  return toPolicyRecord(created)
}

/**
 * Atomically supersedes the prior ACTIVE policy for the same
 * (tier, market, currency) scope and activates the target DRAFT policy, in
 * one transaction. The partial unique index on
 * (tier, market, currency) WHERE status = 'ACTIVE' is the DB-level backstop
 * against two concurrent activations racing past this application check.
 */
export async function activatePolicy(admin: AdminSession, policyId: string, reason: string): Promise<PolicyRecord> {
  requireManage(admin)
  const cleanReason = requireReason(reason)

  const target = await prisma.jadeClubCommercialPolicy.findUnique({ where: { id: policyId } })
  if (!target) throw new Error('Policy not found')
  if (target.status !== 'DRAFT') throw new Error(`Only a DRAFT policy can be activated (this one is ${target.status})`)

  try {
    const activated = await prisma.$transaction(async (tx) => {
      const now = new Date()
      await tx.jadeClubCommercialPolicy.updateMany({
        where: { tier: target.tier, market: target.market, currency: target.currency, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED', effectiveTo: now },
      })
      const claim = await tx.jadeClubCommercialPolicy.updateMany({
        where: { id: target.id, status: 'DRAFT' },
        data: { status: 'ACTIVE' }, // effectiveFrom is set by the admin at draft-creation time and is never rewritten here
      })
      if (claim.count !== 1) {
        throw new Error('This policy was no longer DRAFT — it may already have been activated by a concurrent request')
      }
      return tx.jadeClubCommercialPolicy.findUniqueOrThrow({ where: { id: target.id } })
    })

    await prisma.activityLog.create({
      data: {
        staffId: admin.id,
        staffName: admin.name,
        staffRole: admin.role,
        action: 'JADE_CLUB_POLICY_ACTIVATED',
        module: 'jade_club',
        entityType: 'JadeClubCommercialPolicy',
        entityId: activated.id,
        detail: cleanReason,
        before: { status: 'DRAFT' },
        after: { status: activated.status, tier: activated.tier, market: activated.market, currency: activated.currency, version: activated.version },
      },
    }).catch((e) => console.warn('[jade-club] activity log write failed:', e))

    return toPolicyRecord(activated)
  } catch (err: unknown) {
    // P2002 = unique constraint violation — the partial unique index caught
    // a race the application-level DRAFT check above did not.
    const code = (err as { code?: string } | null)?.code
    if (code === 'P2002') {
      throw new Error('Another policy is already ACTIVE for this tier/market/currency — activation rejected')
    }
    throw err
  }
}

export interface AddPolicyBenefitInput {
  benefitKey: string
  entitlementType: string
  countPerPeriod?: number | null
  costCapMinorUsd?: number | null
  booleanEligible?: boolean | null
  reason: string
}

function validateEntitlementShape(input: AddPolicyBenefitInput): { entitlementType: JadeEntitlementType; countPerPeriod: number | null; costCapMinorUsd: number | null; booleanEligible: boolean | null } {
  if (!isJadeEntitlementType(input.entitlementType)) throw new Error('Invalid entitlementType')
  if (typeof input.benefitKey !== 'string' || !input.benefitKey.trim()) throw new Error('benefitKey is required')

  const entitlementType = input.entitlementType
  const countPerPeriod = input.countPerPeriod ?? null
  const costCapMinorUsd = input.costCapMinorUsd ?? null
  const booleanEligible = input.booleanEligible ?? null

  if (entitlementType === 'COUNT_PER_PERIOD') {
    if (!Number.isInteger(countPerPeriod) || (countPerPeriod as number) <= 0) throw new Error('countPerPeriod must be a positive integer for COUNT_PER_PERIOD')
    if (costCapMinorUsd !== null || booleanEligible !== null) throw new Error('Only countPerPeriod may be set for COUNT_PER_PERIOD')
    return { entitlementType, countPerPeriod, costCapMinorUsd: null, booleanEligible: null }
  }
  if (entitlementType === 'COST_CAPPED') {
    if (!Number.isInteger(costCapMinorUsd) || (costCapMinorUsd as number) < 0) throw new Error('costCapMinorUsd must be a non-negative integer for COST_CAPPED')
    if (countPerPeriod !== null || booleanEligible !== null) throw new Error('Only costCapMinorUsd may be set for COST_CAPPED')
    return { entitlementType, countPerPeriod: null, costCapMinorUsd, booleanEligible: null }
  }
  // BOOLEAN_ELIGIBILITY
  if (typeof booleanEligible !== 'boolean') throw new Error('booleanEligible must be a boolean for BOOLEAN_ELIGIBILITY')
  if (countPerPeriod !== null || costCapMinorUsd !== null) throw new Error('Only booleanEligible may be set for BOOLEAN_ELIGIBILITY')
  return { entitlementType, countPerPeriod: null, costCapMinorUsd: null, booleanEligible }
}

async function assertPolicyIsDraft(policyId: string): Promise<{ id: string; status: string }> {
  const policy = await prisma.jadeClubCommercialPolicy.findUnique({ where: { id: policyId }, select: { id: true, status: true } })
  if (!policy) throw new Error('Policy not found')
  if (policy.status !== 'DRAFT') {
    throw new Error('Benefit rows are immutable once a policy is or ever was ACTIVE — only a DRAFT policy can be edited')
  }
  return policy
}

export async function addPolicyBenefit(admin: AdminSession, policyId: string, input: AddPolicyBenefitInput): Promise<PolicyBenefitRecord> {
  requireManage(admin)
  const reason = requireReason(input.reason)
  await assertPolicyIsDraft(policyId)
  const shape = validateEntitlementShape(input)

  const created = await prisma.jadeClubPolicyBenefit.create({
    data: {
      policyId,
      benefitKey: input.benefitKey.trim(),
      entitlementType: shape.entitlementType,
      countPerPeriod: shape.countPerPeriod,
      costCapMinorUsd: shape.costCapMinorUsd,
      booleanEligible: shape.booleanEligible,
    },
  })

  await prisma.activityLog.create({
    data: {
      staffId: admin.id, staffName: admin.name, staffRole: admin.role,
      action: 'JADE_CLUB_POLICY_BENEFIT_ADDED', module: 'jade_club',
      entityType: 'JadeClubPolicyBenefit', entityId: created.id, detail: reason,
      before: Prisma.JsonNull,
      after: { policyId, benefitKey: created.benefitKey, entitlementType: created.entitlementType },
    },
  }).catch((e) => console.warn('[jade-club] activity log write failed:', e))

  return toBenefitRecord(created)
}

export interface UpdatePolicyBenefitInput {
  entitlementType: string
  countPerPeriod?: number | null
  costCapMinorUsd?: number | null
  booleanEligible?: boolean | null
  reason: string
}

export async function updatePolicyBenefit(admin: AdminSession, policyId: string, benefitId: string, input: UpdatePolicyBenefitInput): Promise<PolicyBenefitRecord> {
  requireManage(admin)
  const reason = requireReason(input.reason)
  await assertPolicyIsDraft(policyId)

  const existing = await prisma.jadeClubPolicyBenefit.findUnique({ where: { id: benefitId } })
  if (!existing || existing.policyId !== policyId) throw new Error('Policy benefit not found')

  const shape = validateEntitlementShape({ ...input, benefitKey: existing.benefitKey })

  const updated = await prisma.jadeClubPolicyBenefit.update({
    where: { id: benefitId },
    data: {
      entitlementType: shape.entitlementType,
      countPerPeriod: shape.countPerPeriod,
      costCapMinorUsd: shape.costCapMinorUsd,
      booleanEligible: shape.booleanEligible,
    },
  })

  await prisma.activityLog.create({
    data: {
      staffId: admin.id, staffName: admin.name, staffRole: admin.role,
      action: 'JADE_CLUB_POLICY_BENEFIT_UPDATED', module: 'jade_club',
      entityType: 'JadeClubPolicyBenefit', entityId: benefitId, detail: reason,
      before: { entitlementType: existing.entitlementType, countPerPeriod: existing.countPerPeriod, costCapMinorUsd: existing.costCapMinorUsd, booleanEligible: existing.booleanEligible },
      after: { entitlementType: updated.entitlementType, countPerPeriod: updated.countPerPeriod, costCapMinorUsd: updated.costCapMinorUsd, booleanEligible: updated.booleanEligible },
    },
  }).catch((e) => console.warn('[jade-club] activity log write failed:', e))

  return toBenefitRecord(updated)
}

export async function deletePolicyBenefit(admin: AdminSession, policyId: string, benefitId: string, reason: string): Promise<void> {
  requireManage(admin)
  const cleanReason = requireReason(reason)
  await assertPolicyIsDraft(policyId)

  const existing = await prisma.jadeClubPolicyBenefit.findUnique({ where: { id: benefitId } })
  if (!existing || existing.policyId !== policyId) throw new Error('Policy benefit not found')

  await prisma.jadeClubPolicyBenefit.delete({ where: { id: benefitId } })

  await prisma.activityLog.create({
    data: {
      staffId: admin.id, staffName: admin.name, staffRole: admin.role,
      action: 'JADE_CLUB_POLICY_BENEFIT_DELETED', module: 'jade_club',
      entityType: 'JadeClubPolicyBenefit', entityId: benefitId, detail: cleanReason,
      before: { benefitKey: existing.benefitKey, entitlementType: existing.entitlementType },
      after: Prisma.JsonNull,
    },
  }).catch((e) => console.warn('[jade-club] activity log write failed:', e))
}
