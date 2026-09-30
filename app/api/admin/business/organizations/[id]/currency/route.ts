// app/api/admin/business/organizations/[id]/currency/route.ts
// Walz Business (Release 2)
//
// The ONLY path by which an EXISTING Organization's defaultCurrency may
// change. Deliberately mirrors [id]/status/route.ts exactly: requires
// 'b2b.manage', requires a non-empty reason, rejects a no-op change, and
// always writes a before/after BusinessAuditLog row. It never runs as a
// side effect of any other edit — no other route writes defaultCurrency.
//
// Going forward only: this changes the organization's default billing
// currency for NEW work. It does not (and must not) rewrite the currency of
// any existing Quote/Trip/Itinerary/VisaApplication — those carry their own
// currency and are never touched here.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import prisma from '@/lib/db'
import { recordBusinessAudit } from '@/lib/business/audit'
import { parseOrgCurrency, SUPPORTED_ORG_CURRENCIES } from '@/lib/business/currency'

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
  const { currency: rawCurrency, reason } = (body ?? {}) as Record<string, unknown>

  const currency = parseOrgCurrency(rawCurrency)
  if (!currency) {
    return NextResponse.json(
      { error: `currency must be one of: ${SUPPORTED_ORG_CURRENCIES.join(', ')}` },
      { status: 400 },
    )
  }
  if (typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'A reason is required for a currency change' }, { status: 400 })
  }

  const existing = await prisma.organization.findUnique({
    where: { id: params.id },
    select: { id: true, defaultCurrency: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.defaultCurrency === currency) {
    return NextResponse.json({ error: 'Organization already uses that currency' }, { status: 400 })
  }

  // Compare-and-swap on the currency we just read, so two concurrent admin
  // edits can never silently overwrite each other (same discipline as the
  // TravelApproval CAS): the loser gets a 409 and must re-read.
  const cas = await prisma.organization.updateMany({
    where: { id: params.id, defaultCurrency: existing.defaultCurrency },
    data: { defaultCurrency: currency },
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
    action: 'organization.currency_changed',
    entityType: 'Organization',
    entityId: params.id,
    before: { defaultCurrency: existing.defaultCurrency },
    after: { defaultCurrency: currency, reason: reason.trim().slice(0, 2000) },
  })

  return NextResponse.json({ organization: { id: params.id, defaultCurrency: currency } })
}
