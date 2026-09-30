// app/api/admin/jade-club/benefit-snapshots/[snapshotId]/replace-slot/route.ts
// — Release 2A: explicit admin "replacement grant" — creates a genuinely
// NEW entitlement slot row for this benefit snapshot. Never resurrects a
// REVERSED slot. See lib/jade-club/entitlements.ts::createReplacementSlot.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { createReplacementSlot } from '@/lib/jade-club/entitlements'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { snapshotId: string } }) {
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
    const result = await createReplacementSlot(session, params.snapshotId, reason as string)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create replacement slot'
    const status = message.startsWith('FORBIDDEN') ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
