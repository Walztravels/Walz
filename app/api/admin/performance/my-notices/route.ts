import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireAuthenticatedStaff } from '@/lib/performance/authz'

export const dynamic = 'force-dynamic'

// GET /api/admin/performance/my-notices — the caller's OWN issued
// performance notices only (mission brief §9/§12). staffId is always
// session.id — never accepted from a query param, so this can never be
// used to enumerate another employee's notices.
export async function GET(_req: NextRequest) {
  const auth = await requireAuthenticatedStaff()
  if (!auth.ok) return auth.error
  const { session } = auth

  const documents = await prisma.staffPerformanceDocument.findMany({
    where: {
      staffId: session.staffId ?? session.id,
      status: { in: ['ISSUED', 'ACKNOWLEDGED'] },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      warningType: true,
      status: true,
      reviewDate: true,
      deliveredAt: true,
      openedAt: true,
      acknowledgedAt: true,
      employeeResponseAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ documents })
}
