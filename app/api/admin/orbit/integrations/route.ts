import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

const SUPER_ADMIN = 'super_admin'

export const dynamic = 'force-dynamic'

const KNOWN_INTEGRATIONS = [
  { key: 'buffer',                label: 'Buffer',                  description: 'Publish approved campaigns to social channels' },
  { key: 'se_ranking',            label: 'SE Ranking',              description: 'SEO rank tracking and keyword position data' },
  { key: 'google_search_console', label: 'Google Search Console',   description: 'Impressions, clicks, and index coverage per page' },
  { key: 'google_analytics',      label: 'Google Analytics 4',      description: 'Traffic and conversion metrics' },
]

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // OrbitIntegration.id is the integration key (e.g. 'se_ranking')
  const rows = await prisma.orbitIntegration.findMany()
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]))

  const integrations = KNOWN_INTEGRATIONS.map((def) => {
    const row = byId[def.key]
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      connected: row?.connected ?? false,
      lastSyncAt: row?.lastSyncedAt ?? null,
      error: row?.error ?? null,
    }
  })

  return NextResponse.json({ integrations })
}

export async function PATCH(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const key = body.key as string
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  const row = await prisma.orbitIntegration.upsert({
    where: { id: key },
    create: { id: key, connected: false },
    update: body.connected !== undefined ? { connected: body.connected as boolean } : {},
  })

  return NextResponse.json({ integration: row })
}
