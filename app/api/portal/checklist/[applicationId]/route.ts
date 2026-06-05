import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { applicationId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify application belongs to user
  const application = await prisma.portalApplication.findFirst({
    where: { id: params.applicationId, userId: user.id },
    include: { checklist: { orderBy: { order: 'asc' } } },
  })

  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ checklist: application.checklist, application: { title: application.title, refNumber: application.refNumber } })
}
