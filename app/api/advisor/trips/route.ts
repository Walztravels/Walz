import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

// ── GET — all trips visible to advisors (Admin + Manager) ─────────────────
export async function GET() {
  const admin = await getAdminSession()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const trips = await prisma.trip.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } },
      days: { select: { id: true, dayNumber: true, title: true } },
      items: { select: { id: true, type: true, confirmed: true } },
      proposals: {
        select: { id: true, title: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      collaborators: { select: { id: true, email: true, role: true, status: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ trips })
}
