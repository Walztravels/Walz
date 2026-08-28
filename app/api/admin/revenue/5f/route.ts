// app/api/admin/revenue/5f/route.ts
// Release 5F — Revenue Optimization analytics endpoint
// Protected by finance.revenue permission (same as the main revenue route)

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }          from '@/lib/admin-auth'
import { buildDateRange }           from '@/lib/commercial/metrics'
import { getRelease5FReport }       from '@/lib/commercial/jade-analytics-5f'
import type { DateRangePreset }     from '@/lib/commercial/metrics'

export const dynamic = 'force-dynamic'

function hasRevenueAccess(session: { role: string; permissions: Record<string, boolean> }) {
  return session.permissions.reports_revenue === true
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRevenueAccess(session)) {
    return NextResponse.json({ error: 'Forbidden — Finance access required' }, { status: 403 })
  }

  const url    = new URL(req.url)
  const preset = (url.searchParams.get('preset') ?? 'LAST_30_DAYS') as DateRangePreset

  const dateRange = buildDateRange(preset)

  try {
    const report = await getRelease5FReport(dateRange)
    return NextResponse.json({ ok: true, range: { from: dateRange.from, to: dateRange.to, label: dateRange.label }, report })
  } catch (err: unknown) {
    console.error('[5F analytics] ERROR:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Analytics unavailable' }, { status: 500 })
  }
}
