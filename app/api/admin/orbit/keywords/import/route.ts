import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { getGscCredentials, getAccessToken, querySearchAnalytics } from '@/lib/orbit/gsc'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    days?: number; country?: string; groupId?: string
  }

  const days    = body.days    ?? 28
  const country = body.country ?? 'gb'

  // Load GSC credentials
  const gscInt = await prisma.orbitIntegration.findUnique({ where: { id: 'gsc' } })
  const gscMeta = (gscInt?.meta ?? {}) as Record<string, unknown>

  if (!gscInt?.connected || !gscMeta.serviceAccountJson) {
    return NextResponse.json({
      error: 'Google Search Console is not connected. Add credentials in Orbit → Settings.',
    }, { status: 400 })
  }

  const creds = getGscCredentials(gscMeta)
  if (!creds) return NextResponse.json({ error: 'Invalid GSC credentials' }, { status: 400 })

  const siteUrl = (gscMeta.siteUrl as string) || 'https://www.walztravels.com'

  const endDate   = new Date()
  const startDate = new Date(endDate.getTime() - days * 86400000)
  const fmt       = (d: Date) => d.toISOString().split('T')[0]

  let token: string
  try {
    token = await getAccessToken(creds)
  } catch {
    return NextResponse.json({ error: 'Failed to authenticate with Google' }, { status: 502 })
  }

  // Query GSC for keyword-level data
  let rows: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> = []
  try {
    rows = await querySearchAnalytics(token, siteUrl, {
      startDate: fmt(startDate),
      endDate:   fmt(endDate),
      dimensions: ['query'],
      rowLimit:   500,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch data from Search Console' }, { status: 502 })
  }

  // Upsert keywords and write ranking snapshots
  const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
  const excluded = new Set((settings?.keywordExclusions ?? []).map(k => k.toLowerCase()))

  let imported = 0
  let skipped  = 0

  for (const row of rows) {
    const keyword = row.keys[0]?.trim().toLowerCase() ?? ''
    if (!keyword || excluded.has(keyword)) { skipped++; continue }

    try {
      const kw = await prisma.orbitKeyword.upsert({
        where: { keyword_country_language_device: { keyword, country, language: 'en', device: 'desktop' } },
        create: {
          keyword,
          country,
          language: 'en',
          device:   'desktop',
          source:   'gsc',
          groupId:  body.groupId ?? undefined,
          intent:   inferIntent(keyword),
        },
        update: {
          source: 'gsc',
          ...(body.groupId && { groupId: body.groupId }),
        },
      })

      await prisma.orbitKeywordRanking.create({
        data: {
          keywordId:   kw.id,
          position:    row.position,
          impressions: row.impressions,
          clicks:      row.clicks,
          ctr:         row.ctr,
          source:      'gsc',
          recordedAt:  new Date(),
        },
      })

      imported++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ imported, skipped, total: rows.length })
}

function inferIntent(keyword: string): string {
  const kw = keyword.toLowerCase()
  if (/\b(buy|book|price|cost|cheap|deal|flight|visa|ticket|pay|order)\b/.test(kw)) return 'transactional'
  if (/\b(best|top|compare|vs|review|agency|guide|how to get|requirements)\b/.test(kw)) return 'commercial'
  if (/\b(what|why|how|when|where|who|explain|is|are|does|do)\b/.test(kw)) return 'informational'
  return 'informational'
}
