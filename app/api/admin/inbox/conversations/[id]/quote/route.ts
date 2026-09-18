import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Create Quote (INBOX UX-4.2 — Client Action Centre).
 *
 * GET — this conversation's recent quotes (safe DTO only: no token, no
 *       cost/markup fields — those only ever leave the server via the
 *       existing admin quote detail route for staff with quotes.view_margin).
 *
 * There is NO POST here. Quote CREATION goes through the existing
 * POST /api/admin/quotes with an added `conversationId` in the body — ONE
 * creation path, extended additively (see app/api/admin/quotes/route.ts).
 * That route performs the full identity gate (VERIFIED/LINKED only) and
 * overrides client fields from the server-resolved context; this route
 * only reads back what was already created.
 */

function parseConversationId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const authz = checkInboxPermission(session, 'inbox_view')
  if (!authz.allowed) return NextResponse.json({ error: authz.error }, { status: authz.status })
  const convId = parseConversationId(params.id)
  if (!convId) return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
  const access = await checkConversationAccess(session, params.id)
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status })

  try {
    const quotes = await prisma.quote.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true, reference: true, title: true, status: true,
        totalMinor: true, currency: true, createdAt: true,
      },
    })
    return NextResponse.json({
      quotes: quotes.map(q => ({
        id: q.id, reference: q.reference, title: q.title, status: q.status,
        totalMinor: Number(q.totalMinor), currency: q.currency,
        createdAt: q.createdAt.toISOString(),
      })),
    })
  } catch (e) {
    console.warn('[action-centre] conversation quote list failed:', (e as Error).message)
    return NextResponse.json({ quotes: [] })
  }
}
