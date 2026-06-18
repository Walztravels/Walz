import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const items = await prisma.travelAdvisory.findMany({ orderBy: { destinationIso2: 'asc' } })
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await req.json()
  const item = await prisma.travelAdvisory.upsert({
    where:  { destinationIso2: data.destinationIso2 },
    update: {
      advisoryLevel: data.advisoryLevel,
      advisoryText:  data.advisoryText ?? null,
      message:       data.message      ?? null,
      cachedAt:      new Date(),
    },
    create: {
      destinationIso2: data.destinationIso2,
      advisoryLevel:   data.advisoryLevel ?? 1,
      advisoryText:    data.advisoryText  ?? null,
      message:         data.message       ?? null,
    },
  })
  return NextResponse.json({ item })
}
