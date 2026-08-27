import { NextRequest, NextResponse } from 'next/server'
import { resolveContext } from '@/lib/jade/context-resolver'
import { getModeConfig }  from '@/lib/jade/mode-manager'
import { getServerSession } from 'next-auth'
import { authOptions }    from '@/lib/auth'
import prisma             from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pathname = searchParams.get('pathname') ?? ''
  const tripId   = searchParams.get('tripId')   ?? null

  const ctx    = await resolveContext(pathname)
  const config = getModeConfig(ctx)

  // Optionally attach trip summary for Jade's awareness — auth-gated, no supplier data
  let tripContext: Record<string, unknown> | null = null
  if (tripId) {
    try {
      const session = await getServerSession(authOptions)
      if (session?.user?.email) {
        const user = await prisma.user.findUnique({
          where:  { email: session.user.email },
          select: { id: true },
        })
        if (user) {
          const trip = await prisma.trip.findUnique({
            where:  { id: tripId },
            select: {
              id: true, userId: true, destination: true, origin: true,
              adults: true, children: true, infants: true, status: true,
              items: {
                select: { id: true, type: true, title: true, location: true, startTime: true, cost: true, currency: true, confirmed: true, dayId: true },
                orderBy: [{ dayId: 'asc' }, { order: 'asc' }],
              },
            },
          })
          if (trip && trip.userId === user.id) {
            tripContext = {
              id:          trip.id,
              destination: trip.destination ?? null,
              origin:      trip.origin      ?? null,
              adults:      trip.adults,
              children:    trip.children,
              infants:     trip.infants,
              status:      trip.status,
              itemCount:   trip.items.length,
              items:       trip.items.map(i => ({
                id: i.id, type: i.type, title: i.title, location: i.location,
                startTime: i.startTime, cost: i.cost, currency: i.currency,
                confirmed: i.confirmed, dayId: i.dayId,
              })),
            }
          }
        }
      }
    } catch { /* non-fatal — Jade context still works without trip */ }
  }

  return NextResponse.json({
    mode:           ctx.mode,
    label:          ctx.label,
    welcomeMessage: config.welcomeMessage,
    quickActions:   config.quickActions,
    isEnabled:      config.isEnabled,
    ...(tripContext ? { trip: tripContext } : {}),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
