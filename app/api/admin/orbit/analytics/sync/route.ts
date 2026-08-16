import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { getGscCredentials, getAccessToken, querySearchAnalytics } from '@/lib/orbit/gsc'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { source?: string; days?: number }
  const source = body.source ?? 'gsc'
  const days   = body.days   ?? 7

  if (source === 'gsc') {
    return syncGsc(days)
  }

  // GA4, Meta Ads, Google Ads — show empty state (credentials not yet supported)
  return NextResponse.json({
    synced: 0,
    message: `${source} integration not yet connected. Add credentials in Orbit → Settings → Integrations.`,
    emptyState: true,
  })
}

async function syncGsc(days: number) {
  const gscInt  = await prisma.orbitIntegration.findUnique({ where: { id: 'gsc' } })
  const gscMeta = (gscInt?.meta ?? {}) as Record<string, unknown>

  if (!gscInt?.connected || !gscMeta.serviceAccountJson) {
    return NextResponse.json({ error: 'Google Search Console is not connected.' }, { status: 400 })
  }

  const creds = getGscCredentials(gscMeta)
  if (!creds) return NextResponse.json({ error: 'Invalid GSC credentials' }, { status: 400 })

  const siteUrl = (gscMeta.siteUrl as string) || 'https://www.walztravels.com'
  const token   = await getAccessToken(creds)

  const endDate   = new Date()
  const startDate = new Date(endDate.getTime() - days * 86400000)
  const fmt       = (d: Date) => d.toISOString().split('T')[0]

  // Fetch page-level data
  const rows = await querySearchAnalytics(token, siteUrl, {
    startDate: fmt(startDate),
    endDate:   fmt(endDate),
    dimensions: ['date', 'page'],
    rowLimit:   1000,
  })

  let synced  = 0
  let skipped = 0

  for (const row of rows) {
    const [dateStr, pageUrl] = row.keys
    if (!dateStr || !pageUrl) { skipped++; continue }

    try {
      await prisma.orbitAnalyticsSnapshot.upsert({
        where: { date_source_pageUrl: { date: new Date(dateStr), source: 'gsc', pageUrl } },
        create: {
          date:        new Date(dateStr),
          source:      'gsc',
          pageUrl,
          clicks:      row.clicks,
          impressions: row.impressions,
          ctr:         row.ctr,
          position:    row.position,
        },
        update: {
          clicks:      row.clicks,
          impressions: row.impressions,
          ctr:         row.ctr,
          position:    row.position,
        },
      })
      synced++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ synced, skipped, days, source: 'gsc' })
}
