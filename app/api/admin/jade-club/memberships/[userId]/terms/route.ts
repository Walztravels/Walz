// app/api/admin/jade-club/memberships/[userId]/terms/route.ts — Release
// 2A: read-only commercial-terms/entitlement history for support/audit
// (GET, requires 'jade_club'), and activating a fresh terms period against
// an ACTIVE policy for this member (POST, requires 'jade_club.manage' +
// mandatory reason).

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { ensureJadeClubMembership } from '@/lib/jade-club/membership'
import { activateMembershipTerms, getMembershipTermsHistory } from '@/lib/jade-club/entitlements'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'jade_club')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const membership = await ensureJadeClubMembership(params.userId)
  const history = await getMembershipTermsHistory(membership.id)
  // Release 2B: payment-state view sourced from JadeClubPurchase, scoped
  // to this exact user — never cross-user.
  const purchases = await prisma.jadeClubPurchase.findMany({
    where: { userId: params.userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, tier: true, market: true, currency: true, amountMinor: true,
      provider: true, providerReference: true, paymentStatus: true, activationStatus: true,
      activationAttempts: true, failureReason: true, createdAt: true, paidAt: true, activatedAt: true,
    },
  })
  return NextResponse.json({ membershipId: membership.id, terms: history, purchases })
}

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
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
  if (typeof b.policyId !== 'string' || !b.policyId) return NextResponse.json({ error: 'policyId is required' }, { status: 400 })

  try {
    const membership = await ensureJadeClubMembership(params.userId)
    const result = await activateMembershipTerms(session, membership.id, b.policyId, b.reason as string)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to activate terms'
    const status = message.startsWith('FORBIDDEN') ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
