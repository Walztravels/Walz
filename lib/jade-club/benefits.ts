// lib/jade-club/benefits.ts — Jade Travel Club Phase 1: benefits catalog.
//
// Reusable Walz + Partner benefits architecture (section 7 of the brief).
// Backed by the `jade_club_benefits` table (seeded once via
// prisma/migrations/jade_travel_club_v1.sql) so admins can toggle
// status/eligibility without a redeploy — but Phase 1 keeps this
// deliberately small: no per-member entitlement overrides, no rules
// engine. Entitlement is computed at read time as
// `membership.tier ∈ benefit.eligibleTiers`.
//
// Priority Pass ships as a PARTNER benefit with status COMING_SOON — no
// activation, no fake membership IDs, no affiliate link unless an admin
// explicitly sets one via the admin route below.

import prisma from '@/lib/db'
import type { AdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import {
  type JadeClubTier, type JadeBenefitCategory, type JadeBenefitStatus,
  type JadeBenefitActivationMethod, JADE_BENEFIT_CATEGORIES, JADE_BENEFIT_STATUSES,
  JADE_BENEFIT_ACTIVATION_METHODS,
} from './types'

export interface JadeClubBenefitView {
  key: string
  name: string
  category: JadeBenefitCategory
  provider: string | null
  description: string | null
  eligibleTiers: JadeClubTier[]
  status: JadeBenefitStatus
  activationMethod: JadeBenefitActivationMethod | null
  activationUrl: string | null
  sortOrder: number
  // Whether the CURRENT viewer's tier is eligible — display-only, grants
  // no access to anything (there is nothing to "activate" in Phase 1 for
  // any benefit that isn't already unconditionally available, e.g. Jade AI).
  eligibleForViewer: boolean
}

function toView(row: {
  key: string; name: string; category: string; provider: string | null; description: string | null
  eligibleTiers: string[]; status: string; activationMethod: string | null; activationUrl: string | null
  sortOrder: number
}, viewerTier: JadeClubTier | null): JadeClubBenefitView {
  const category = (JADE_BENEFIT_CATEGORIES as readonly string[]).includes(row.category)
    ? (row.category as JadeBenefitCategory) : 'WALZ'
  const status = (JADE_BENEFIT_STATUSES as readonly string[]).includes(row.status)
    ? (row.status as JadeBenefitStatus) : 'COMING_SOON'
  const activationMethod = row.activationMethod && (JADE_BENEFIT_ACTIVATION_METHODS as readonly string[]).includes(row.activationMethod)
    ? (row.activationMethod as JadeBenefitActivationMethod) : null
  const eligibleTiers = (row.eligibleTiers ?? []).filter((t): t is JadeClubTier => ['FREE', 'CLUB', 'CLUB_PLUS'].includes(t))

  return {
    key: row.key,
    name: row.name,
    category,
    provider: row.provider,
    description: row.description,
    eligibleTiers,
    status,
    activationMethod,
    activationUrl: row.activationUrl,
    sortOrder: row.sortOrder,
    eligibleForViewer: viewerTier != null && eligibleTiers.includes(viewerTier),
  }
}

/** Active benefits catalog, ordered for display. Never throws to the customer page — an empty catalog just renders no benefits. */
export async function listActiveBenefits(viewerTier: JadeClubTier | null): Promise<JadeClubBenefitView[]> {
  const rows = await prisma.jadeClubBenefit.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  })
  return rows.map(r => toView(r, viewerTier))
}

/** Admin: full catalog including inactive rows. */
export async function listAllBenefitsForAdmin(admin: AdminSession): Promise<JadeClubBenefitView[]> {
  if (!hasPermission(admin, 'jade_club')) throw new Error('FORBIDDEN')
  const rows = await prisma.jadeClubBenefit.findMany({ orderBy: { sortOrder: 'asc' } })
  return rows.map(r => toView(r, null))
}

export interface AdminBenefitUpdate {
  status?: JadeBenefitStatus
  eligibleTiers?: JadeClubTier[]
  activationMethod?: JadeBenefitActivationMethod | null
  activationUrl?: string | null
  active?: boolean
}

/** Admin-only, RBAC-gated benefit update. Never touched by any customer route. */
export async function adminUpdateBenefit(
  admin: AdminSession,
  key: string,
  update: AdminBenefitUpdate,
): Promise<JadeClubBenefitView> {
  if (!hasPermission(admin, 'jade_club.manage')) throw new Error('FORBIDDEN')

  const before = await prisma.jadeClubBenefit.findUnique({ where: { key } })
  if (!before) throw new Error('Benefit not found')

  const data: Record<string, unknown> = {}
  if (update.status !== undefined) data.status = update.status
  if (update.eligibleTiers !== undefined) data.eligibleTiers = update.eligibleTiers
  if (update.activationMethod !== undefined) data.activationMethod = update.activationMethod
  if (update.activationUrl !== undefined) data.activationUrl = update.activationUrl
  if (update.active !== undefined) data.active = update.active

  const after = await prisma.jadeClubBenefit.update({ where: { key }, data })

  await prisma.activityLog.create({
    data: {
      staffId: admin.id,
      staffName: admin.name,
      staffRole: admin.role,
      action: 'JADE_CLUB_BENEFIT_UPDATED',
      module: 'jade_club',
      entityType: 'JadeClubBenefit',
      entityId: after.id,
      detail: `Benefit "${key}" updated`,
      before: { status: before.status, eligibleTiers: before.eligibleTiers, activationMethod: before.activationMethod, activationUrl: before.activationUrl, active: before.active },
      after: { status: after.status, eligibleTiers: after.eligibleTiers, activationMethod: after.activationMethod, activationUrl: after.activationUrl, active: after.active },
    },
  }).catch((e) => console.warn('[jade-club] activity log write failed:', e))

  return toView(after, null)
}
