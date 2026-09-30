// app/api/admin/business/organizations/[id]/account-manager/route.ts
// Walz Business (Release 2)
//
// POST — assign / change / clear an Organization's account manager.
// Requires 'b2b.manage' + a non-empty reason, and writes a before/after
// audit row (same pattern as status/ and currency/).
//
// The server stays authoritative: the admin UI offers a search-by-name/email
// picker (GET /api/admin/business/staff-search), but whatever the client
// sends is re-verified here against a real, ACTIVE Staff row — exactly the
// verification the R1 creation route performs. A nonexistent or inactive
// Staff email is rejected; nothing unverified is ever stored.

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { recordBusinessAudit } from '@/lib/business/audit'
import { requireB2bStaff, NOT_FOUND, readJsonBody, requiredReason, staffActorId } from '@/lib/business/admin-guard'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireB2bStaff('b2b.manage')
  if (!guard.ok) return guard.response

  const body = await readJsonBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const reason = requiredReason(body.reason)
  if (!reason) return NextResponse.json({ error: 'A reason is required for an account manager change' }, { status: 400 })

  // null / '' = explicitly clear the account manager.
  let nextEmail: string | null = null
  const raw = body.accountManagerEmail
  if (raw !== null && raw !== undefined && raw !== '') {
    if (typeof raw !== 'string' || !raw.trim()) {
      return NextResponse.json({ error: 'accountManagerEmail must be a non-empty string or null' }, { status: 400 })
    }
    const staff = await prisma.staff.findUnique({
      where: { email: raw.trim().toLowerCase() },
      select: { email: true, isActive: true },
    })
    if (!staff || !staff.isActive) {
      return NextResponse.json({ error: 'accountManagerEmail must be an active Staff email' }, { status: 400 })
    }
    nextEmail = staff.email
  } else if (raw === undefined) {
    return NextResponse.json({ error: 'accountManagerEmail is required (use null to clear)' }, { status: 400 })
  }

  const existing = await prisma.organization.findUnique({
    where: { id: params.id },
    select: { id: true, accountManagerId: true },
  })
  if (!existing) return NOT_FOUND()

  if ((existing.accountManagerId ?? null) === nextEmail) {
    return NextResponse.json({ error: 'That is already the account manager' }, { status: 400 })
  }

  const cas = await prisma.organization.updateMany({
    where: { id: params.id, accountManagerId: existing.accountManagerId ?? null },
    data: { accountManagerId: nextEmail },
  })
  if (cas.count !== 1) {
    return NextResponse.json({ error: 'The organization was changed by someone else — reload and try again' }, { status: 409 })
  }

  await recordBusinessAudit({
    organizationId: params.id,
    actorStaffId: staffActorId(guard.session),
    action: 'organization.account_manager_changed',
    entityType: 'Organization',
    entityId: params.id,
    before: { accountManagerId: existing.accountManagerId ?? null },
    after: { accountManagerId: nextEmail, reason },
  })

  return NextResponse.json({ organization: { id: params.id, accountManagerId: nextEmail } })
}
