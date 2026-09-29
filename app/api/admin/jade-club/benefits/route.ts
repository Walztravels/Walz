// app/api/admin/jade-club/benefits/route.ts — Admin: list the full benefits catalog.

import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { listAllBenefitsForAdmin } from '@/lib/jade-club/benefits'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const benefits = await listAllBenefitsForAdmin(session)
    return NextResponse.json({ benefits })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load benefits'
    return NextResponse.json({ error: message }, { status: message === 'FORBIDDEN' ? 403 : 400 })
  }
}
