// POST /api/checkout/trip/[tripId]/validate
// Re-runs revalidation for all eligible TripItems in a trip.
// Called by the checkout review page to get fresh availability/price data.
// Ownership is verified via checkout token.
//
// SECURITY: no supplier payload, rateKeys, or net prices in response.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import prisma                        from '@/lib/db'
import { revalidateAllTripItems }    from '@/lib/checkout/revalidate-trip'
import { verifyCheckoutToken }       from '@/lib/checkout/token'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { tripId: string } },
) {
  const { tripId } = params
  const body = await req.json().catch(() => ({}))
  const { checkoutToken, sessionId } = body as { checkoutToken?: string; sessionId?: string }

  // Resolve owner — authenticated user takes precedence over sessionId
  const authSession = await getServerSession(authOptions).catch(() => null)
  let userId: string | null = null
  if (authSession?.user?.email) {
    const user = await prisma.user.findUnique({
      where:  { email: authSession.user.email },
      select: { id: true },
    })
    userId = user?.id ?? null
  }
  const ownerId = userId ?? sessionId ?? null
  if (!ownerId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Verify checkout token
  if (checkoutToken) {
    const check = verifyCheckoutToken(checkoutToken, tripId, ownerId)
    if (!check.valid) {
      return NextResponse.json({ error: 'Invalid or expired checkout session', reason: check.reason }, { status: 403 })
    }
  } else {
    // Without a token, do ownership check against DB directly
    const trip = await prisma.trip.findUnique({
      where:  { id: tripId },
      select: { userId: true, sessionId: true },
    })
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    const owns =
      (userId && trip.userId === userId) ||
      (!userId && sessionId && trip.sessionId === sessionId)
    if (!owns) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Load TripItems from DB
  const trip = await prisma.trip.findUnique({
    where:  { id: tripId },
    select: {
      currency: true,
      items: {
        select: {
          id:         true,
          type:       true,
          title:      true,
          cost:       true,
          currency:   true,
          confirmed:  true,
          bookingRef: true,
          sourceType: true,
          sourceId:   true,
          metadata:   true,
        },
      },
    },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const result = await revalidateAllTripItems(trip.items)
  return NextResponse.json(result)
}
