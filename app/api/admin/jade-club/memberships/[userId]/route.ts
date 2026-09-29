// app/api/admin/jade-club/memberships/[userId]/route.ts — Admin: view + adjust one membership.
//
// GET requires 'jade_club'. PATCH (the only mutation path for tier/status/
// expiry in the whole app) requires the stricter 'jade_club.manage' and is
// fully server-authoritative: `userId` comes from the URL path (an admin
// decision, not a customer request), every mutation is applied through
// lib/jade-club/membership.ts::adminAdjustMembership, which itself
// re-checks the permission and always writes a before/after ActivityLog
// row. A `reason` is mandatory.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import prisma from '@/lib/db'
import { adminAdjustMembership } from '@/lib/jade-club/membership'
import { isJadeClubTier, isJadeClubMembershipStatus } from '@/lib/jade-club/types'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'jade_club')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const membership = await prisma.jadeClubMembership.findUnique({
    where: { userId: params.userId },
    include: { user: { select: { name: true, email: true } }, physicalCard: true },
  })
  if (!membership) {
    // Not an error — this user is Jade Free by default (no row created yet).
    return NextResponse.json({ membership: null })
  }

  return NextResponse.json({
    membership: {
      userId: membership.userId,
      memberCode: membership.memberCode,
      name: membership.user.name,
      email: membership.user.email,
      tier: membership.tier,
      status: membership.status,
      source: membership.source,
      startedAt: membership.startedAt,
      expiresAt: membership.expiresAt,
      physicalCard: membership.physicalCard,
    },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
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
  const { tier, status, expiresAt, reason } = (body ?? {}) as Record<string, unknown>

  if (typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'A reason is required' }, { status: 400 })
  }
  if (tier !== undefined && !isJadeClubTier(tier)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
  }
  if (status !== undefined && !isJadeClubMembershipStatus(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  let expiresAtDate: Date | null | undefined
  if (expiresAt !== undefined) {
    if (expiresAt === null) {
      expiresAtDate = null
    } else if (typeof expiresAt === 'string') {
      const parsed = new Date(expiresAt)
      if (isNaN(parsed.getTime())) return NextResponse.json({ error: 'Invalid expiresAt' }, { status: 400 })
      expiresAtDate = parsed
    } else {
      return NextResponse.json({ error: 'Invalid expiresAt' }, { status: 400 })
    }
  }

  try {
    const updated = await adminAdjustMembership(session, params.userId, {
      tier: tier as never,
      status: status as never,
      expiresAt: expiresAtDate,
      reason,
    })
    return NextResponse.json({ ok: true, membership: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to adjust membership'
    const status = message.startsWith('FORBIDDEN') ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
