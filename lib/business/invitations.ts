// lib/business/invitations.ts — Walz Business (Release 2.1): the ONE
// converged organization-invitation system.
//
// Covers both:
//   (a) BOOTSTRAP — a Walz admin creates an org and invites its first
//       ADMIN/OWNER, where NO OrganizationMembership row exists yet at all
//       (the chicken-and-egg gap: the only membership-creation route
//       required the caller to already be ADMIN in that org).
//   (b) SUBSEQUENT MEMBERS — an existing ADMIN+ member invites another
//       person to their org (today's existing use case in
//       app/api/business/organizations/[id]/members/route.ts, refactored to
//       call this same module).
//
// TOKEN SECURITY — the Quotes/Proposals SHA-256 precedent
// (app/api/quote-proposal/[token]/route.ts's hashToken()), NOT the
// traveller-claim flow's raw-unique-token precedent (lib/business/claim.ts
// stores the raw token as a unique column) — this grants organization
// ADMINISTRATIVE access, so it gets the stronger pattern: only
// sha256(rawToken) is ever persisted (OrganizationInvitation.tokenHash),
// the raw token exists only in the outbound email/URL, and lookups always
// hash-then-compare, never a raw-token WHERE clause.
//
// NO ENUMERATION ORACLE: invalid, expired, already-consumed, and
// account-email-mismatched tokens ALL collapse to the exact same
// { ok: false, reason: 'invalid' } result (see acceptOrganizationInvitation
// below) — mirroring lib/business/claim.ts's identical discipline. The
// distinct 'already_active_member' outcome is only reachable AFTER the
// caller has already proven both a correct token AND a matching verified
// email, so revealing it creates no oracle for probing someone else's
// token/account state.
//
// CAS / RACE SAFETY: acceptance is a single atomic updateMany() keyed on
// (id, consumedAt: null, expiresAt: { gt: now }) — the exact same discipline
// as lib/business/claim.ts::consumeBusinessTravellerClaim() and the R2
// currency-change route. Exactly one concurrent acceptance attempt can ever
// win.

import crypto from 'crypto'
import prisma from '@/lib/db'
import { isOrgRole, type OrgRole } from '@/lib/business/authz'
import { recordBusinessAudit } from '@/lib/business/audit'

export const INVITATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const TOKEN_PATTERN = /^[0-9a-f]{64}$/

export function isWellFormedInvitationToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token)
}

export function hashInvitationToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase()
}

// ─────────────────────────────────────────────────────────────────────────
// ISSUE
// ─────────────────────────────────────────────────────────────────────────

export interface IssueInvitationInput {
  organizationId: string
  email: string
  role: OrgRole
  invitedByStaffId?: string | null
  invitedByMembershipId?: string | null
}

export type IssueInvitationResult =
  | { ok: true; token: string; expiresAt: Date; invitationId: string }
  | { ok: false; status: number; error: string }

/**
 * Creates (or re-issues, replacing any prior un-consumed invitation for the
 * same organization+email — same "re-issue replaces prior token" discipline
 * as lib/business/claim.ts) an OrganizationInvitation row. Returns the RAW
 * token — the ONLY place it is ever available. Callers must hash it or hand
 * it to the email sender and then discard it; it is never logged.
 */
export async function issueOrganizationInvitation(
  input: IssueInvitationInput,
  now: Date = new Date(),
): Promise<IssueInvitationResult> {
  const email = normalizeInvitationEmail(input.email)
  if (!email) return { ok: false, status: 400, error: 'A valid email is required' }
  if (!isOrgRole(input.role)) return { ok: false, status: 400, error: 'Invalid role' }
  if (!input.invitedByStaffId && !input.invitedByMembershipId) {
    return { ok: false, status: 400, error: 'An issuing actor is required' }
  }

  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true },
  })
  if (!organization) return { ok: false, status: 404, error: 'Not found' }

  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashInvitationToken(token)
  const expiresAt = new Date(now.getTime() + INVITATION_TOKEN_TTL_MS)

  try {
    const invitation = await prisma.$transaction(async (tx) => {
      // Re-issue replaces any prior un-consumed invitation for this exact
      // (organization, email) pair — never two live invitations at once.
      await tx.organizationInvitation.deleteMany({
        where: { organizationId: input.organizationId, email, consumedAt: null },
      })
      return tx.organizationInvitation.create({
        data: {
          organizationId: input.organizationId,
          email,
          role: input.role,
          tokenHash,
          invitedByStaffId: input.invitedByStaffId ?? null,
          invitedByMembershipId: input.invitedByMembershipId ?? null,
          expiresAt,
        },
      })
    })
    return { ok: true, token, expiresAt, invitationId: invitation.id }
  } catch (err) {
    console.error('[OrganizationInvitation] issue failed:', (err as Error).message)
    return { ok: false, status: 500, error: 'Could not create the invitation' }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ACCEPT
// ─────────────────────────────────────────────────────────────────────────

export type AcceptInvitationResult =
  | { ok: true; organizationId: string; membershipId: string; role: string; reactivated: boolean }
  // Every security-sensitive failure collapses to this ONE shape — see
  // module header "NO ENUMERATION ORACLE".
  | { ok: false; reason: 'invalid' }
  // Reachable only after a correct token + matching verified email — safe
  // to distinguish (see module header).
  | { ok: false; reason: 'already_active_member' }

const INVALID: AcceptInvitationResult = { ok: false, reason: 'invalid' }

export async function acceptOrganizationInvitation(
  rawToken: unknown,
  userId: string,
  now: Date = new Date(),
): Promise<AcceptInvitationResult> {
  if (!userId || !isWellFormedInvitationToken(rawToken)) return INVALID

  try {
    const tokenHash = hashInvitationToken(rawToken)
    const invitation = await prisma.organizationInvitation.findUnique({ where: { tokenHash } })
    if (!invitation) return INVALID
    if (invitation.consumedAt) return INVALID
    if (invitation.expiresAt.getTime() <= now.getTime()) return INVALID

    // Hard-require the signed-in user's email to case-insensitively equal
    // the invitation's bound email. A forwarded/leaked link is useless to
    // anyone else — identical discipline to claim.ts's wrong-inbox check.
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } })
    if (!user?.email) return INVALID
    if (normalizeInvitationEmail(user.email) !== invitation.email) return INVALID

    // Pre-check (not itself authoritative — the CAS below is): does a
    // membership already exist for this (org, user)? An ACTIVE or SUSPENDED
    // membership is a business-state conflict, not a token-validity
    // question, and is safe to report distinctly at this point (see header).
    const existingBefore = await prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: invitation.organizationId, userId } },
    })
    if (existingBefore && (existingBefore.status === 'ACTIVE' || existingBefore.status === 'SUSPENDED')) {
      return { ok: false, reason: 'already_active_member' }
    }

    // ── THE ATOMIC ONE-TIME CONSUMPTION (CAS) ────────────────────────────
    const cas = await prisma.organizationInvitation.updateMany({
      where: { id: invitation.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now, consumedByUserId: userId },
    })
    if (cas.count !== 1) return INVALID

    // Membership creation/transition. The invitation CAS above is the true
    // single-winner gate for this whole operation, so this section can run
    // outside a further transaction — at most one caller ever reaches here
    // for this invitation.
    const invitedBy = invitation.invitedByStaffId ?? invitation.invitedByMembershipId ?? `invitation:${invitation.id}`

    if (!existingBefore) {
      // BOOTSTRAP / fresh-invite case: no membership row exists yet.
      // Created directly as ACTIVE — the invitation itself already
      // represents the pending state, so there is no separate INVITED step.
      try {
        const membership = await prisma.organizationMembership.create({
          data: {
            organizationId: invitation.organizationId,
            userId,
            role: invitation.role,
            status: 'ACTIVE',
            invitedBy,
            joinedAt: now,
          },
        })
        await recordBusinessAudit({
          organizationId: invitation.organizationId,
          actorUserId: userId,
          action: 'invitation.accepted',
          entityType: 'OrganizationInvitation',
          entityId: invitation.id,
          after: { membershipId: membership.id, role: membership.role, created: true },
        })
        return { ok: true, organizationId: invitation.organizationId, membershipId: membership.id, role: membership.role, reactivated: false }
      } catch {
        // Lost a race to a concurrent path that created the membership
        // between the pre-check and here. Fall through to the update path.
      }
    }

    // SUBSEQUENT-MEMBER / re-invite case: an OrganizationMembership already
    // exists (INVITED — created by the members route today — or REMOVED).
    // DECISION: INVITED -> activate. REMOVED -> reactivate. ACTIVE/SUSPENDED
    // was already rejected above before the token was ever consumed.
    const current = await prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: invitation.organizationId, userId } },
    })
    if (!current) {
      // Extremely unlikely race-of-races: create it now.
      const membership = await prisma.organizationMembership.create({
        data: {
          organizationId: invitation.organizationId,
          userId,
          role: invitation.role,
          status: 'ACTIVE',
          invitedBy,
          joinedAt: now,
        },
      })
      await recordBusinessAudit({
        organizationId: invitation.organizationId,
        actorUserId: userId,
        action: 'invitation.accepted',
        entityType: 'OrganizationInvitation',
        entityId: invitation.id,
        after: { membershipId: membership.id, role: membership.role, created: true },
      })
      return { ok: true, organizationId: invitation.organizationId, membershipId: membership.id, role: membership.role, reactivated: false }
    }

    const wasRemoved = current.status === 'REMOVED'
    const updated = await prisma.organizationMembership.update({
      where: { id: current.id },
      data: { status: 'ACTIVE', role: invitation.role, joinedAt: now },
    })

    await recordBusinessAudit({
      organizationId: invitation.organizationId,
      actorUserId: userId,
      action: 'invitation.accepted',
      entityType: 'OrganizationInvitation',
      entityId: invitation.id,
      before: { status: current.status, role: current.role },
      after: { membershipId: updated.id, role: updated.role, status: updated.status, reactivated: wasRemoved },
    })

    return { ok: true, organizationId: invitation.organizationId, membershipId: updated.id, role: updated.role, reactivated: wasRemoved }
  } catch (err) {
    console.error('[OrganizationInvitation] accept failed:', (err as Error).message)
    return INVALID
  }
}
