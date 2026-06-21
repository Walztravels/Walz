import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const KEY = 'flights_popular_routes'

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const row = await prisma.siteContent.findUnique({ where: { key: KEY } })
  try {
    return NextResponse.json({ routes: row ? JSON.parse(row.value) : null })
  } catch {
    return NextResponse.json({ routes: null })
  }
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { routes } = await req.json()
  if (!Array.isArray(routes)) return NextResponse.json({ error: 'routes must be an array' }, { status: 400 })
  await prisma.siteContent.upsert({
    where:  { key: KEY },
    update: { value: JSON.stringify(routes) },
    create: { key: KEY, value: JSON.stringify(routes), label: 'Popular Flight Routes', group: 'flights', page: 'flights' },
  })
  return NextResponse.json({ success: true })
}
