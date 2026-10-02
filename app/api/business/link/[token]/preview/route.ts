// app/api/business/link/[token]/preview/route.ts — Walz Business (V1-C
// Phase 2, Slice A) — public, read-only, non-enumerating preview for a
// recipient landing on a BusinessServiceLinkToken link
// (${BASE_URL}/business/visa-link/${token} — see the issuance route's
// header, app/api/business/organizations/[id]/requests/[requestId]/
// services/[serviceId]/visa-link/route.ts, which this file does NOT
// modify).
//
// FULLY PUBLIC: no getServerSession() call anywhere in this route — it
// must work for a genuinely anonymous recipient who has no Walz account
// at all (the same BusinessTraveller.userId-stays-null design as the rest
// of this token's lifecycle — see lib/business/service-link-token.ts).
//
// THE ONLY INPUT: the token path param. No query string or body field is
// ever read by this route, so a client cannot supply e.g. a different
// organizationId/scope and have it do anything — scope is entirely
// determined by what validateServiceLinkToken() resolves from the token's
// own hash.
//
// ZERO WRITES: this route never calls consumeServiceLinkToken() (out of
// scope for this slice — see validateServiceLinkToken()'s own "READ-ONLY"
// contract) and performs no Prisma write of any kind, on any branch,
// success or failure. The two extra Prisma reads below
// (organization.findUnique / businessTraveller.findUnique) are
// select-only, for display purposes, and run only after
// validateServiceLinkToken() has already confirmed the token is live and
// in-scope.
//
// NON-ENUMERATION: every invalid state — malformed token shape, unknown
// hash, expired, revoked, consumed, REFERRAL_PARTNER-reclassified
// organization, a traveller or service that has moved — collapses to the
// IDENTICAL generic response: `{ ok: false }` at HTTP 404. This route adds
// no distinguishing branch of its own; it trusts
// validateServiceLinkToken()'s own collapsed { ok: false } entirely and
// never re-derives a different failure reason from the token row itself
// (it never even looks at the token row — only at validateServiceLinkToken()'s
// return value).
//
// NEVER IN THE RESPONSE BODY: the token itself, its SHA-256 hash, or any
// raw internal id (organizationId, businessTravellerId, travelRequestId,
// travelRequestServiceId, issuedByMembershipId, issuedByStaffId). Only
// derived, display-safe strings.

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { validateServiceLinkToken } from '@/lib/business/service-link-token'
import { visaLinkPreviewRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' } as const

// The SAME generic shape for every single failure mode — a 404 with this
// exact body, never anything that would let an external caller tell
// "malformed" apart from "expired" apart from "consumed" apart from
// "wrong org type" etc. See the module header.
function genericInvalid(): NextResponse {
  return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE })
}

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  // Per-instance, in-memory rate limit — defense-in-depth only, not a
  // distributed guarantee. See the visaLinkPreviewRateLimit doc comment in
  // lib/rate-limit.ts. A rate-limited response still carries the SAME
  // Cache-Control: no-store discipline (never cached by an intermediary),
  // but is intentionally distinguished by status code (429, not 404) so
  // a legitimate client can tell "slow down" apart from "dead link" —
  // this is about request pacing, not about the token's validity, so it
  // is not part of the non-enumeration contract above.
  const rl = visaLinkPreviewRateLimit(clientIp(req))
  if (!rl.allowed) {
    return NextResponse.json({ ok: false }, { status: 429, headers: NO_STORE })
  }

  // The ONLY input read from this request: the token path param itself.
  // No req.nextUrl.searchParams / req.json() is ever consulted — nothing
  // a client supplies can override or influence which organization,
  // traveller, request, or service this resolves to.
  const result = await validateServiceLinkToken(params.token)
  if (!result.ok) return genericInvalid()

  // Minimal, read-only, display-only lookups. Select only the fields
  // needed to render a reassuring "valid link" message — never select or
  // forward the row's own id, tokenHash, or any other internal column.
  const [organization, traveller] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: result.token.organizationId },
      select: { tradingName: true, legalName: true },
    }),
    prisma.businessTraveller.findUnique({
      where: { id: result.token.businessTravellerId },
      select: { firstName: true },
    }),
  ])

  // Defense in depth: validateServiceLinkToken() already re-verified the
  // organization and traveller exist and are in-scope moments ago, but if
  // either lookup somehow comes back empty here (a vanishingly unlikely
  // race), fail generic rather than ever return a half-populated success
  // body — never a distinguishable failure shape.
  if (!organization || !traveller) return genericInvalid()

  return NextResponse.json(
    {
      ok: true,
      organizationDisplayName: organization.tradingName || organization.legalName,
      travellerFirstName: traveller.firstName,
      // Static, service-type-derived copy, not a DB read — the schema
      // carries no destination field for a TravelRequest/
      // TravelRequestService, and validateServiceLinkToken() already
      // guarantees this is a VISA service (every other serviceType fails
      // validation), so a fixed label is accurate and introduces no new
      // lookup or enumeration surface.
      destinationPlaceholder: 'Visa application',
    },
    { status: 200, headers: NO_STORE },
  )
}
