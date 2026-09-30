// app/api/admin/jade-club/policies/[id]/benefits/route.ts — Release 2A:
// add a policy-benefit row to a DRAFT policy. Requires 'jade_club.manage'
// + a mandatory reason. Rejected once the parent policy is or ever was
// ACTIVE (enforced in lib/jade-club/commercial-policy.ts).

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { addPolicyBenefit } from '@/lib/jade-club/commercial-policy'

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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const b = (body ?? {}) as Record<string, unknown>

  try {
    const benefit = await addPolicyBenefit(session, params.id, {
      benefitKey: b.benefitKey as string,
      entitlementType: b.entitlementType as string,
      countPerPeriod: b.countPerPeriod as number | null | undefined,
      costCapMinorUsd: b.costCapMinorUsd as number | null | undefined,
      booleanEligible: b.booleanEligible as boolean | null | undefined,
      reason: b.reason as string,
    })
    return NextResponse.json({ ok: true, benefit })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add policy benefit'
    const status = message.startsWith('FORBIDDEN') ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
