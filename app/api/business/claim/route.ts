// app/api/business/claim/route.ts — Walz Business (Release 2)
// POST { token } — consume a BusinessTraveller account-claim token for the
// SIGNED-IN user. Session required (the claim links the traveller row to
// the caller's own User id; there is no way to claim for someone else).
//
// Every failure — malformed/unknown/expired/replayed/already-claimed token,
// wrong signed-in account, cross-organization context, lost race —
// returns the SAME 404 body, so this endpoint cannot be used to probe which
// tokens exist, whether a traveller is claimed, or which org it belongs to.
// See lib/business/claim.ts::consumeBusinessTravellerClaim().
//
// Consumption only ever happens on this explicit POST (a button press on
// the landing page) — never on a GET — so email link scanners and browser
// prefetch can never burn or accept a claim.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { consumeBusinessTravellerClaim } from '@/lib/business/claim'
import { recordBusinessAudit } from '@/lib/business/audit'

export const dynamic = 'force-dynamic'

const GENERIC_FAILURE = { ok: false, error: 'This link is invalid or has expired' }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const token = body?.token
  const expectedOrganizationId = typeof body?.organizationId === 'string' ? body.organizationId : null

  const result = await consumeBusinessTravellerClaim(token, session.user.id, { expectedOrganizationId })
  if (!result.ok) {
    return NextResponse.json(GENERIC_FAILURE, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  await recordBusinessAudit({
    organizationId: result.organizationId,
    actorUserId: session.user.id,
    action: 'traveller.claimed',
    entityType: 'BusinessTraveller',
    entityId: result.businessTravellerId,
    before: { linked: false },
    after: { linked: true, userId: session.user.id },
  })

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
