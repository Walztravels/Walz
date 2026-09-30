// app/api/business/organizations/[id]/travellers/route.ts — Walz Business (R1)
// GET  — list BusinessTraveller rows for the org. minRole COORDINATOR (so
//        COORDINATOR, TRAVEL_MANAGER/APPROVER/FINANCE, ADMIN and OWNER may
//        list the roster). The floor TRAVELLER role is denied with the
//        generic 404 — the full roster (names/emails/phones of colleagues)
//        is not TRAVELLER data. A TRAVELLER's access to their OWN request /
//        traveller information is governed elsewhere (request-detail
//        loader) and is unaffected.
// POST — create a BusinessTraveller. minRole TRAVEL_MANAGER (also admits the
//        peer-tier APPROVER/FINANCE roles and everything above — see
//        lib/business/authz.ts for the documented role ordering).
//
// userId is NEVER set here — BusinessTraveller<->User linking requires
// explicit verification (lib/business/claim.ts), never automatic on email
// match, per the locked product decision.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertAgencyOrCorporateAccess } from '@/lib/business/org-type-gate'
import { recordBusinessAudit } from '@/lib/business/audit'
import { parseTravellerKind, VALID_TRAVELLER_KINDS } from '@/lib/business/traveller-kind'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // R2.1: layered REFERRAL_PARTNER deny-by-default — client-traveller
  // management is on the explicit deny-list (see lib/business/org-type-gate.ts).
  const access = await assertAgencyOrCorporateAccess(session.user.id, params.id, { minRole: 'COORDINATOR' })
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const travellers = await prisma.businessTraveller.findMany({
    where: { organizationId: params.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    travellers: travellers.map(t => ({
      id: t.id,
      firstName: t.firstName,
      lastName: t.lastName,
      email: t.email,
      phone: t.phone,
      status: t.status,
      travellerKind: t.travellerKind,
      // NEVER leak whether userId is set as a raw id — a boolean "linked"
      // flag is all the client needs.
      linked: !!t.userId,
      createdAt: t.createdAt,
    })),
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await assertAgencyOrCorporateAccess(session.user.id, params.id, { minRole: 'TRAVEL_MANAGER' })
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const body = await req.json().catch(() => null)
  const firstName = typeof body?.firstName === 'string' ? body.firstName.trim() : ''
  const lastName = typeof body?.lastName === 'string' ? body.lastName.trim() : ''
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : null
  // R2.1 — EMPLOYEE | CLIENT. Defaults to EMPLOYEE when omitted, matching
  // the schema default and the R1 backfill for every pre-existing row.
  const travellerKind = parseTravellerKind(body?.travellerKind)

  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: 'firstName, lastName and email are required' }, { status: 400 })
  }
  if (!travellerKind) {
    return NextResponse.json({ error: `travellerKind must be one of: ${VALID_TRAVELLER_KINDS.join(', ')}` }, { status: 400 })
  }

  const traveller = await prisma.businessTraveller.create({
    data: {
      organizationId: params.id,
      firstName,
      lastName,
      email,
      phone,
      travellerKind,
      createdBy: session.user.email ?? session.user.id,
    },
  })

  await recordBusinessAudit({
    organizationId: params.id,
    actorUserId: session.user.id,
    action: 'traveller.create',
    entityType: 'BusinessTraveller',
    entityId: traveller.id,
    after: { firstName, lastName, email, travellerKind },
  })

  return NextResponse.json({ traveller: { id: traveller.id, firstName, lastName, email, phone, status: traveller.status, travellerKind: traveller.travellerKind } }, { status: 201 })
}
