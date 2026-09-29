// app/api/admin/jade-club/policies/route.ts — Release 2A: list + create
// commercial policy versions.
//
// GET requires 'jade_club'. POST (create a new DRAFT version) requires the
// stricter 'jade_club.manage'. Every field is validated explicitly in
// lib/jade-club/commercial-policy.ts::createDraftPolicy — the request body
// is never spread into a Prisma call.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { listPolicies, createDraftPolicy } from '@/lib/jade-club/commercial-policy'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'jade_club')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tier = searchParams.get('tier') ?? undefined
  const market = searchParams.get('market') ?? undefined
  const currency = searchParams.get('currency') ?? undefined

  const policies = await listPolicies({ tier, market, currency })
  return NextResponse.json({ policies })
}

export async function POST(req: NextRequest) {
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

  const effectiveFrom = typeof b.effectiveFrom === 'string' ? new Date(b.effectiveFrom) : (b.effectiveFrom instanceof Date ? b.effectiveFrom : null)
  if (!effectiveFrom || isNaN(effectiveFrom.getTime())) return NextResponse.json({ error: 'Invalid or missing effectiveFrom' }, { status: 400 })

  let effectiveTo: Date | null | undefined
  if (b.effectiveTo !== undefined && b.effectiveTo !== null) {
    const parsed = typeof b.effectiveTo === 'string' ? new Date(b.effectiveTo) : null
    if (!parsed || isNaN(parsed.getTime())) return NextResponse.json({ error: 'Invalid effectiveTo' }, { status: 400 })
    effectiveTo = parsed
  } else {
    effectiveTo = null
  }

  try {
    const policy = await createDraftPolicy(session, {
      tier: b.tier as string,
      market: b.market as string,
      currency: b.currency as string,
      annualPriceMinor: b.annualPriceMinor as number,
      durationMonths: b.durationMonths as number | undefined,
      serviceFeeDiscountPercent: b.serviceFeeDiscountPercent as number,
      effectiveFrom,
      effectiveTo,
      reason: b.reason as string,
    })
    return NextResponse.json({ ok: true, policy })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create policy'
    const status = message.startsWith('FORBIDDEN') ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
