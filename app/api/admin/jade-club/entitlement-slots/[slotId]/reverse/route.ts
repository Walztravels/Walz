// app/api/admin/jade-club/entitlement-slots/[slotId]/reverse/route.ts —
// Release 2A: admin reversal of a CONSUMED entitlement slot (audited,
// mandatory reason). Moves the slot to REVERSED — terminal, never
// automatically returns to AVAILABLE. See
// lib/jade-club/entitlements.ts::reverseConsumedSlot.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { reverseConsumedSlot } from '@/lib/jade-club/entitlements'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { slotId: string } }) {
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
    await reverseConsumedSlot(session, params.slotId, reason as string)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reverse slot'
    const status = message.startsWith('FORBIDDEN') ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
