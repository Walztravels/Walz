// app/api/admin/business/organizations/[id]/requests/[requestId]/route.ts
// Walz Business (Release 2)
// GET — staff TravelRequest detail. Requires 'b2b'. The request must belong
// to the URL's organization (cross-org guard lives in
// lib/business/request-detail.ts) — a request id from another org is the
// same generic 404 as a nonexistent one.

import { NextRequest, NextResponse } from 'next/server'
import { requireB2bStaff, NOT_FOUND } from '@/lib/business/admin-guard'
import { loadTravelRequestDetail } from '@/lib/business/request-detail'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string; requestId: string } }) {
  const guard = await requireB2bStaff('b2b')
  if (!guard.ok) return guard.response

  const detail = await loadTravelRequestDetail(params.requestId, params.id, { kind: 'staff' })
  if (!detail) return NOT_FOUND()

  return NextResponse.json(detail)
}
