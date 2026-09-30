// app/api/business/organizations/[id]/requests/[requestId]/route.ts
// Walz Business (Release 2)
// GET — travel request detail (travellers, linked services, approval
// history, timeline) for an ACTIVE member of params.id.
//
// Both prongs: assertOrgScopedAccess(user, params.id), then
// lib/business/request-detail.ts requires request.organizationId ===
// params.id (and, for the floor TRAVELLER role, that the caller submitted
// the request or is a named traveller on it). Every failure is the same
// generic 404.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertOrgScopedAccess } from '@/lib/business/authz'
import { loadTravelRequestDetail } from '@/lib/business/request-detail'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string; requestId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await assertOrgScopedAccess(session.user.id, params.id)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const detail = await loadTravelRequestDetail(params.requestId, params.id, {
    kind: 'member',
    userId: session.user.id,
    membershipId: access.membership.id,
    role: access.membership.role,
  })
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ...detail, viewerRole: access.membership.role })
}
