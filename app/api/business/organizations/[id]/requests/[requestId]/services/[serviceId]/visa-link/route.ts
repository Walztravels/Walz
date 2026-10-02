// app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-link/route.ts
// Walz Business (V1-C Phase 1) — issue (or reissue) a BusinessServiceLinkToken
// for one VISA TravelRequestService, addressed to one BusinessTraveller of
// the same organization.
//
// GATE: assertAgencyOrCorporateAccess(userId, orgId, { minRole:
// 'TRAVEL_MANAGER' }) — the SAME gate and minRole as
// app/api/business/organizations/[id]/travellers/[travellerId]/claim/route.ts.
// REFERRAL_PARTNER organizations are structurally denied by this gate
// already (the generic 404 — no separate check needed here).
//
// The raw token is returned to the caller ONCE, in this response, so the
// issuer can build the recipient URL. It is never logged and never
// persisted anywhere except as its SHA-256 hash
// (lib/business/service-link-token.ts). There is no recipient-facing route
// to actually consume this token yet (a later phase) — the URL returned
// here will 404 until that phase ships, which is expected.
//
// Issuing a new token for a service that already has a live one
// automatically revokes/replaces it (see
// lib/business/service-link-token.ts::issueOrReissueServiceLinkToken) — this
// single route covers both "issue" and "reissue"; there is no separate
// reissue endpoint.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertAgencyOrCorporateAccess } from '@/lib/business/org-type-gate'
import { issueOrReissueServiceLinkToken } from '@/lib/business/service-link-token'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://walztravels.com'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; requestId: string; serviceId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // R2.1-style deny-by-default gate: REFERRAL_PARTNER organizations and any
  // member below TRAVEL_MANAGER get the identical generic 404.
  const access = await assertAgencyOrCorporateAccess(session.user.id, params.id, { minRole: 'TRAVEL_MANAGER' })
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const businessTravellerId = typeof (body as any)?.businessTravellerId === 'string' ? (body as any).businessTravellerId : ''
  if (!businessTravellerId) {
    return NextResponse.json({ error: 'businessTravellerId is required' }, { status: 400 })
  }

  const result = await issueOrReissueServiceLinkToken({
    organizationId: params.id,
    travelRequestId: params.requestId,
    travelRequestServiceId: params.serviceId,
    businessTravellerId,
    issuedByMembershipId: access.membership.id,
    actorUserId: session.user.id,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const url = `${BASE_URL}/business/visa-link/${result.token}`

  return NextResponse.json(
    { ok: true, url, expiresAt: result.expiresAt.toISOString(), reissued: result.reissued },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  )
}
