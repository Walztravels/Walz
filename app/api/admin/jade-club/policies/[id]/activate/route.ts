// app/api/admin/jade-club/policies/[id]/activate/route.ts — Release 2A:
// explicit "Activate" action, separate from creation. Requires
// 'jade_club.manage' + a mandatory reason. Atomically supersedes the prior
// ACTIVE policy for the same (tier, market, currency) scope — see
// lib/jade-club/commercial-policy.ts::activatePolicy.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { activatePolicy } from '@/lib/jade-club/commercial-policy'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'jade_club.manage')) {
    return NextResponse.json({ error: 'Forbidden — jade_club.manage required' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const reason = (body as Record<string, unknown> | null)?.reason

  try {
    const policy = await activatePolicy(session, params.id, reason as string)
    return NextResponse.json({ ok: true, policy })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to activate policy'
    const status = message.startsWith('FORBIDDEN') ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
