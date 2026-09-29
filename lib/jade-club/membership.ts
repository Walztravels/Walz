// lib/jade-club/membership.ts — Jade Travel Club Phase 1: membership core.
//
// Authoritative relationship: User -> JadeClubMembership (1:1, optional).
// There is NO parallel customer identity here — every function below takes
// `userId` and trusts ONLY a value the caller sourced from
// `session.user.id` (a verified NextAuth server session). Never accept a
// client-supplied userId.
//
// "Jade Free" is represented by the ABSENCE of a paid membership, not by a
// bulk-created row — see ensureJadeClubMembership: it is called lazily, the
// first time a customer visits their Jade Club page or Digital Card, and
// creates a FREE/FREE/DEFAULT row only for that one user. Existing users
// are never backfilled.
//
// Server-authoritative mutation: any change to tier/status/source can ONLY
// happen through adminAdjustMembership below, which requires an
// AdminSession + the 'jade_club.manage' permission, and always writes a
// before/after ActivityLog row (module: 'jade_club'). No route in this
// feature ever lets a customer set their own tier or status.

import prisma from '@/lib/db'
import type { AdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { generateMemberCode } from './member-code'
import { createMembershipVerificationToken } from './qr-token'
import {
  type JadeClubTier, type JadeClubMembershipStatus, type JadeClubMembershipSource,
  isJadeClubTier, isJadeClubMembershipStatus,
} from './types'

export interface JadeClubMembershipRecord {
  id: string
  userId: string
  memberCode: string
  tier: JadeClubTier
  status: JadeClubMembershipStatus
  source: JadeClubMembershipSource
  startedAt: Date
  expiresAt: Date | null
  cancelledAt: Date | null
  qrTokenVersion: number
  createdAt: Date
  updatedAt: Date
}

function toRecord(row: {
  id: string; userId: string; memberCode: string; tier: string; status: string; source: string
  startedAt: Date; expiresAt: Date | null; cancelledAt: Date | null; qrTokenVersion: number
  createdAt: Date; updatedAt: Date
}): JadeClubMembershipRecord {
  return {
    id: row.id,
    userId: row.userId,
    memberCode: row.memberCode,
    tier: isJadeClubTier(row.tier) ? row.tier : 'FREE',
    status: isJadeClubMembershipStatus(row.status) ? row.status : 'FREE',
    source: (row.source as JadeClubMembershipSource) ?? 'DEFAULT',
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    cancelledAt: row.cancelledAt,
    qrTokenVersion: row.qrTokenVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Get-or-create the membership row for one authenticated user.
 * `userId` MUST be session.user.id — never client-supplied.
 * Lazily creates a FREE/FREE/DEFAULT row on first access only; never
 * touches any other user's row, never bulk-backfills.
 */
export async function ensureJadeClubMembership(userId: string): Promise<JadeClubMembershipRecord> {
  const existing = await prisma.jadeClubMembership.findUnique({ where: { userId } })
  if (existing) return toRecord(existing)

  // Retry a handful of times on the (astronomically rare) memberCode
  // collision — unique constraint enforces no two members ever share a code.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await prisma.jadeClubMembership.create({
        data: {
          userId,
          memberCode: generateMemberCode(),
          tier: 'FREE',
          status: 'FREE',
          source: 'DEFAULT',
        },
      })
      return toRecord(created)
    } catch (err: unknown) {
      // P2002 = unique constraint violation. Could be memberCode collision
      // OR a concurrent request already created this user's row — check.
      const again = await prisma.jadeClubMembership.findUnique({ where: { userId } })
      if (again) return toRecord(again)
      if (attempt === 4) throw err
    }
  }
  throw new Error('[jade-club] failed to create membership after retries')
}

/**
 * Read-only membership lookup — does NOT create a row. Returns null for a
 * user who has never visited Jade Club (a legitimate, correct "Jade Free by
 * default" state — see the module header).
 */
export async function getJadeClubMembership(userId: string): Promise<JadeClubMembershipRecord | null> {
  const row = await prisma.jadeClubMembership.findUnique({ where: { userId } })
  return row ? toRecord(row) : null
}

// ─── Digital Card / customer-facing DTO ────────────────────────────────────

export interface JadeClubCardView {
  memberCode: string
  tier: JadeClubTier
  status: JadeClubMembershipStatus
  memberSince: Date
  expiresAt: Date | null
  verificationToken: string  // HMAC-signed, safe to render into a QR code
}

/**
 * Ensures a membership row exists, then returns the safe DTO needed to
 * render the Digital Jade Card + QR — no internal DB id, no userId, no
 * Miles, no bookings, no PII beyond what the customer already sees on
 * their own dashboard.
 */
export async function getJadeClubCardView(userId: string): Promise<JadeClubCardView> {
  const membership = await ensureJadeClubMembership(userId)
  return {
    memberCode: membership.memberCode,
    tier: membership.tier,
    status: membership.status,
    memberSince: membership.startedAt,
    expiresAt: membership.expiresAt,
    verificationToken: createMembershipVerificationToken(membership.id, membership.qrTokenVersion),
  }
}

/**
 * Customer-triggered QR rotation (e.g. "my card feels compromised, give me
 * a fresh code"). Bumps qrTokenVersion, which invalidates every previously
 * issued token for this membership immediately (see qr-token.ts). Scoped to
 * the membership's OWN userId — ownership is enforced by the `where`
 * clause itself, not by a separate check, so this can never touch another
 * customer's row.
 */
export async function rotateOwnVerificationToken(userId: string): Promise<JadeClubCardView> {
  await ensureJadeClubMembership(userId)
  const updated = await prisma.jadeClubMembership.update({
    where: { userId },
    data: { qrTokenVersion: { increment: 1 } },
  })
  return {
    memberCode: updated.memberCode,
    tier: isJadeClubTier(updated.tier) ? updated.tier : 'FREE',
    status: isJadeClubMembershipStatus(updated.status) ? updated.status : 'FREE',
    memberSince: updated.startedAt,
    expiresAt: updated.expiresAt,
    verificationToken: createMembershipVerificationToken(updated.id, updated.qrTokenVersion),
  }
}

// ─── Admin-only, audited mutation ──────────────────────────────────────────

export interface AdminMembershipAdjustment {
  tier?: JadeClubTier
  status?: JadeClubMembershipStatus
  expiresAt?: Date | null
  reason: string
}

/**
 * The ONLY way tier/status/expiry can change in Phase 1. Requires an
 * AdminSession with the 'jade_club.manage' permission (a strictly narrower
 * grant than general 'jade_club' viewing — see lib/admin/permissions.ts).
 * Always records a before/after ActivityLog row. `reason` is mandatory.
 *
 * Deliberately does NOT accept a PURCHASE source or touch any payment
 * field — Phase 1 has no paid purchase flow; only ADMIN_GRANT is ever
 * written here.
 */
export async function adminAdjustMembership(
  admin: AdminSession,
  targetUserId: string,
  adjustment: AdminMembershipAdjustment,
): Promise<JadeClubMembershipRecord> {
  if (!hasPermission(admin, 'jade_club.manage')) {
    throw new Error('FORBIDDEN: missing jade_club.manage permission')
  }
  if (!adjustment.reason || !adjustment.reason.trim()) {
    throw new Error('A reason is required for a membership adjustment')
  }

  const before = await ensureJadeClubMembership(targetUserId)

  const data: { tier?: JadeClubTier; status?: JadeClubMembershipStatus; expiresAt?: Date | null; source: JadeClubMembershipSource } = {
    source: 'ADMIN_GRANT',
  }
  if (adjustment.tier !== undefined)      data.tier = adjustment.tier
  if (adjustment.status !== undefined)    data.status = adjustment.status
  if (adjustment.expiresAt !== undefined) data.expiresAt = adjustment.expiresAt

  const updated = await prisma.jadeClubMembership.update({
    where: { userId: targetUserId },
    data,
  })
  const after = toRecord(updated)

  await prisma.activityLog.create({
    data: {
      staffId: admin.id,
      staffName: admin.name,
      staffRole: admin.role,
      action: 'JADE_CLUB_MEMBERSHIP_ADJUSTED',
      module: 'jade_club',
      entityType: 'JadeClubMembership',
      entityId: after.id,
      detail: adjustment.reason,
      before: { tier: before.tier, status: before.status, expiresAt: before.expiresAt, source: before.source },
      after: { tier: after.tier, status: after.status, expiresAt: after.expiresAt, source: after.source },
    },
  }).catch((e) => console.warn('[jade-club] activity log write failed:', e))

  return after
}
