import { NextRequest, NextResponse } from 'next/server'
import prisma                       from '@/lib/db'

export const dynamic = 'force-dynamic'

// Abandonment threshold: cart is abandoned after this many minutes of inactivity
const ABANDON_MINUTES = 60

/**
 * POST /api/cart/session — upsert CartSession
 * Called from CartContext on every cart state change.
 * sessionId is generated client-side (localStorage) and treated as a
 * durable anonymous session identifier.
 */
export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  const { sessionId, userId, leadId, currency, items } =
    (body as Record<string, unknown>) ?? {}

  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64) {
    return NextResponse.json({ ok: false, error: 'invalid sessionId' }, { status: 400 })
  }

  const safeItems = Array.isArray(items) ? items : []
  const totalAmount = safeItems.reduce(
    (sum: number, i: Record<string, unknown>) =>
      sum + (Number(i.price ?? 0) * Number(i.quantity ?? 1)), 0
  )

  await prisma.cartSession.upsert({
    where:  { sessionId },
    create: {
      sessionId,
      items:       safeItems,
      userId:      typeof userId === 'string' ? userId : null,
      leadId:      typeof leadId === 'string' ? leadId : null,
      currency:    typeof currency === 'string' ? currency : 'GBP',
      totalAmount: safeItems.length > 0 ? totalAmount : null,
    },
    update: {
      items:       safeItems,
      totalAmount: safeItems.length > 0 ? totalAmount : null,
      // updatedAt auto-updates via @updatedAt — used as lastActivityAt for abandonment
      ...(typeof userId === 'string' && { userId }),
      ...(typeof leadId === 'string' && { leadId }),
    },
  })

  return NextResponse.json({ ok: true })
}

/**
 * GET /api/cart/session/abandoned — count abandoned carts
 * Used by the revenue dashboard. Admin only via caller checking session.
 */
export async function GET() {
  const threshold = new Date(Date.now() - ABANDON_MINUTES * 60 * 1000)

  const [active, abandoned, converted] = await Promise.all([
    // Active: has items, not converted, updated recently
    prisma.cartSession.count({
      where: {
        convertedAt: null,
        updatedAt:   { gte: threshold },
        // items is not empty (json array length > 0 is hard to query — use totalAmount proxy)
        totalAmount: { gt: 0 },
      },
    }),
    // Abandoned: has items, not converted, inactive for > threshold
    prisma.cartSession.count({
      where: {
        convertedAt: null,
        updatedAt:   { lt: threshold },
        totalAmount: { gt: 0 },
      },
    }),
    // Converted
    prisma.cartSession.count({
      where: { convertedAt: { not: null } },
    }),
  ])

  const abandonedValue = await prisma.cartSession.aggregate({
    where: { convertedAt: null, updatedAt: { lt: threshold }, totalAmount: { gt: 0 } },
    _sum: { totalAmount: true },
  })

  return NextResponse.json({
    active,
    abandoned,
    converted,
    abandonedValue: abandonedValue._sum.totalAmount ?? 0,
    abandonThresholdMinutes: ABANDON_MINUTES,
  })
}
