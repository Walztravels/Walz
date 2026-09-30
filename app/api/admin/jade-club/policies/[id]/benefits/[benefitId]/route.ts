// app/api/admin/jade-club/policies/[id]/benefits/[benefitId]/route.ts —
// Release 2A: edit/remove a policy-benefit row. Only permitted while the
// parent policy is still DRAFT (enforced in
// lib/jade-club/commercial-policy.ts) — immutable forever once ACTIVE.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { updatePolicyBenefit, deletePolicyBenefit } from '@/lib/jade-club/commercial-policy'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; benefitId: string } }) {
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
    const benefit = await updatePolicyBenefit(session, params.id, params.benefitId, {
      entitlementType: b.entitlementType as string,
      countPerPeriod: b.countPerPeriod as number | null | undefined,
      costCapMinorUsd: b.costCapMinorUsd as number | null | undefined,
      booleanEligible: b.booleanEligible as boolean | null | undefined,
      reason: b.reason as string,
    })
    return NextResponse.json({ ok: true, benefit })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update policy benefit'
    const status = message.startsWith('FORBIDDEN') ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; benefitId: string } }) {
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
    await deletePolicyBenefit(session, params.id, params.benefitId, reason as string)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete policy benefit'
    const status = message.startsWith('FORBIDDEN') ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
