// app/api/admin/business/staff-search/route.ts — Walz Business (Release 2)
// GET ?q= — search ACTIVE staff by name or email for the account-manager
// picker on the admin organization pages. Requires 'b2b.manage' (it only
// exists to support an account-manager assignment, which needs that
// permission). Returns name/email/roleTitle only — never any auth field.
// This is a convenience for the UI; the assignment routes re-verify the
// chosen email server-side regardless.

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireB2bStaff } from '@/lib/business/admin-guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guard = await requireB2bStaff('b2b.manage')
  if (!guard.ok) return guard.response

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 100)
  if (q.length < 2) return NextResponse.json({ staff: [] })

  const staff = await prisma.staff.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { name: true, email: true, roleTitle: true },
    orderBy: { name: 'asc' },
    take: 10,
  })

  return NextResponse.json({ staff })
}
