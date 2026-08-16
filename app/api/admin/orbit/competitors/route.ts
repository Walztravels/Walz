import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const competitors = await prisma.orbitCompetitor.findMany({
    where: { active: true },
    include: {
      snapshots: { orderBy: { recordedAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ competitors })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { domain?: string; name?: string }
  if (!body.domain?.trim()) return NextResponse.json({ error: 'domain required' }, { status: 400 })

  const domain = body.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')

  const competitor = await prisma.orbitCompetitor.upsert({
    where: { domain },
    create: { domain, name: body.name ?? domain, active: true },
    update: { active: true, name: body.name ?? undefined },
  })

  return NextResponse.json({ competitor }, { status: 201 })
}
