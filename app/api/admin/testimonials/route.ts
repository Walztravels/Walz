import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const items = await prisma.testimonial.findMany({ orderBy: { sortOrder: 'asc' } })
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await req.json()
  const item = await prisma.testimonial.create({
    data: {
      name:      data.name,
      location:  data.location,
      trip:      data.trip,
      rating:    data.rating ?? 5,
      text:      data.text,
      initials:  data.initials || data.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
      active:    data.active ?? true,
      sortOrder: data.sortOrder ?? 99,
    },
  })
  return NextResponse.json({ item })
}
