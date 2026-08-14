import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

const SUPER_ADMIN = 'super_admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
  return NextResponse.json({
    settings: settings ?? {
      siteUrl: 'https://www.walztravels.com',
      brandName: 'WalzTravels',
      brandSuffix: '| WalzTravels',
    },
  })
}

export async function PUT(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as Record<string, string>
  const { siteUrl, brandName, brandSuffix } = body

  if (!siteUrl) return NextResponse.json({ error: 'siteUrl required' }, { status: 400 })

  const settings = await prisma.orbitSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', siteUrl, brandName: brandName ?? 'WalzTravels', brandSuffix: brandSuffix ?? '| WalzTravels' },
    update: { siteUrl, brandName, brandSuffix },
  })

  return NextResponse.json({ settings })
}
