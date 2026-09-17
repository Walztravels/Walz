import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Staff autocomplete search (UX patch).
 *
 * Minimum identity/display fields only — no security or HR data of any
 * kind. Active staff first, then alphabetical. The id in the payload is
 * for internal resolution and is never shown to the operator.
 */
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  const contains = { contains: q, mode: 'insensitive' as const }
  const staff = await prisma.staff.findMany({
    where: { OR: [{ name: contains }, { email: contains }] },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    take: 20,
    select: { id: true, name: true, email: true, role: true, roleTitle: true, isActive: true },
  })

  return NextResponse.json({
    results: staff.map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.roleTitle || s.role,
      status: s.isActive ? 'Active' : 'Inactive',
    })),
  })
}
