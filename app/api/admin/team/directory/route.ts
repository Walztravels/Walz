import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Walz Team Hub — staff directory (mirrors GET /api/admin/staff/search's
 * minimal-field, active-first pattern exactly). No raw DB ids are ever
 * exposed beyond what's needed for internal resolution (the `id` field is
 * used by the client only to start a DM/call, never rendered).
 *
 * Every active staff member is discoverable — there is no "legitimate
 * organizational restriction" found anywhere in this codebase's Staff
 * model that would justify hiding one active staff member from another.
 */
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  // Exact-id lookup mode (e.g. resolving a caller's name from a Twilio
  // identity in IncomingCallOverlay) — same unrestricted directory, just a
  // different filter shape, so no new authorization posture is introduced.
  const id = (url.searchParams.get('id') ?? '').trim()
  const contains = { contains: q, mode: 'insensitive' as const }

  const staff = await prisma.staff.findMany({
    where: id
      ? { id }
      : q.length >= 1
        ? { OR: [{ name: contains }, { roleTitle: contains }, { department: contains }] }
        : {},
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    take: 50,
    select: { id: true, name: true, roleTitle: true, department: true, isActive: true },
  })

  return NextResponse.json({
    results: staff.map(s => ({
      id: s.id,
      name: s.name,
      role: s.roleTitle,
      department: s.department,
      status: s.isActive ? 'Active' : 'Inactive',
    })),
  })
}
