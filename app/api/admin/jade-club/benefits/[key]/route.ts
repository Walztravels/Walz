// app/api/admin/jade-club/benefits/[key]/route.ts — Admin: update one benefit.
//
// Requires 'jade_club.manage' (enforced again inside adminUpdateBenefit).
// This is the ONLY route in the app that can flip a partner benefit like
// Priority Pass from COMING_SOON to ACTIVE — there is no customer route,
// and no automatic activation happens anywhere else.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { adminUpdateBenefit } from '@/lib/jade-club/benefits'
import { JADE_BENEFIT_STATUSES, JADE_BENEFIT_ACTIVATION_METHODS, JADE_CLUB_TIERS } from '@/lib/jade-club/types'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { key: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { status, eligibleTiers, activationMethod, activationUrl, active } = (body ?? {}) as Record<string, unknown>

  if (status !== undefined && !(JADE_BENEFIT_STATUSES as readonly string[]).includes(status as string)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (eligibleTiers !== undefined) {
    if (!Array.isArray(eligibleTiers) || !eligibleTiers.every(t => (JADE_CLUB_TIERS as readonly string[]).includes(t))) {
      return NextResponse.json({ error: 'Invalid eligibleTiers' }, { status: 400 })
    }
  }
  if (activationMethod !== undefined && activationMethod !== null &&
      !(JADE_BENEFIT_ACTIVATION_METHODS as readonly string[]).includes(activationMethod as string)) {
    return NextResponse.json({ error: 'Invalid activationMethod' }, { status: 400 })
  }
  if (activationUrl !== undefined && activationUrl !== null && typeof activationUrl !== 'string') {
    return NextResponse.json({ error: 'Invalid activationUrl' }, { status: 400 })
  }
  if (active !== undefined && typeof active !== 'boolean') {
    return NextResponse.json({ error: 'Invalid active' }, { status: 400 })
  }

  try {
    const benefit = await adminUpdateBenefit(session, params.key, {
      status: status as never,
      eligibleTiers: eligibleTiers as never,
      activationMethod: activationMethod as never,
      activationUrl: activationUrl as never,
      active,
    })
    return NextResponse.json({ ok: true, benefit })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update benefit'
    const httpStatus = message === 'FORBIDDEN' ? 403 : message === 'Benefit not found' ? 404 : 400
    return NextResponse.json({ error: message }, { status: httpStatus })
  }
}
