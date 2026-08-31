// lib/portal/identity-security.ts
// Release 6.1 — Track 8: Centralized identity security utilities.
//
// These helpers encode the ownership-validation patterns used across portal routes,
// so each route does not re-implement the same logic with subtle variations.

import { NextResponse } from 'next/server'

// ─── Email Fallback Ownership ─────────────────────────────────────────────────

/**
 * Shared ownership pattern for portal records that may have been created
 * before the user had a portal account (userId is null, but email matches).
 *
 * Returns true when EITHER:
 *   - ownedUserId matches requestUserId (primary, strong ownership)
 *   - ownedEmail matches requestEmail case-insensitively (legacy fallback)
 *
 * The email fallback is intentional and safe here because `ownedEmail` comes
 * from a database record, not from the client request. The client cannot forge
 * an ownedEmail — only their own requestEmail, which is server-verified via JWT.
 */
export function ownsRecordByUserIdOrEmail(opts: {
  ownedUserId:   string | null | undefined
  ownedEmail:    string | null | undefined
  requestUserId: string
  requestEmail:  string
}): boolean {
  const { ownedUserId, ownedEmail, requestUserId, requestEmail } = opts

  if (ownedUserId && ownedUserId === requestUserId) return true

  if (ownedEmail && requestEmail) {
    return ownedEmail.toLowerCase() === requestEmail.toLowerCase()
  }

  return false
}

/**
 * Convenience: return a 403 JSON response if ownership fails.
 * Usage:  `const guard = assertOwnership(...); if (guard) return guard`
 */
export function forbiddenIfNotOwner(owns: boolean): NextResponse | null {
  if (owns) return null
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ─── Trip Ownership (for Jade commercial context) ─────────────────────────────

/**
 * The client-supplied tripId hint is NOT trusted for authorization.
 * A valid tripId for commercial context must be owned by the current session:
 *   - authenticated: Trip.userId === userId
 *   - anonymous:     Trip.sessionId === sessionId
 *
 * Returns the validated tripId to pass to getJadeCommercialContext, or null
 * if ownership cannot be established server-side.
 */
export async function resolveOwnedTripId(opts: {
  clientTripId: string | null | undefined
  userId:       string | null
  sessionId:    string | null
  prisma:       import('@prisma/client').PrismaClient
}): Promise<string | null> {
  const { clientTripId, userId, sessionId, prisma } = opts

  if (!clientTripId) return null
  if (!userId && !sessionId) return null

  const trip = await prisma.trip.findFirst({
    where: {
      id: clientTripId,
      OR: [
        ...(userId    ? [{ userId }]    : []),
        ...(sessionId ? [{ sessionId }] : []),
      ],
    },
    select: { id: true },
  }).catch(() => null)

  return trip?.id ?? null
}
