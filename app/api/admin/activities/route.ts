import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activities = await prisma.activity.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    include: { bookings: { select: { id: true } } },
  })
  return NextResponse.json({ activities })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await req.json()
  if (!data.title || !data.price || !data.location || !data.category || !data.duration) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const slug = data.slug || data.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  const activity = await prisma.activity.create({
    data: { ...data, slug },
  })
  return NextResponse.json({ activity })
}
