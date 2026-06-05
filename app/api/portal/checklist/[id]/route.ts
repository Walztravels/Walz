import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/portal/checklist/[id]  — id is the applicationId
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const application = await prisma.portalApplication.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { checklist: { orderBy: { order: 'asc' } } },
  })

  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    checklist:   application.checklist,
    application: { title: application.title, refNumber: application.refNumber },
  })
}
