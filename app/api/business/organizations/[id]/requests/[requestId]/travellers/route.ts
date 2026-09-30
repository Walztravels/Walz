// app/api/business/organizations/[id]/requests/[requestId]/travellers/route.ts
// Walz Business (Release 2)
// POST { businessTravellerId } — name one of the org's travellers on a
// request. minRole TRAVEL_MANAGER. BOTH the request AND the traveller must
// belong to params.id — a traveller id from another organization is the
// same generic 404 as a nonexistent one, so an org-A request can never be
// joined to an org-B traveller.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertAgencyOrCorporateAccess } from '@/lib/business/org-type-gate'
import { recordBusinessAudit } from '@/lib/business/audit'

export const dynamic = 'force-dynamic'

const NOT_FOUND = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export async function POST(req: NextRequest, { params }: { params: { id: string; requestId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // R2.1 remediation: REFERRAL_PARTNER organizations are denied outright —
  // naming a traveller on a request is client-traveller management.
  const access = await assertAgencyOrCorporateAccess(session.user.id, params.id, { minRole: 'TRAVEL_MANAGER' })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = await req.json().catch(() => null)
  const businessTravellerId = typeof body?.businessTravellerId === 'string' ? body.businessTravellerId : ''
  if (!businessTravellerId) return NextResponse.json({ error: 'businessTravellerId is required' }, { status: 400 })

  const [travelRequest, traveller] = await Promise.all([
    prisma.travelRequest.findUnique({ where: { id: params.requestId }, select: { id: true, organizationId: true } }),
    prisma.businessTraveller.findUnique({ where: { id: businessTravellerId }, select: { id: true, organizationId: true } }),
  ])
  if (!travelRequest || travelRequest.organizationId !== params.id) return NOT_FOUND()
  if (!traveller || traveller.organizationId !== params.id) return NOT_FOUND()

  let link
  try {
    link = await prisma.travelRequestTraveller.create({
      data: { travelRequestId: travelRequest.id, businessTravellerId: traveller.id },
    })
  } catch {
    return NextResponse.json({ error: 'That traveller is already on this request' }, { status: 409 })
  }

  await recordBusinessAudit({
    organizationId: params.id,
    actorUserId: session.user.id,
    action: 'travel_request.traveller_added',
    entityType: 'TravelRequest',
    entityId: travelRequest.id,
    after: { businessTravellerId: traveller.id },
  })

  return NextResponse.json({ link: { id: link.id } }, { status: 201 })
}
