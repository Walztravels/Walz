// app/api/business/organizations/[id]/route.ts — Walz Business (Release 1)
// GET — organization profile. Membership required, no minRole (any ACTIVE
// member of the org may view its profile).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertOrgScopedAccess } from '@/lib/business/authz'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await assertOrgScopedAccess(session.user.id, params.id)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const organization = await prisma.organization.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      legalName: true,
      tradingName: true,
      country: true,
      businessEmail: true,
      businessPhone: true,
      status: true,
      defaultCurrency: true,
      market: true,
      createdAt: true,
      organizationType: true,
    },
  })

  // Should be unreachable (assertOrgScopedAccess already confirmed a
  // membership row exists for this organizationId) — fail closed anyway
  // with the same generic response rather than a 500.
  if (!organization) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    organization,
    membership: { role: access.membership.role, status: access.membership.status },
  })
}
