// lib/business/claim.ts — Walz Business: BusinessTraveller <-> User account
// linking by EXPLICIT VERIFICATION.
//
// LOCKED PRODUCT DECISION: linking a BusinessTraveller row to a registered
// User account requires EXPLICIT VERIFICATION — it is NEVER set
// automatically just because a BusinessTraveller.email matches a User.email.
// BusinessTraveller.userId stays null until a human explicitly proves
// control of the claimed inbox by following the emailed link AND confirming
// while signed in to a Walz account registered to that same email address.
//
// RELEASE 1 built token generation only. RELEASE 2 completes the flow:
//   - initiateBusinessTravellerClaim(): 32-byte random token + HARD EXPIRY
//     (claimTokenExpiresAt, CLAIM_TOKEN_TTL_MS). Re-issuing replaces the
//     previous token, so only the latest link ever works.
//   - consumeBusinessTravellerClaim(): ONE-TIME, ATOMIC consumption — an
//     updateMany() keyed on the token still being present, unexpired, and
//     the row still unclaimed, checking count === 1 (the same CAS
//     discipline as the TravelApproval decision route). The token is
//     cleared in the same write, so a replay can never succeed.
//   - Email sending lives in lib/business/claim-invite.ts (this module stays
//     free of any email import — it is pure data/state logic).
//
// NO ENUMERATION ORACLE: every consumption failure — malformed token,
// unknown token, expired token, already-claimed row, replay, wrong signed-in
// user, cross-organization context, lost race — returns the exact same
// { ok: false } with no reason, mirroring lib/jade-club/verify.ts's public
// route (which collapses invalid/not_found/stale into one response) and
// lib/business/authz.ts's GENERIC_DENIAL.

import crypto from 'crypto'
import prisma from '@/lib/db'

export const CLAIM_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const TOKEN_PATTERN = /^[0-9a-f]{64}$/

export interface InitiateClaimResult {
  businessTravellerId: string
  token: string
  expiresAt: Date
}

export async function initiateBusinessTravellerClaim(
  businessTravellerId: string,
  now: Date = new Date(),
): Promise<InitiateClaimResult | null> {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(now.getTime() + CLAIM_TOKEN_TTL_MS)

  try {
    await prisma.businessTraveller.update({
      where: { id: businessTravellerId },
      data: { claimVerificationToken: token, claimVerifiedAt: null, claimTokenExpiresAt: expiresAt },
    })
    return { businessTravellerId, token, expiresAt }
  } catch (err) {
    console.error('[BusinessTravellerClaim] Failed to store claim token:', (err as Error).message)
    return null
  }
}

export type ClaimState = 'claimed' | 'pending' | 'expired' | 'none'

/** Derived, display-only claim state. Never exposes the token itself. */
export function claimState(
  t: { userId: string | null; claimVerificationToken: string | null; claimTokenExpiresAt: Date | null },
  now: Date = new Date(),
): ClaimState {
  if (t.userId) return 'claimed'
  if (!t.claimVerificationToken) return 'none'
  if (!t.claimTokenExpiresAt || t.claimTokenExpiresAt.getTime() <= now.getTime()) return 'expired'
  return 'pending'
}

export type ConsumeClaimResult =
  | { ok: true; businessTravellerId: string; organizationId: string }
  | { ok: false }

const FAIL: ConsumeClaimResult = { ok: false }

export function isWellFormedClaimToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token)
}

/**
 * Consume a claim token on behalf of the SIGNED-IN user `userId`.
 *
 * `expectedOrganizationId` is optional context (e.g. from a URL); when
 * supplied it must equal the traveller's own organization or the claim
 * fails. It can never redirect a claim to a different row — the target row
 * is always and only the one the token belongs to.
 */
export async function consumeBusinessTravellerClaim(
  token: unknown,
  userId: string,
  opts: { expectedOrganizationId?: string | null; now?: Date } = {},
): Promise<ConsumeClaimResult> {
  const now = opts.now ?? new Date()
  if (!userId || !isWellFormedClaimToken(token)) return FAIL

  try {
    const traveller = await prisma.businessTraveller.findUnique({
      where: { claimVerificationToken: token },
      select: { id: true, organizationId: true, email: true, userId: true, claimTokenExpiresAt: true },
    })
    if (!traveller) return FAIL
    if (traveller.userId) return FAIL // double claim
    if (!traveller.claimTokenExpiresAt || traveller.claimTokenExpiresAt.getTime() <= now.getTime()) return FAIL // expired / legacy no-expiry
    if (opts.expectedOrganizationId && opts.expectedOrganizationId !== traveller.organizationId) return FAIL // cross-org

    // Wrong-user protection: the signed-in account must be registered to
    // the very inbox the claim link was sent to. A forwarded/leaked link is
    // useless to anyone else.
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } })
    if (!user?.email) return FAIL
    if (user.email.trim().toLowerCase() !== traveller.email.trim().toLowerCase()) return FAIL

    // One account may represent at most one traveller identity per org.
    const alreadyLinkedInOrg = await prisma.businessTraveller.findFirst({
      where: { organizationId: traveller.organizationId, userId, id: { not: traveller.id } },
      select: { id: true },
    })
    if (alreadyLinkedInOrg) return FAIL

    // ── THE ATOMIC ONE-TIME CONSUMPTION (CAS) ──────────────────────────────
    const cas = await prisma.businessTraveller.updateMany({
      where: {
        id: traveller.id,
        organizationId: traveller.organizationId,
        claimVerificationToken: token,
        userId: null,
        claimTokenExpiresAt: { gt: now },
      },
      data: { userId, claimVerifiedAt: now, claimVerificationToken: null, claimTokenExpiresAt: null },
    })
    if (cas.count !== 1) return FAIL

    return { ok: true, businessTravellerId: traveller.id, organizationId: traveller.organizationId }
  } catch (err) {
    console.error('[BusinessTravellerClaim] consume failed:', (err as Error).message)
    return FAIL
  }
}
