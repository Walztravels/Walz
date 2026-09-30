// app/api/admin/business/organizations/[id]/organization-type/route.ts
// Walz Business (Release 2.1)
//
// The ONLY path by which an EXISTING Organization's organizationType may
// change after creation (creation always defaults to CORPORATE — see the
// migration backfill in prisma/migrations/walz_business_r2_1.sql).
// Deliberately mirrors [id]/status/route.ts and [id]/currency/route.ts
// exactly: requires 'b2b.manage', requires a non-empty reason, rejects a
// no-op change, uses a CAS updateMany() (matching the currency route's
// race-safety, not the status route's plain update()), and always writes a
// before/after BusinessAuditLog row. No other route may ever write
// Organization.organizationType — grep the codebase for
// `organizationType` before adding one.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import prisma from '@/lib/db'
import { recordBusinessAudit } from '@/lib/business/audit'
import { parseOrganizationType, VALID_ORGANIZATION_TYPES } from '@/lib/business/organization-type'

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
  const { organizationType: rawType, reason } = (body ?? {}) as Record<string, unknown>

  const organizationType = parseOrganizationType(rawType)
  if (!organizationType) {
    return NextResponse.json(
      { error: `organizationType must be one of: ${VALID_ORGANIZATION_TYPES.join(', ')}` },
      { status: 400 },
    )
  }
  if (typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'A reason is required for an organization-type change' }, { status: 400 })
  }

  const existing = await prisma.organization.findUnique({
    where: { id: params.id },
    select: { id: true, organizationType: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.organizationType === organizationType) {
    return NextResponse.json({ error: 'Organization is already that type' }, { status: 400 })
  }

  // Compare-and-swap so two concurrent admin edits can never silently
  // overwrite each other (same discipline as the currency route).
  const cas = await prisma.organization.updateMany({
    where: { id: params.id, organizationType: existing.organizationType },
    data: { organizationType },
  })
  if (cas.count !== 1) {
    return NextResponse.json(
      { error: 'The organization was changed by someone else — reload and try again' },
      { status: 409 },
    )
  }

  await recordBusinessAudit({
    organizationId: params.id,
    actorStaffId: session.staffId ?? session.email,
    action: 'organization.type_changed',
    entityType: 'Organization',
    entityId: params.id,
    before: { organizationType: existing.organizationType },
    after: { organizationType, reason: reason.trim().slice(0, 2000) },
  })

  return NextResponse.json({ organization: { id: params.id, organizationType } })
}
