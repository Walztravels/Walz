import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const documents = await prisma.portalDocument.findMany({
    orderBy: { uploadedAt: 'desc' },
    take: 200,
    include: {
      user:        { select: { name: true, email: true } },
      application: { select: { stage: true } },
    },
  })
  return NextResponse.json({ documents })
}
