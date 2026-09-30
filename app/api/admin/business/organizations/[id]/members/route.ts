// app/api/admin/business/organizations/[id]/members/route.ts — Walz Business (R2)
// GET — staff view of ONE organization's memberships (every status), with
// each membership's active explicit capabilities. Requires 'b2b'. Scoped
// strictly by `organizationId: params.id` — never returns another org's rows.

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireB2bStaff, organizationExists, NOT_FOUND } from '@/lib/business/admin-guard'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireB2bStaff('b2b')
  if (!guard.ok) return guard.response
  if (!(await organizationExists(params.id))) return NOT_FOUND()

  const members = await prisma.organizationMembership.findMany({
    where: { organizationId: params.id },
    include: {
      user: { select: { name: true, email: true } },
      capabilities: {
        where: { organizationId: params.id, revokedAt: null },
        select: { id: true, capability: true, grantedAt: true, grantedByStaffId: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({
    members: members.map(m => ({
      id: m.id,
      name: m.user?.name ?? null,
      email: m.user?.email ?? null,
      role: m.role,
      status: m.status,
      invitedBy: m.invitedBy,
      joinedAt: m.joinedAt,
      createdAt: m.createdAt,
      capabilities: m.capabilities,
    })),
  })
}
