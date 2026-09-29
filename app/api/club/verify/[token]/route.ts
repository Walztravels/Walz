// app/api/club/verify/[token]/route.ts — PUBLIC Jade Card verification API.
//
// No authentication required by design (this is what a QR scan resolves
// to), but this route NEVER creates a session/cookie and NEVER returns
// anything beyond the minimal public view in lib/jade-club/verify.ts.
// Invalid/forged/stale tokens all return the same generic 404-shaped body
// (no reason is disclosed beyond what's safe) to avoid giving an attacker a
// signal to iterate on.

import { NextRequest, NextResponse } from 'next/server'
import { verifyJadeClubToken } from '@/lib/jade-club/verify'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token
  if (!token || typeof token !== 'string' || token.length > 2048) {
    return NextResponse.json({ ok: false, error: 'Invalid verification code' }, { status: 404 })
  }

  const result = await verifyJadeClubToken(token)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: 'This membership card could not be verified' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, membership: result.membership }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
