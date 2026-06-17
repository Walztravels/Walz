import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { status?: string }
  const doc  = await prisma.portalDocument.update({
    where: { id: params.id },
    data: { ...(body.status && { status: body.status }) },
  })
  return NextResponse.json({ document: doc })
}
