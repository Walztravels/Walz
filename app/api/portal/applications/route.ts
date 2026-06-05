import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const applications = await prisma.portalApplication.findMany({
    where: { userId: user.id },
    include: {
      documents: { select: { id: true, status: true } },
      payments:  { select: { id: true, amount: true, currency: true, status: true } },
      checklist: { select: { id: true, completedAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

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
