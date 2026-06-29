import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const sessions = await prisma.itineraryHiveSession.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      members: {
        select: {
          id: true,
          slotNumber: true,
          name: true,
          travelStyle: true,
          budget: true,
          isSubmitted: true,
          submittedAt: true,
        },
      },
    },
  })

  return NextResponse.json({ sessions })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as { tripName: string; memberCount: number }

  if (!body.tripName || !body.memberCount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  let slug = ''
  let unique = false
  while (!unique) {
    slug = Math.random().toString(36).substring(2, 10).toUpperCase()
    const existing = await prisma.itineraryHiveSession.findUnique({ where: { slug } })
    if (!existing) unique = true
  }

  const hiveSession = await prisma.itineraryHiveSession.create({
    data: {
      slug,
      tripName:    body.tripName,
      memberCount: body.memberCount,
      members: {
        create: Array.from({ length: body.memberCount }, (_, i) => ({ slotNumber: i + 1 })),
      },
    },
    include: {
      members: { select: { id: true, isSubmitted: true, slotNumber: true } },
    },
  })

  const shareUrl = `https://www.walztravels.com/plan/group-hive/${slug}`

  return NextResponse.json({ session: hiveSession, shareUrl }, { status: 201 })
}
