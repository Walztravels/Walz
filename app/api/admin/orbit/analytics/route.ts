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

  return NextResponse.json({ snapshots, totals: { ...totals, avgPosition, avgCtr } })
}
