// app/api/dashboard/club/qr/rotate/route.ts — Customer-triggered QR rotation.
//
// Session-scoped (session.user.id only, never client-supplied). Bumps the
// membership's qrTokenVersion, which invalidates every QR code issued
// before this call (see lib/jade-club/qr-token.ts). No userId parameter is
// ever accepted from the request body — this can never rotate another
// customer's membership.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { rotateOwnVerificationToken } from '@/lib/jade-club/membership'

export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const card = await rotateOwnVerificationToken(session.user.id)
  return NextResponse.json({ ok: true, memberCode: card.memberCode })
}
