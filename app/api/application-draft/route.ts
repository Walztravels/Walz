import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const drafts = await prisma.applicationDraft.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json({ drafts })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    const body = await req.json()
    const draft = await prisma.applicationDraft.create({
      data: {
        userId:          session.user.id,
        destinationIso2: body.destinationIso2,
        serviceType:     body.serviceType,
        draftData:       body.draftData ?? {},
        status:          'draft',
      },
    })
    return NextResponse.json({ draft })
  } catch (err) {
    console.error('application-draft POST error:', err)
    return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    const { id, ...body } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const draft = await prisma.applicationDraft.updateMany({
      where: { id, userId: session.user.id },
      data:  { ...body, updatedAt: new Date() },
    })
    return NextResponse.json({ draft })
  } catch (err) {
    console.error('application-draft PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update draft' }, { status: 500 })
  }
}
