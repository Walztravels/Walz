// lib/portal/customer-identity.ts
// Release 6.1 — Track 1: Central identity-linking service.
//
// Connects the itinerary planner system (identified by clientEmail) to the
// portal auth system (identified by User.id / User.email). Linking is always
// additive and fail-safe — nothing breaks if this service errors.
//
// Security contract:
//   - Only links on EXACT email match after normalisation (lower-trim)
//   - Never overwrites an existing userId link without an explicit admin action
//   - Ambiguous matches (multiple users with same email) are logged and skipped
//   - All identity events are emitted via logIdentityEvent for observability

import prisma from '@/lib/db'
import { logIdentityEvent, IDENTITY_EVENT } from './identity-logging'

// ─── Types ───────────────────────────────────────────────────────────────────

export type IdentityLinkResult =
  | { linked: true;  userId: string }
  | { linked: false; reason: 'already_linked' | 'no_match' | 'ambiguous' | 'conflict' | 'error' }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Find the single verified portal User for the given email.
 * Returns null when no match or when multiple users share the email (ambiguous).
 */
export async function findUserByVerifiedEmail(
  email: string,
): Promise<{ id: string; email: string } | null> {
  const normalized = normalizeEmail(email)
  if (!normalized) return null

  const matches = await prisma.user.findMany({
    where:  { email: { equals: normalized, mode: 'insensitive' } },
    select: { id: true, email: true },
  })

  if (matches.length === 0) return null
  if (matches.length > 1)   return null  // ambiguous — never guess
  return matches[0]
}

/**
 * Link an itinerary record to a portal User by setting itinerary.userId.
 *
 * Rules:
 *  - If itinerary.userId is already set to a DIFFERENT userId → conflict (log, skip)
 *  - If itinerary.userId is already set to the SAME userId → no-op (idempotent)
 *  - Otherwise → set userId and log the event
 *
 * @param itineraryId  Prisma Itinerary.id (cuid)
 * @param userId       Portal User.id to link
 * @param actor        Identifier of what triggered the link (e.g. 'acceptance', 'admin', 'backfill')
 */
export async function linkItineraryToUser(
  itineraryId: string,
  userId:       string,
  actor:        string,
): Promise<IdentityLinkResult> {
  try {
    const itinerary = await prisma.itinerary.findUnique({
      where:  { id: itineraryId },
      select: { id: true, userId: true, referenceNumber: true, clientEmail: true },
    })

    if (!itinerary) {
      return { linked: false, reason: 'no_match' }
    }

    if (itinerary.userId === userId) {
      return { linked: false, reason: 'already_linked' }
    }

    if (itinerary.userId && itinerary.userId !== userId) {
      logIdentityEvent(IDENTITY_EVENT.ITINERARY_USER_CONFLICT, {
        itineraryId,
        itineraryRef: itinerary.referenceNumber,
        existingUserId: itinerary.userId,
        requestedUserId: userId,
        actor,
      })
      return { linked: false, reason: 'conflict' }
    }

    await prisma.itinerary.update({
      where: { id: itineraryId },
      data:  { userId },
    })

    logIdentityEvent(IDENTITY_EVENT.ITINERARY_USER_LINKED, {
      itineraryId,
      itineraryRef: itinerary.referenceNumber,
      userId,
      email: itinerary.clientEmail,
      actor,
    })

    return { linked: true, userId }
  } catch (err) {
    console.error('[IDENTITY] linkItineraryToUser failed', err)
    return { linked: false, reason: 'error' }
  }
}

/**
 * Attempt to link an itinerary to a portal user by email match.
 * Used post-acceptance and during backfill. Non-blocking: logs but never throws.
 */
export async function tryLinkItineraryByEmail(
  itineraryId:  string,
  clientEmail:  string,
  actor:        string,
): Promise<IdentityLinkResult> {
  try {
    const normalized = normalizeEmail(clientEmail)
    if (!normalized) return { linked: false, reason: 'no_match' }

    const matches = await prisma.user.findMany({
      where:  { email: { equals: normalized, mode: 'insensitive' } },
      select: { id: true, email: true },
    })

    if (matches.length === 0) {
      logIdentityEvent(IDENTITY_EVENT.ITINERARY_USER_UNMATCHED, {
        itineraryId, email: normalized, actor,
      })
      return { linked: false, reason: 'no_match' }
    }

    if (matches.length > 1) {
      logIdentityEvent(IDENTITY_EVENT.ITINERARY_USER_AMBIGUOUS, {
        itineraryId, email: normalized, matchCount: matches.length, actor,
      })
      return { linked: false, reason: 'ambiguous' }
    }

    return linkItineraryToUser(itineraryId, matches[0].id, actor)
  } catch (err) {
    console.error('[IDENTITY] tryLinkItineraryByEmail failed', err)
    return { linked: false, reason: 'error' }
  }
}

/**
 * Check whether the given userId owns the itinerary (by userId field or email match).
 * Returns true if ownership is confirmed; false otherwise.
 * Used by portal-facing routes before exposing itinerary data.
 */
export async function resolveCustomerOwnership(
  itineraryId: string,
  userId:      string,
): Promise<boolean> {
  const itinerary = await prisma.itinerary.findUnique({
    where:  { id: itineraryId },
    select: { userId: true, clientEmail: true },
  })
  if (!itinerary) return false

  if (itinerary.userId === userId) return true

  // Email fallback: only when userId is not yet set (not yet linked)
  if (!itinerary.userId) {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true },
    })
    if (!user) return false
    return normalizeEmail(itinerary.clientEmail) === normalizeEmail(user.email)
  }

  return false
}
