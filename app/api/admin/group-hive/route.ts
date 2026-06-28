import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const sessions = await prisma.groupHiveSession.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      members: { select: { id: true, isSubmitted: true, slotNumber: true, firstName: true, lastName: true, submittedAt: true } },
    },
  })

  return NextResponse.json({ sessions })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as {
    groupName: string
    visaType: string
    destination: string
    travelDate?: string
    memberCount: number
  }

  if (!body.groupName || !body.visaType || !body.destination || !body.memberCount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const slug = Math.random().toString(36).substring(2, 10).toUpperCase()

  const hiveSession = await prisma.groupHiveSession.create({
    data: {
      slug,
      groupName:   body.groupName,
      visaType:    body.visaType,
      destination: body.destination,
      travelDate:  body.travelDate,
      memberCount: body.memberCount,
      createdBy:   session.email,
      members: {
        create: Array.from({ length: body.memberCount }, (_, i) => ({ slotNumber: i + 1 })),
      },
    },
    include: {
      members: { select: { id: true, isSubmitted: true, slotNumber: true } },
    },
  })

  const shareUrl = `https://www.walztravels.com/group-visa/hive/${slug}`

  return NextResponse.json({ session: hiveSession, shareUrl }, { status: 201 })
}
