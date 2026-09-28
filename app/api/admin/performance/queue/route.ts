import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/performance/authz'
import { buildPerformanceQueue, type QueueFilter } from '@/lib/performance/queue'

export const dynamic = 'force-dynamic'

const VALID_FILTERS: QueueFilter[] = ['ALL', '30', '60', '90', '120', 'UNDER_REVIEW', 'PIP_ACTIVE', 'IMPROVED', 'FOLLOW_UP_DUE']

// GET /api/admin/performance/queue?filter=ALL — Super Admin only.
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.error

  const { searchParams } = new URL(req.url)
  const filterParam = (searchParams.get('filter') ?? 'ALL').toUpperCase()
  const filter = VALID_FILTERS.includes(filterParam as QueueFilter) ? (filterParam as QueueFilter) : 'ALL'

  try {
    const rows = await buildPerformanceQueue(filter)
    return NextResponse.json({ filter, rows })
  } catch (err) {
    console.error('[performance/queue]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to build the performance review queue.' }, { status: 500 })
  }
}
