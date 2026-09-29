// app/api/admin/jade-club/policies/[id]/route.ts — Release 2A: one policy
// version + its benefit rows. GET only — mutation happens on the
// dedicated /activate and /benefits sub-routes.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { getPolicyWithBenefits } from '@/lib/jade-club/commercial-policy'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'jade_club')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result = await getPolicyWithBenefits(params.id)
  if (!result) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
  return NextResponse.json(result)
}
