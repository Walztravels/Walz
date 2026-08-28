// POST /api/checkout/trip/[tripId]/accept-price
// Explicit customer action: accept a price change for a single TripItem.
// Re-runs revalidation for the specific item to get the authoritative new price,
// then updates TripItem.cost in DB.
//
// SECURITY:
//   - Client provides itemId only — NO price from client (prevents price injection)
//   - New price is fetched from supplier API server-side
//   - Ownership verified via checkout token OR direct DB check
//   - Protected/purchased items cannot be repriced via this endpoint

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import prisma                        from '@/lib/db'
import { verifyCheckoutToken }       from '@/lib/checkout/token'
import { revalidateAllTripItems }    from '@/lib/checkout/revalidate-trip'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { tripId: string } },
) {
  const { tripId } = params
  const body = await req.json().catch(() => ({}))
  const { itemId, checkoutToken, sessionId } = body as {
    itemId?: string
    checkoutToken?: string
    sessionId?: string
  }

  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 })

  // Resolve owner
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
  if (!ownerId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  // Ownership check
  const trip = await prisma.trip.findUnique({
    where:  { id: tripId },
    select: { userId: true, sessionId: true },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  if (checkoutToken) {
    const check = verifyCheckoutToken(checkoutToken, tripId, ownerId)
    if (!check.valid) {
      return NextResponse.json({ error: 'Invalid or expired checkout session', reason: check.reason }, { status: 403 })
    }
  } else {
    const owns =
      (userId && trip.userId === userId) ||
      (!userId && sessionId && trip.sessionId === sessionId)
    if (!owns) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Fetch the specific item
  const item = await prisma.tripItem.findUnique({
    where:  { id: itemId },
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
      tripId:     true,
    },
  })
  if (!item)              return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (item.tripId !== tripId) return NextResponse.json({ error: 'Item does not belong to this trip' }, { status: 400 })
  if (item.confirmed || item.bookingRef) {
    return NextResponse.json({ error: 'This item is already purchased and cannot be repriced.' }, { status: 409 })
  }

  // Re-run revalidation server-side to get authoritative new price
  const revalResult = await revalidateAllTripItems([item])
  const itemResult  = revalResult.items[0]

  if (!itemResult || itemResult.status === 'SOLD_OUT') {
    return NextResponse.json({ error: 'This item is no longer available.', status: 'SOLD_OUT' }, { status: 409 })
  }
  if (itemResult.status === 'EXPIRED') {
    return NextResponse.json({ error: 'This flight offer has expired. Please search for current fares.', status: 'EXPIRED' }, { status: 409 })
  }
  if (itemResult.status === 'REVALIDATION_FAILED') {
    return NextResponse.json({ error: 'Could not reach the supplier to confirm the new price. Please try again.', status: 'REVALIDATION_FAILED' }, { status: 503 })
  }

  const newPrice = itemResult.latestPrice ?? item.cost
  if (newPrice == null) {
    return NextResponse.json({ error: 'Could not determine new price.' }, { status: 500 })
  }

  // Update TripItem.cost to the authoritative new price
  await prisma.tripItem.update({
    where: { id: itemId },
    data:  { cost: newPrice },
  })

  return NextResponse.json({
    ok:           true,
    itemId,
    previousPrice: item.cost,
    newPrice,
    currency:     item.currency,
    message: `Price updated to ${item.currency} ${newPrice.toFixed(2)}.`,
  })
}
