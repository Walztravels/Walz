import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { getDomainOverview, getTopKeywords } from '@/lib/orbit/se-ranking'

const SUPER_ADMIN = 'super_admin'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [integration, settings] = await Promise.all([
    prisma.orbitIntegration.findUnique({ where: { id: 'se_ranking' } }),
    prisma.orbitSettings.findUnique({ where: { id: 'singleton' } }),
  ])

  const meta = (integration?.meta ?? {}) as Record<string, unknown>
  const apiKey = meta.apiKey as string | undefined

  if (!apiKey) {
    return NextResponse.json({ error: 'SE Ranking API key not configured' }, { status: 400 })
  }

  const domain = (settings?.siteUrl ?? 'https://www.walztravels.com')
    .replace(/^https?:\/\//, '').replace(/\/$/, '')

  const [overview, keywords] = await Promise.all([
    getDomainOverview(apiKey, domain),
    getTopKeywords(apiKey, domain, 20),
  ])

  return NextResponse.json({ domain, overview, keywords })
}
