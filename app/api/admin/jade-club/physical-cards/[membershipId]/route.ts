// app/api/admin/jade-club/physical-cards/[membershipId]/route.ts — Admin: physical card lifecycle.
//
// Requires 'jade_club.manage'. There is NO customer-facing equivalent of
// this route anywhere in the app — a customer can never set their own
// physical-card status (see lib/jade-club/physical-card.ts header).

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { adminSetPhysicalCardStatus } from '@/lib/jade-club/physical-card'
import { JADE_PHYSICAL_CARD_STATUSES } from '@/lib/jade-club/types'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { membershipId: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { status, reason } = (body ?? {}) as Record<string, unknown>

  if (typeof status !== 'string' || !(JADE_PHYSICAL_CARD_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'A reason is required' }, { status: 400 })
  }

  try {
    const card = await adminSetPhysicalCardStatus(session, params.membershipId, status as never, reason)
    return NextResponse.json({ ok: true, card })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update physical card status'
    const httpStatus = message === 'FORBIDDEN' ? 403 : message === 'Membership not found' ? 404 : 400
    return NextResponse.json({ error: message }, { status: httpStatus })
  }
}
