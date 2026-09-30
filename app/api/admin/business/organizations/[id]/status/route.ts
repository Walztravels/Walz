// app/api/admin/business/organizations/[id]/status/route.ts
// Walz Business (Release 1) — SECURITY FIX (delta review).
//
// The ONLY path by which an Organization's lifecycle status may change
// after creation (creation always sets ONBOARDING — see
// app/api/admin/business/organizations/route.ts). Requires 'b2b.manage',
// requires a non-empty reason (mirroring Jade Club's adminAdjustMembership
// mandatory-reason-plus-audit pattern), and always writes a before/after
// BusinessAuditLog row. No route may ever set Organization.status any other
// way — grep the whole codebase for `organization.update` before adding one.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import prisma from '@/lib/db'
import { recordBusinessAudit } from '@/lib/business/audit'
import { VALID_STATUSES } from '@/lib/business/organization-status'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'b2b.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { status, reason } = (body ?? {}) as Record<string, unknown>

  if (typeof status !== 'string' || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'A reason is required for a status change' }, { status: 400 })
  }

  const existing = await prisma.organization.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.status === status) {
    return NextResponse.json({ error: 'Organization is already in that status' }, { status: 400 })
  }

  const updated = await prisma.organization.update({
    where: { id: params.id },
    data: { status },
  })

  await recordBusinessAudit({
    organizationId: updated.id,
    actorStaffId: session.staffId ?? session.email,
    action: 'organization.status_changed',
    entityType: 'Organization',
    entityId: updated.id,
    before: { status: existing.status },
    after: { status: updated.status, reason: reason.trim() },
  })

  return NextResponse.json({ organization: updated })
}
