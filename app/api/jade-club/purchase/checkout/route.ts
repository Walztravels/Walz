// app/api/jade-club/purchase/checkout/route.ts — Jade Travel Club Release
// 2B: authenticated checkout-session creation.
//
// Client sends ONLY { tier, market, currency } — a scope selector, never a
// price. session.user.id (a verified NextAuth server session) is the only
// source of identity ever used — never a client-supplied userId. See
// lib/jade-club/purchase.ts::createJadeClubCheckout for the authoritative
// price resolution.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { createJadeClubCheckout } from '@/lib/jade-club/purchase'

export const dynamic = 'force-dynamic'

const schema = z.object({
  tier: z.string().min(1),
  market: z.string().min(1),
  currency: z.string().min(1),
})

const STATUS_BY_CODE: Record<string, number> = {
  PURCHASES_DISABLED: 503,
  UNAUTHENTICATED: 401,
  INVALID_TIER: 400,
  INVALID_SCOPE: 400,
  POLICY_NOT_FOUND: 409,
  ALREADY_ACTIVE: 409,
  STRIPE_ERROR: 502,
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const origin = req.headers.get('origin') ?? 'https://walztravels.com'

  const result = await createJadeClubCheckout({
    userId: session.user.id,
    customerEmail: session.user.email,
    tier: parsed.data.tier,
    market: parsed.data.market,
    currency: parsed.data.currency,
    origin,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: STATUS_BY_CODE[result.code] ?? 400 })
  }

  return NextResponse.json({ ok: true, purchaseId: result.purchaseId, checkoutUrl: result.checkoutUrl })
}
