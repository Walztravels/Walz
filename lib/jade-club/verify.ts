// lib/jade-club/verify.ts — Public Jade Card QR verification.
//
// This is the ONLY thing a scanned QR code can produce: a minimal,
// non-identifying membership status view. It NEVER logs the viewer into
// the customer's account (no session/cookie is created here), and NEVER
// exposes bookings, passport data, Miles balance/transactions, payment
// information, the customer's email/phone, or the internal userId/
// membership DB id.
//
// Called from a PUBLIC route (no auth) — see app/api/club/verify/[token].
// The token itself (see lib/jade-club/qr-token.ts) is an HMAC-signed opaque
// value; forging one without the server secret is infeasible, and a
// forged/garbled token simply fails signature verification below.

import prisma from '@/lib/db'
import { verifyMembershipVerificationTokenSignature } from './qr-token'
import { isJadeClubTier, isJadeClubMembershipStatus, JADE_CLUB_TIER_LABELS, JADE_CLUB_STATUS_LABELS } from './types'

export type JadeClubVerifyResult =
  | { ok: true; membership: JadeClubPublicView }
  | { ok: false; reason: 'invalid_token' | 'not_found' | 'stale_token' }

export interface JadeClubPublicView {
  memberCode: string
  tierLabel: string
  statusLabel: string
  maskedMemberName: string
  memberSince: string   // YYYY-MM-DD
  validThrough: string | null  // YYYY-MM-DD, null = no fixed expiry (e.g. Jade Free / ongoing)
}

// "Olawale" -> "O******" — first character kept, everything else replaced.
// Each whitespace-separated part of the name is masked independently so a
// full name's shape isn't fully revealed either.
function maskName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '*****'
  return parts
    .map(p => p[0].toUpperCase() + '*'.repeat(Math.max(p.length - 1, 3)))
    .join(' ')
}

export async function verifyJadeClubToken(rawToken: string): Promise<JadeClubVerifyResult> {
  const sig = verifyMembershipVerificationTokenSignature(rawToken)
  if (!sig.valid || !sig.membershipId || sig.tokenVersion == null) {
    return { ok: false, reason: 'invalid_token' }
  }

  const membership = await prisma.jadeClubMembership.findUnique({
    where: { id: sig.membershipId },
    select: {
      memberCode: true, tier: true, status: true, startedAt: true, expiresAt: true,
      qrTokenVersion: true, userId: true,
    },
  })
  if (!membership) return { ok: false, reason: 'not_found' }

  // The signature proved the token was legitimately issued for this
  // (membershipId, version) pair — now confirm that version is still
  // current. A rotated/older token fails here even though its signature
  // is otherwise valid.
  if (membership.qrTokenVersion !== sig.tokenVersion) {
    return { ok: false, reason: 'stale_token' }
  }

  const user = await prisma.user.findUnique({ where: { id: membership.userId }, select: { name: true, email: true } })
  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'Member'

  const tier = isJadeClubTier(membership.tier) ? membership.tier : 'FREE'
  const status = isJadeClubMembershipStatus(membership.status) ? membership.status : 'FREE'

  return {
    ok: true,
    membership: {
      memberCode: membership.memberCode,
      tierLabel: JADE_CLUB_TIER_LABELS[tier],
      statusLabel: JADE_CLUB_STATUS_LABELS[status],
      maskedMemberName: maskName(displayName),
      memberSince: membership.startedAt.toISOString().slice(0, 10),
      validThrough: membership.expiresAt ? membership.expiresAt.toISOString().slice(0, 10) : null,
    },
  }
}
