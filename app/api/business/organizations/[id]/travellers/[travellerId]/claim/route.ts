// app/api/business/organizations/[id]/travellers/[travellerId]/claim/route.ts
// Walz Business (Release 2)
// POST — (re)send the account-claim invitation email to one of the org's
// BusinessTravellers. minRole TRAVEL_MANAGER (the same tier that may create
// travellers). The traveller must belong to params.id (cross-org guard in
// lib/business/claim-invite.ts). The token is emailed to the traveller only;
// it is never returned to the caller.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertOrgScopedAccess } from '@/lib/business/authz'
import { issueTravellerClaimInvite } from '@/lib/business/claim-invite'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { id: string; travellerId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await assertOrgScopedAccess(session.user.id, params.id, { minRole: 'TRAVEL_MANAGER' })
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const result = await issueTravellerClaimInvite({
    businessTravellerId: params.travellerId,
    organizationId: params.id,
    actorUserId: session.user.id,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ ok: true, expiresAt: result.expiresAt, emailSent: result.emailSent })
}
