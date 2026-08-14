import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { getPageMetrics } from '@/lib/orbit/gsc'

const SUPER_ADMIN = 'super_admin'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [integration, settings] = await Promise.all([
    prisma.orbitIntegration.findUnique({ where: { id: 'google_search_console' } }),
    prisma.orbitSettings.findUnique({ where: { id: 'singleton' } }),
  ])

  const meta = (integration?.meta ?? {}) as Record<string, unknown>
  const serviceAccountJson = meta.serviceAccountJson as string | undefined

  if (!serviceAccountJson) {
    return NextResponse.json({ error: 'GSC service account JSON not configured' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as { auditId?: string }
  if (!body.auditId) return NextResponse.json({ error: 'auditId required' }, { status: 400 })

  const pages = await prisma.orbitAuditPage.findMany({
    where: { auditId: body.auditId },
    select: { id: true, url: true },
  })

  if (pages.length === 0) {
    return NextResponse.json({ enriched: 0, data: [] })
  }

  const endDate = new Date()
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - 28)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const siteUrl = settings?.siteUrl ?? 'https://www.walztravels.com'

  const gscRows = await getPageMetrics({
    serviceAccountJson,
    siteUrl,
    startDate: fmt(startDate),
    endDate: fmt(endDate),
    pageLimit: 1000,
  })

  const gscByUrl = new Map(gscRows.map(r => [r.url, r]))

  const data = pages.map(p => ({
    pageId:      p.id,
    url:         p.url,
    gsc:         gscByUrl.get(p.url) ?? null,
  }))

  return NextResponse.json({
    enriched: data.filter(d => d.gsc).length,
    data,
    dateRange: { start: fmt(startDate), end: fmt(endDate) },
  })
}
