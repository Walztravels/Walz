// app/api/admin/business/organizations/[id]/services/route.ts — Walz Business (R2)
// GET — every TravelRequestService across ONE organization's requests, with
// linked-record summaries. Requires 'b2b'. Scoped by the relation filter
// `travelRequest.organizationId === params.id` — the only way org scope for
// the mature booking domain is resolved (see lib/business/services.ts).

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireB2bStaff, organizationExists, NOT_FOUND } from '@/lib/business/admin-guard'
import { loadLinkedSummaries, serializeServices } from '@/lib/business/services'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireB2bStaff('b2b')
  if (!guard.ok) return guard.response
  if (!(await organizationExists(params.id))) return NOT_FOUND()

  const services = await prisma.travelRequestService.findMany({
    where: { travelRequest: { organizationId: params.id } },
    include: { travelRequest: { select: { id: true, title: true, organizationId: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  // Defence in depth: drop anything whose parent request is not this org.
  const scoped = services.filter(s => s.travelRequest?.organizationId === params.id)
  const summaries = await loadLinkedSummaries(scoped, { includeFinancials: true })
  const serialized = serializeServices(scoped, summaries)

  return NextResponse.json({
    services: serialized.map((s, i) => ({
      ...s,
      requestId: scoped[i].travelRequest.id,
      requestTitle: scoped[i].travelRequest.title,
    })),
  })
}
