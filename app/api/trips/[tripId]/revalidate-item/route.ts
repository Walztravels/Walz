import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import prisma                        from '@/lib/db'
import { revalidateTripActivityItem } from '@/lib/trips/revalidate'

export const dynamic = 'force-dynamic'

function getSessionId(req: NextRequest) {
  return req.headers.get('x-walz-session-id') ?? null
}

// POST /api/trips/[tripId]/revalidate-item
// Checks the latest live price for a single trip item.
// If price changed, the caller must PATCH the item before adding to cart.
export async function POST(
  req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const { tripId } = params
  const session   = await getServerSession(authOptions)
  const sessionId = getSessionId(req)

  const body = await req.json().catch(() => ({}))
  const { itemId } = body as { itemId?: string }
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })

  const trip = await prisma.trip.findUnique({
    where:  { id: tripId },
    select: {
      userId:    true,
      sessionId: true,
      items: {
        where: { id: itemId },
        select: { id: true, cost: true, currency: true, sourceType: true, sourceId: true, metadata: true },
      },
    },
  })

  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const authedUserId = session?.user?.email
    ? (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id
    : null

  const hasAccess =
    (authedUserId && trip.userId === authedUserId) ||
    (sessionId && trip.sessionId === sessionId)
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const item = trip.items[0]
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const result = await revalidateTripActivityItem(item)
  return NextResponse.json(result)
}
