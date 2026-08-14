import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

const SUPER_ADMIN = 'super_admin'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const audit = await prisma.orbitAudit.findUnique({
    where: { id: params.id },
    include: {
      pages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, url: true, statusCode: true, title: true,
          metaDescription: true, h1Count: true, inSitemap: true,
        },
      },
      issues: {
        orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true, pageId: true, url: true, severity: true, checkName: true,
          title: true, description: true, evidence: true, fixPreview: true,
          status: true, approvedBy: true, approvedAt: true,
        },
      },
    },
  })

  if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ audit })
}
