import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { getCompetitorOverview } from '@/lib/orbit/se-ranking'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const competitor = await prisma.orbitCompetitor.findUnique({ where: { id: params.id } })
  if (!competitor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const seInt  = await prisma.orbitIntegration.findUnique({ where: { id: 'se_ranking' } })
  const seMeta = (seInt?.meta ?? {}) as Record<string, unknown>

  if (!seInt?.connected || !seMeta.apiKey) {
    return NextResponse.json({
      error: 'SE Ranking is not connected. Add your API key in Orbit → Settings.',
    }, { status: 400 })
  }

  const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
  const country  = (settings?.targetCountries?.[0] ?? 'uk').toLowerCase().slice(0, 2)

  const overview = await getCompetitorOverview(seMeta.apiKey as string, competitor.domain, country)

  if (!overview) {
    return NextResponse.json({
      error: `No SE Ranking data found for ${competitor.domain}`,
    }, { status: 404 })
  }

  const snapshot = await prisma.orbitCompetitorSnapshot.create({
    data: {
      competitorId:    params.id,
      organicTraffic:  overview.organicTraffic,
      organicKeywords: overview.organicKeywords,
      domainScore:     overview.domainScore,
      backlinks:       overview.backlinks,
      topKeywords:     overview.topKeywords as object[],
    },
  })

  return NextResponse.json({ snapshot })
}
