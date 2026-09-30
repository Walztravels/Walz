// app/api/business/invitations/accept/route.ts — Walz Business (Release 2.1)
// POST { token } — consume an OrganizationInvitation token for the
// SIGNED-IN user. Session required (the invitation grants membership to the
// caller's own User id; there is no way to accept on someone else's behalf).
//
// Every security-sensitive failure — malformed/unknown/expired/replayed
// token, account-email mismatch — returns the SAME generic body, so this
// endpoint cannot be used to probe which tokens exist, which organization
// they belong to, or which email they were sent to. See
// lib/business/invitations.ts::acceptOrganizationInvitation() for the full
// non-enumeration contract.
//
// Consumption only ever happens on this explicit POST (a button press on
// the invitation landing page) — never on a GET — so email link scanners
// and browser prefetch can never burn or accept an invitation.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { acceptOrganizationInvitation } from '@/lib/business/invitations'

export const dynamic = 'force-dynamic'

const GENERIC_FAILURE = { ok: false, error: 'This invitation link is invalid or has expired' }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const token = body?.token

  const result = await acceptOrganizationInvitation(token, session.user.id)

  if (!result.ok) {
    if (result.reason === 'already_active_member') {
      return NextResponse.json(
        { ok: false, error: 'You are already a member of this organization' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    return NextResponse.json(GENERIC_FAILURE, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  return NextResponse.json(
    { ok: true, organizationId: result.organizationId, role: result.role },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
