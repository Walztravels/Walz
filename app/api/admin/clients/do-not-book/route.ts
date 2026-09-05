import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Do-Not-Book hard-block checks + logged overrides.
 *
 * doNotBook is a HARD signal, distinct from flaggedForReview (soft
 * "look closer"). Booking flows must show a blocking banner and require an
 * explicit, logged acknowledgment before proceeding.
 *
 * Both handlers are resilient to the doNotBook columns not existing yet
 * (pre-migration deploy): a column error degrades to "not flagged" rather
 * than breaking client search or booking flows.
 */

async function lookupDoNotBook(opts: { userId?: string; email?: string }) {
  try {
    let userId = opts.userId
    if (!userId && opts.email) {
      const user = await prisma.user.findFirst({
        where:  { email: { equals: opts.email, mode: 'insensitive' } },
        select: { id: true },
      })
      if (!user) return { doNotBook: false as const, reason: null, userId: null }
      userId = user.id
    }
    if (!userId) return { doNotBook: false as const, reason: null, userId: null }

    const score = await prisma.clientRiskScore.findUnique({
      where:  { userId },
      select: { doNotBook: true, doNotBookReason: true },
    })
    return {
      doNotBook: score?.doNotBook === true,
      reason:    score?.doNotBookReason ?? null,
      userId,
    }
  } catch (e) {
    // Columns not migrated yet, or transient DB error — never block bookings on this
    console.error('[do-not-book] lookup failed:', e)
    return { doNotBook: false as const, reason: null, userId: opts.userId ?? null }
  }
}

/** GET /api/admin/clients/do-not-book?userId=… | ?email=… */
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') ?? undefined
  const email  = searchParams.get('email')  ?? undefined
  if (!userId && !email) {
    return NextResponse.json({ error: 'userId or email required' }, { status: 400 })
  }

  const result = await lookupDoNotBook({ userId, email })
  return NextResponse.json({ doNotBook: result.doNotBook, reason: result.reason })
}

/**
 * POST /api/admin/clients/do-not-book — record an explicit override.
 * Body: { userId?, email?, clientName?, context }
 * Writes an ActivityLog entry with WHO overrode (the logged-in staff member)
 * and WHEN (row timestamp). Booking flows call this BEFORE proceeding.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { userId?: string; email?: string; clientName?: string; context?: string } | null = null
  try { body = await req.json() } catch { /* handled below */ }
  if (!body || (!body.userId && !body.email)) {
    return NextResponse.json({ error: 'userId or email required' }, { status: 400 })
  }

  const context    = (body.context ?? 'booking').slice(0, 80)
  const clientName = (body.clientName ?? '').slice(0, 120)

  // Resolve the acting staff member for the audit record
  const staff = await prisma.staff.findUnique({
    where:  { email: session.email },
    select: { id: true, name: true },
  }).catch(() => null)

  const identity = staff?.name ? `${staff.name} (${session.email})` : session.email

  await prisma.activityLog.create({
    data: {
      staffId:   staff?.id ?? null,
      staffName: staff?.name ?? session.email,
      action:    'Do Not Book Override',
      detail:    `${identity} acknowledged the Do Not Book warning and proceeded with ${context}` +
                 ` for ${clientName || body.email || body.userId}. Client userId: ${body.userId ?? 'resolved by email'}.`,
    },
  })

  return NextResponse.json({ ok: true, overriddenBy: identity, at: new Date().toISOString() })
}
