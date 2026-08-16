import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const source  = searchParams.get('source') ?? 'gsc'
  const days    = parseInt(searchParams.get('days') ?? '28')
  const pageUrl = searchParams.get('pageUrl')

  const from = new Date(Date.now() - days * 86400000)

  const snapshots = await prisma.orbitAnalyticsSnapshot.findMany({
    where: {
      source,
      date: { gte: from },
      ...(pageUrl && { pageUrl }),
    },
    orderBy: { date: 'asc' },
  })

  // Aggregate totals
  const totals = snapshots.reduce(
    (acc, s) => ({
      clicks:      acc.clicks      + (s.clicks      ?? 0),
      impressions: acc.impressions + (s.impressions ?? 0),
      sessions:    acc.sessions    + (s.sessions    ?? 0),
      conversions: acc.conversions + (s.conversions ?? 0),
    }),
    { clicks: 0, impressions: 0, sessions: 0, conversions: 0 },
  )

  const avgPosition = snapshots.filter(s => s.position).length > 0
    ? snapshots.reduce((sum, s) => sum + (s.position ?? 0), 0) / snapshots.filter(s => s.position).length
    : null

  const avgCtr = snapshots.filter(s => s.ctr).length > 0
    ? snapshots.reduce((sum, s) => sum + (s.ctr ?? 0), 0) / snapshots.filter(s => s.ctr).length
    : null

  // Group snapshots by pageUrl and source for the top-pages table
  const pageMap = new Map<string, { pageUrl: string; source: string; clicks: number; impressions: number; ctr: number | null; position: number | null }>()
  for (const s of snapshots) {
    const key = `${s.pageUrl}__${s.source}`
    const existing = pageMap.get(key)
    if (existing) {
      existing.clicks      += s.clicks ?? 0
      existing.impressions += s.impressions ?? 0
    } else {
      pageMap.set(key, {
        pageUrl:     s.pageUrl ?? '',
        source:      s.source,
        clicks:      s.clicks ?? 0,
        impressions: s.impressions ?? 0,
        ctr:         s.ctr ?? null,
        position:    s.position ?? null,
      })
    }
  }
  const rows = Array.from(pageMap.values()).sort((a, b) => b.clicks - a.clicks)

  return NextResponse.json({
    clicks:      totals.clicks,
    impressions: totals.impressions,
    sessions:    totals.sessions,
    conversions: totals.conversions,
    spend:       0,
    avgPosition,
    avgCtr,
    rows,
  })
}
