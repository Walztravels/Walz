// app/api/admin/business/organizations/[id]/requests/route.ts — Walz Business (R2)
// GET — staff view of ONE organization's TravelRequests. Requires 'b2b'.

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireB2bStaff, organizationExists, NOT_FOUND } from '@/lib/business/admin-guard'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireB2bStaff('b2b')
  if (!guard.ok) return guard.response
  if (!(await organizationExists(params.id))) return NOT_FOUND()

  const requests = await prisma.travelRequest.findMany({
    where: { organizationId: params.id },
    include: {
      submittedBy: { select: { id: true, role: true, user: { select: { name: true, email: true } } } },
      _count: { select: { travellers: true, services: true, approvals: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return NextResponse.json({
    requests: requests.map(r => ({
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      requester: r.submittedBy?.user?.name ?? r.submittedBy?.user?.email ?? null,
      travellerCount: r._count.travellers,
      serviceCount: r._count.services,
      approvalCount: r._count.approvals,
    })),
  })
}
