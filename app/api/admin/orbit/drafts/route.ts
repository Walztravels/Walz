import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status  = searchParams.get('status')
  const briefId = searchParams.get('briefId')

  const drafts = await prisma.orbitContentDraft.findMany({
    where: {
      ...(status  && { status }),
      ...(briefId && { briefId }),
    },
    include: {
      brief: { select: { id: true, title: true, contentType: true } },
      _count: { select: { versions: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ drafts })
}
