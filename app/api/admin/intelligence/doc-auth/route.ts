import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const applicationId = searchParams.get('applicationId')
  const verdict = searchParams.get('verdict')

  const where: Record<string, string> = {}
  if (applicationId) where.applicationId = applicationId
  if (verdict) where.verdict = verdict

  const checks = await prisma.documentAuthenticityCheck.findMany({
    where,
    orderBy: { checkedAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({ checks })
}

/**
 * Disabled: forensic checks are created only by the real analysis
 * pipeline at /api/admin/intelligence/visa-doc-upload — never fabricated
 * here. GET remains; Document History depends on it.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'This endpoint no longer creates document checks. Use the Document Upload & Analysis pipeline instead.',
      code:  'ENDPOINT_DISABLED',
    },
    { status: 405, headers: { Allow: 'GET' } },
  )
}
