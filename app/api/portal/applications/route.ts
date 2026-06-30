import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const userId = (session.user as { id?: string }).id
  const email  = session.user.email

  const orClause = [
    ...(userId ? [{ userId }] : []),
    { email: { equals: email, mode: 'insensitive' as const } },
  ]

  const [visaApps, tripReqs] = await Promise.all([
    prisma.visaApplication.findMany({
      where: { isDraft: false, OR: orClause },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, referenceNumber: true, visaType: true, status: true,
        destinationIso2: true, firstName: true, lastName: true,
        createdAt: true, updatedAt: true, statusMessage: true,
      },
    }),
    prisma.tripRequest.findMany({
      where: { OR: orClause },
      orderBy: { createdAt: 'desc' },
      select: { id: true, destination: true, status: true, createdAt: true },
    }).catch(() => [] as { id: string; destination: string | null; status: string; createdAt: Date }[]),
  ])

  const applications = [
    ...visaApps.map(a => ({ ...a, type: 'visa' as const })),
    ...tripReqs.map(t => ({ ...t, type: 'trip' as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return NextResponse.json({ applications })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!body?.title) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const refNumber = `WZ-${Date.now().toString(36).toUpperCase()}`

  const application = await prisma.portalApplication.create({
    data: {
      userId:      user.id,
      refNumber,
      title:       body.title,
      type:        body.type ?? 'OTHER',
      destination: body.destination ?? null,
      travelDate:  body.travelDate ?? null,
      notes:       body.notes ?? null,
    },
  })

  return NextResponse.json({ application }, { status: 201 })
}
