// app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-link/revoke/route.ts
// Walz Business (V1-C Phase 1) — revoke the live BusinessServiceLinkToken for
// one VISA TravelRequestService, if one exists.
//
// GATE: identical to .../visa-link/route.ts —
// assertAgencyOrCorporateAccess(userId, orgId, { minRole: 'TRAVEL_MANAGER' }).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertAgencyOrCorporateAccess } from '@/lib/business/org-type-gate'
import { revokeServiceLinkToken } from '@/lib/business/service-link-token'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; requestId: string; serviceId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await assertAgencyOrCorporateAccess(session.user.id, params.id, { minRole: 'TRAVEL_MANAGER' })
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const result = await revokeServiceLinkToken({
    organizationId: params.id,
    travelRequestId: params.requestId,
    travelRequestServiceId: params.serviceId,
    revokedByMembershipId: access.membership.id,
    actorUserId: session.user.id,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true, revoked: result.revoked }, { headers: { 'Cache-Control': 'no-store' } })
}
