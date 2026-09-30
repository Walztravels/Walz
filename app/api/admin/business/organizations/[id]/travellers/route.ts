// app/api/admin/business/organizations/[id]/travellers/route.ts — Walz Business (R2)
// GET — staff view of ONE organization's BusinessTravellers, with a derived
// account-claim state. Requires 'b2b'. Never returns the raw claim token or
// the linked userId — only a boolean/enum state.

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireB2bStaff, organizationExists, NOT_FOUND } from '@/lib/business/admin-guard'
import { claimState } from '@/lib/business/claim'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireB2bStaff('b2b')
  if (!guard.ok) return guard.response
  if (!(await organizationExists(params.id))) return NOT_FOUND()

  const travellers = await prisma.businessTraveller.findMany({
    where: { organizationId: params.id },
    orderBy: { createdAt: 'desc' },
  })

  const now = new Date()
  return NextResponse.json({
    travellers: travellers.map(t => ({
      id: t.id,
      firstName: t.firstName,
      lastName: t.lastName,
      email: t.email,
      phone: t.phone,
      status: t.status,
      createdBy: t.createdBy,
      createdAt: t.createdAt,
      linked: !!t.userId,
      claimState: claimState(t, now),
      claimVerifiedAt: t.claimVerifiedAt,
    })),
  })
}
