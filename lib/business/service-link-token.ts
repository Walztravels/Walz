// lib/business/service-link-token.ts — Walz Business (V1-C Phase 1):
// BusinessServiceLinkToken lifecycle — issuance, reissue (which revokes/
// replaces any prior live token for the same service), revoke, read-only
// validation, and the atomic one-time consumption primitive.
//
// WHO THIS IS FOR: a BusinessTraveller who has NO User account and NO
// OrganizationMembership (BusinessTraveller.userId stays nullable/untouched
// by every function in this module — grep-verified: nothing here ever writes
// BusinessTraveller.userId, creates a User, or creates an
// OrganizationMembership). A TRAVEL_MANAGER+ member issues them a short-
// lived, single-use link to submit visa documents for ONE
// TravelRequestService, later (a LATER phase, not built here).
//
// TOKEN SECURITY — identical discipline to lib/business/invitations.ts:
//   - crypto.randomBytes(32) (256-bit) raw token, hex-encoded (64 lowercase
//     hex chars) — the SAME shape convention as claim.ts/invitations.ts.
//   - Only sha256(rawToken) hex is ever persisted (tokenHash). The raw token
//     is returned to the issuer exactly ONCE (the issuance call's response),
//     to build the recipient URL — never logged (no console.log/audit field
//     ever contains it — grep-verified), never persisted anywhere else.
//   - Every lookup hashes the caller-supplied token first and queries
//     WHERE tokenHash = ... — never a raw-token WHERE clause.
//
// EXACTLY ONE LIVE TOKEN PER SERVICE: DB-enforced via the partial unique
// index uq_bslt_live_per_service (travel_request_service_id WHERE
// consumed_at IS NULL AND revoked_at IS NULL — see the migration). Issuing a
// new token for a service that already has a live one REVOKES/REPLACES that
// prior token in the SAME transaction before inserting the new row
// (replacesTokenId points at the row it replaced) — the old link dies the
// instant a new one exists. If two issuance calls somehow race past the
// application-level revoke (extremely unlikely — see issueOrReissueServiceLinkToken),
// the DB partial unique index is the backstop: the loser's INSERT fails with
// a unique-constraint violation, which is caught and surfaced as a generic
// retryable error — never as two live rows.
//
// NON-ENUMERATION: validateServiceLinkToken() collapses every failure mode
// (malformed shape, unknown hash, revoked, consumed, expired, organization
// reclassified to REFERRAL_PARTNER, traveller no longer in the org, service
// no longer in that request/org) to the exact same { ok: false } result —
// mirroring lib/business/claim.ts and lib/business/invitations.ts.
//
// CRITICAL LIFECYCLE BOUNDARY FOR THIS PHASE: validateServiceLinkToken() is
// READ-ONLY — it NEVER sets consumedAt, no matter how many times it is
// called (see business-v1c-phase1-service-link-token.test.ts's dedicated
// "never flips consumedAt" test). consumeServiceLinkToken() is the ONLY
// function in this module that ever writes consumedAt, via an atomic CAS
// updateMany(). Nothing in this phase's shipped API surface (the issuance/
// reissue/revoke routes) ever calls consumeServiceLinkToken() — it is
// written and unit-tested now because a LATER phase's recipient-submission
// route will need it, and its correctness is security-critical, but no
// caller of it exists yet outside tests.

import crypto from 'crypto'
import prisma from '@/lib/db'
import { loadServiceInRequestInOrg } from '@/lib/business/services'
import { recordBusinessAudit } from '@/lib/business/audit'

export const SERVICE_LINK_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days — same TTL convention as claim.ts / invitations.ts
const TOKEN_PATTERN = /^[0-9a-f]{64}$/

export function isWellFormedServiceLinkToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token)
}

export function hashServiceLinkToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

function generateRawToken(): string {
  // 256 bits of entropy, hex-encoded (64 chars) — matches the
  // claim.ts / invitations.ts convention already established in this
  // codebase, rather than introducing a third token-shape convention.
  return crypto.randomBytes(32).toString('hex')
}

// ─────────────────────────────────────────────────────────────────────────
// ISSUE / REISSUE
// ─────────────────────────────────────────────────────────────────────────

export interface IssueServiceLinkTokenInput {
  organizationId: string // ALREADY verified by the caller (assertAgencyOrCorporateAccess)
  travelRequestId: string
  travelRequestServiceId: string
  businessTravellerId: string
  issuedByMembershipId?: string | null
  issuedByStaffId?: string | null
  // For the audit trail only (actorUserId on BusinessAuditLog) — never used
  // for any authorization decision in this module.
  actorUserId?: string | null
}

export type IssueServiceLinkTokenResult =
  | { ok: true; token: string; tokenId: string; expiresAt: Date; reissued: boolean; previousTokenId: string | null }
  | { ok: false; status: number; error: string }

const GENERIC_DENIAL = { ok: false as const, status: 404, error: 'Not found' }

/**
 * Issues a fresh BusinessServiceLinkToken for one TravelRequestService,
 * addressed to one BusinessTraveller of the SAME organization. If a live
 * (unconsumed, unrevoked) token already exists for this service, it is
 * revoked and replaced in the same transaction — "reissue" is simply what
 * happens automatically when a live token already exists; there is no
 * separate code path for it.
 *
 * Server-side records ALONE determine scope: the service must genuinely
 * hang off `travelRequestId` in `organizationId` (loadServiceInRequestInOrg
 * — the standard two-pronged check), the service must be a VISA service, and
 * the traveller must genuinely belong to `organizationId`. Nothing here ever
 * trusts a caller-supplied organization/traveller/request/service pairing
 * beyond what these fresh DB reads confirm.
 */
export async function issueOrReissueServiceLinkToken(
  input: IssueServiceLinkTokenInput,
  now: Date = new Date(),
): Promise<IssueServiceLinkTokenResult> {
  if (!input.issuedByMembershipId && !input.issuedByStaffId) {
    return { ok: false, status: 400, error: 'An issuing actor is required' }
  }

  const service = await loadServiceInRequestInOrg(input.travelRequestServiceId, input.travelRequestId, input.organizationId)
  if (!service || service.serviceType !== 'VISA') return GENERIC_DENIAL

  const traveller = await prisma.businessTraveller.findUnique({
    where: { id: input.businessTravellerId },
    select: { id: true, organizationId: true },
  })
  // Cross-org guard: a traveller id from another organization (or a
  // nonexistent one) is the same generic 404 as any other scope failure —
  // never distinguishable from "service not found" etc.
  if (!traveller || traveller.organizationId !== input.organizationId) return GENERIC_DENIAL

  const token = generateRawToken()
  const tokenHash = hashServiceLinkToken(token)
  const expiresAt = new Date(now.getTime() + SERVICE_LINK_TOKEN_TTL_MS)

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Find any existing LIVE token for this exact service — matches the
      // DB's partial unique index (uq_bslt_live_per_service) exactly.
      const existing = await tx.businessServiceLinkToken.findFirst({
        where: { travelRequestServiceId: input.travelRequestServiceId, consumedAt: null, revokedAt: null },
        select: { id: true },
      })

      if (existing) {
        await tx.businessServiceLinkToken.update({
          where: { id: existing.id },
          data: { revokedAt: now, revokedByMembershipId: input.issuedByMembershipId ?? null },
        })
      }

      const created = await tx.businessServiceLinkToken.create({
        data: {
          organizationId: input.organizationId,
          businessTravellerId: input.businessTravellerId,
          travelRequestId: input.travelRequestId,
          travelRequestServiceId: input.travelRequestServiceId,
          tokenHash,
          issuedByMembershipId: input.issuedByMembershipId ?? null,
          issuedByStaffId: input.issuedByStaffId ?? null,
          expiresAt,
          replacesTokenId: existing?.id ?? null,
        },
        select: { id: true },
      })

      return { tokenId: created.id, previousTokenId: existing?.id ?? null }
    })

    if (result.previousTokenId) {
      await recordBusinessAudit({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        action: 'visa_link_token.reissued',
        entityType: 'BusinessServiceLinkToken',
        entityId: result.tokenId,
        before: { previousTokenId: result.previousTokenId },
        // Never the token itself.
        after: { businessTravellerId: input.businessTravellerId, travelRequestServiceId: input.travelRequestServiceId, expiresAt: expiresAt.toISOString() },
      })
    } else {
      await recordBusinessAudit({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        action: 'visa_link_token.issued',
        entityType: 'BusinessServiceLinkToken',
        entityId: result.tokenId,
        // Never the token itself.
        after: { businessTravellerId: input.businessTravellerId, travelRequestServiceId: input.travelRequestServiceId, expiresAt: expiresAt.toISOString() },
      })
    }

    return { ok: true, token, tokenId: result.tokenId, expiresAt, reissued: !!result.previousTokenId, previousTokenId: result.previousTokenId }
  } catch (err) {
    // Includes the (extremely unlikely) P2002 unique-constraint race on
    // uq_bslt_live_per_service — the DB-level backstop behind the
    // application-level revoke-then-create above. Never surfaced with any
    // detail that would help an attacker distinguish it from any other
    // failure.
    console.error('[BusinessServiceLinkToken] issue/reissue failed:', (err as Error).message)
    return { ok: false, status: 500, error: 'Could not issue the link' }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// REVOKE
// ─────────────────────────────────────────────────────────────────────────

export type RevokeServiceLinkTokenResult =
  | { ok: true; revoked: boolean; tokenId: string | null }
  | { ok: false; status: number; error: string }

/**
 * Revokes the live (unconsumed, unrevoked) token for one TravelRequestService,
 * scoped to the caller's already-verified organization/request. Idempotent:
 * revoking a service with no live token succeeds with `revoked: false` — this
 * is not a security-sensitive enumeration surface (the caller already passed
 * the same TRAVEL_MANAGER+ org-scoped gate used to issue tokens in the first
 * place), so it is safe to distinguish "nothing to revoke" from "revoked".
 */
export async function revokeServiceLinkToken(
  input: {
    organizationId: string
    travelRequestId: string
    travelRequestServiceId: string
    revokedByMembershipId?: string | null
    actorUserId?: string | null
  },
  now: Date = new Date(),
): Promise<RevokeServiceLinkTokenResult> {
  const service = await loadServiceInRequestInOrg(input.travelRequestServiceId, input.travelRequestId, input.organizationId)
  if (!service || service.serviceType !== 'VISA') return GENERIC_DENIAL

  try {
    const existing = await prisma.businessServiceLinkToken.findFirst({
      where: { travelRequestServiceId: input.travelRequestServiceId, consumedAt: null, revokedAt: null },
      select: { id: true },
    })
    if (!existing) return { ok: true, revoked: false, tokenId: null }

    // CAS, not a plain update — the same discipline as every other
    // state-transition in this domain: only succeeds if the row is STILL
    // live at the moment of the write (defends against a race with a
    // concurrent reissue or an earlier revoke).
    const cas = await prisma.businessServiceLinkToken.updateMany({
      where: { id: existing.id, consumedAt: null, revokedAt: null },
      data: { revokedAt: now, revokedByMembershipId: input.revokedByMembershipId ?? null },
    })
    if (cas.count !== 1) return { ok: true, revoked: false, tokenId: null }

    await recordBusinessAudit({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      action: 'visa_link_token.revoked',
      entityType: 'BusinessServiceLinkToken',
      entityId: existing.id,
      before: { tokenId: existing.id },
    })

    return { ok: true, revoked: true, tokenId: existing.id }
  } catch (err) {
    console.error('[BusinessServiceLinkToken] revoke failed:', (err as Error).message)
    return { ok: false, status: 500, error: 'Could not revoke the link' }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// VALIDATE (read-only — NEVER consumes)
// ─────────────────────────────────────────────────────────────────────────

export interface ValidServiceLinkToken {
  tokenId: string
  organizationId: string
  businessTravellerId: string
  travelRequestId: string
  travelRequestServiceId: string
}

export type ValidateServiceLinkTokenResult =
  | { ok: true; token: ValidServiceLinkToken }
  | { ok: false }

const VALIDATE_FAIL: ValidateServiceLinkTokenResult = { ok: false }

/**
 * THE validation sequence: well-formed shape -> sha256 hash lookup (never a
 * raw-token WHERE) -> not-found -> revokedAt set -> consumedAt set ->
 * expiresAt past -> re-verify organization is not REFERRAL_PARTNER, the
 * traveller still belongs to that organization, and the service still hangs
 * off that exact request in that exact organization. Any failure collapses
 * to the identical { ok: false } — never distinguishable from outside.
 *
 * READ-ONLY. This function NEVER writes consumedAt (or anything else) — it
 * is safe to call any number of times, including by a page the recipient
 * merely loads without submitting anything. See
 * consumeServiceLinkToken() for the one function that is allowed to consume.
 */
export async function validateServiceLinkToken(rawToken: unknown, now: Date = new Date()): Promise<ValidateServiceLinkTokenResult> {
  if (!isWellFormedServiceLinkToken(rawToken)) return VALIDATE_FAIL

  try {
    const tokenHash = hashServiceLinkToken(rawToken)
    const row = await prisma.businessServiceLinkToken.findUnique({ where: { tokenHash } })
    if (!row) return VALIDATE_FAIL
    if (row.revokedAt) return VALIDATE_FAIL
    if (row.consumedAt) return VALIDATE_FAIL
    if (row.expiresAt.getTime() <= now.getTime()) return VALIDATE_FAIL

    // Re-verify current scope from fresh DB reads — a token issued while an
    // organization was CORPORATE/TRAVEL_AGENCY must stop working the instant
    // that organization is reclassified REFERRAL_PARTNER, and a token must
    // stop working the instant its traveller or service is removed/moved,
    // even though none of those events touch this row directly.
    const orgGate = await assertAgencyOrCorporateAccess_OrgOnly(row.organizationId)
    if (!orgGate) return VALIDATE_FAIL

    const traveller = await prisma.businessTraveller.findUnique({
      where: { id: row.businessTravellerId },
      select: { id: true, organizationId: true },
    })
    if (!traveller || traveller.organizationId !== row.organizationId) return VALIDATE_FAIL

    const service = await loadServiceInRequestInOrg(row.travelRequestServiceId, row.travelRequestId, row.organizationId)
    if (!service || service.serviceType !== 'VISA') return VALIDATE_FAIL

    return {
      ok: true,
      token: {
        tokenId: row.id,
        organizationId: row.organizationId,
        businessTravellerId: row.businessTravellerId,
        travelRequestId: row.travelRequestId,
        travelRequestServiceId: row.travelRequestServiceId,
      },
    }
  } catch (err) {
    console.error('[BusinessServiceLinkToken] validate failed:', (err as Error).message)
    return VALIDATE_FAIL
  }
}

/**
 * Organization-only half of assertAgencyOrCorporateAccess — this module has
 * no authenticated user/membership to check (the recipient has neither), so
 * it re-checks only the REFERRAL_PARTNER deny-by-default rule directly
 * against the organization row, never via the membership-keyed gate.
 */
async function assertAgencyOrCorporateAccess_OrgOnly(organizationId: string): Promise<boolean> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { organizationType: true },
  })
  if (!organization) return false
  if (organization.organizationType === 'REFERRAL_PARTNER') return false
  return true
}

// ─────────────────────────────────────────────────────────────────────────
// CONSUME (CAS primitive — written + unit-tested now; NOT called anywhere in
// Phase 1's shipped API surface — see module header)
// ─────────────────────────────────────────────────────────────────────────

export type ConsumeServiceLinkTokenResult = { ok: true } | { ok: false }

const CONSUME_FAIL: ConsumeServiceLinkTokenResult = { ok: false }

/**
 * Atomically, one-time-only, marks a token consumed. Keyed on
 * (id, consumedAt: null, revokedAt: null, expiresAt: { gt: now }) — the exact
 * same CAS discipline as consumeBusinessTravellerClaim() /
 * acceptOrganizationInvitation(). Exactly one concurrent call for the same
 * tokenId can ever succeed; every other concurrent/subsequent call (including
 * a literal replay after success) gets { ok: false }.
 *
 * NOT CALLED by any route in this phase — see module header "CRITICAL
 * LIFECYCLE BOUNDARY". A later phase's recipient-submission route will call
 * this AFTER validateServiceLinkToken() has confirmed the token and AFTER
 * the submission's own domain writes have succeeded, passing the tokenId
 * validateServiceLinkToken() returned.
 */
export async function consumeServiceLinkToken(
  tokenId: string,
  opts: { ipAddress?: string | null; userAgent?: string | null; now?: Date } = {},
): Promise<ConsumeServiceLinkTokenResult> {
  const now = opts.now ?? new Date()
  if (!tokenId) return CONSUME_FAIL

  try {
    const cas = await prisma.businessServiceLinkToken.updateMany({
      where: { id: tokenId, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now, consumedIpAddress: opts.ipAddress ?? null, consumedUserAgent: opts.userAgent ?? null },
    })
    if (cas.count !== 1) return CONSUME_FAIL
    return { ok: true }
  } catch (err) {
    console.error('[BusinessServiceLinkToken] consume failed:', (err as Error).message)
    return CONSUME_FAIL
  }
}
