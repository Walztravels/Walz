// app/api/admin/jade-club/purchases/[purchaseId]/retry/route.ts — Release
// 2B: staff-triggered retry for a stuck purchase activation.
//
// Requires 'jade_club.manage' + a mandatory reason. Only ever moves a row
// OUT of FAILED_PERMANENTLY (and only when paymentStatus is SUCCEEDED —
// never retries a purchase whose money was refunded or never captured)
// back into PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING, then immediately
// attempts activation once (so staff get an immediate result rather than
// waiting for the next scheduled reconciliation pass). Fully audited via
// lib/jade-club/purchase-activation.ts::adminResetForRetry.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { adminResetForRetry, attemptActivation } from '@/lib/jade-club/purchase-activation'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { purchaseId: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'jade_club.manage')) {
    return NextResponse.json({ error: 'Forbidden — jade_club.manage required' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const reason = (body as Record<string, unknown>)?.reason

  try {
    await adminResetForRetry(session, params.purchaseId, reason as string)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reset for retry'
    const status = message.startsWith('FORBIDDEN') ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }

  const outcome = await attemptActivation(params.purchaseId)
  return NextResponse.json({ ok: true, outcome })
}
