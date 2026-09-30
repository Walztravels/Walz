// app/api/admin/business/organizations/[id]/travellers/[travellerId]/claim/route.ts
// Walz Business (Release 2)
// POST — staff (re)sends a traveller's account-claim invitation. Requires
// 'b2b.manage'. The traveller must belong to params.id (cross-org guard in
// lib/business/claim-invite.ts); the token is emailed to the traveller only.

import { NextRequest, NextResponse } from 'next/server'
import { requireB2bStaff, staffActorId } from '@/lib/business/admin-guard'
import { issueTravellerClaimInvite } from '@/lib/business/claim-invite'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { id: string; travellerId: string } }) {
  const guard = await requireB2bStaff('b2b.manage')
  if (!guard.ok) return guard.response

  const result = await issueTravellerClaimInvite({
    businessTravellerId: params.travellerId,
    organizationId: params.id,
    actorStaffId: staffActorId(guard.session),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ ok: true, expiresAt: result.expiresAt, emailSent: result.emailSent })
}
