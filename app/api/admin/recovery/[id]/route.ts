// Admin Recovery Opportunity detail + action API (Release 3A)
//
// GET  /api/admin/recovery/[id]         — full detail with timeline
// POST /api/admin/recovery/[id]         — actions: mark_contacted | mark_lost | mark_recovered | dismiss | add_note | schedule_follow_up

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { canSeeAllRecords }          from '@/lib/admin/permissions'
import prisma                        from '@/lib/db'

export const dynamic = 'force-dynamic'

// ── GET — full opportunity detail ─────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const opp = await prisma.recoveryOpportunity.findUnique({
    where: { id: params.id },
  })
  if (!opp) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // RBAC: non-management staff can only see their own opportunities
  const canSeeAll = canSeeAllRecords(session, 'leads')
  if (!canSeeAll && opp.assignedToId && opp.assignedToId !== session.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Enrich with related entity details ────────────────────────────────────
  const [lead, cartSession, activityBooking, tripInfo, assignedStaff, quote] = await Promise.allSettled([
    opp.leadId
      ? prisma.lead.findUnique({ where: { id: opp.leadId }, select: { id: true, name: true, email: true, whatsapp: true, status: true, destination: true, interestLevel: true } })
      : null,
    opp.cartSessionId
      ? prisma.cartSession.findUnique({ where: { id: opp.cartSessionId }, select: { id: true, sessionId: true, totalAmount: true, currency: true, items: true, createdAt: true, updatedAt: true, convertedAt: true } })
      : null,
    opp.activityBookingId
      ? prisma.activityBooking.findUnique({ where: { id: opp.activityBookingId }, select: { id: true, walzReference: true, activityTitle: true, status: true, supplier: true, totalAmount: true, currency: true, clientName: true, clientEmail: true, travelDate: true, failureReason: true, reconciliationAttempts: true } })
      : null,
    opp.tripId
      ? prisma.trip.findUnique({ where: { id: opp.tripId }, select: { id: true, destination: true, status: true, adults: true, currency: true, items: { select: { type: true, title: true, cost: true } } } })
      : null,
    opp.assignedToId
      ? prisma.staff.findUnique({ where: { id: opp.assignedToId }, select: { id: true, name: true, email: true } })
      : null,
    opp.quoteId
      ? prisma.quote.findUnique({ where: { id: opp.quoteId }, select: { id: true, reference: true, clientName: true, clientEmail: true, currency: true, totalMinor: true, viewCount: true, sentAt: true, firstViewedAt: true, lastViewedAt: true, status: true, validUntil: true } })
      : null,
  ])

  // ── Timeline: recent CommercialEvents linked to this opportunity's entities ─
  // Aggregate events by leadId, cartSessionId, bookingId — gives staff context.
  const timelineWhere: Record<string, unknown>[] = []
  if (opp.leadId)    timelineWhere.push({ leadId: opp.leadId })
  if (opp.bookingId) timelineWhere.push({ bookingId: opp.bookingId })

  let timeline: { event: string; createdAt: Date; metadata: unknown }[] = []
  if (timelineWhere.length > 0) {
    timeline = await prisma.commercialEvent.findMany({
      where:   { OR: timelineWhere },
      orderBy: { createdAt: 'desc' },
      take:    20,
      select:  { event: true, createdAt: true, metadata: true },
    })
  }

  return NextResponse.json({
    opportunity:     opp,
    lead:            lead.status            === 'fulfilled' ? lead.value            : null,
    cartSession:     cartSession.status     === 'fulfilled' ? cartSession.value     : null,
    activityBooking: activityBooking.status === 'fulfilled' ? activityBooking.value : null,
    trip:            tripInfo.status        === 'fulfilled' ? tripInfo.value        : null,
    assignedStaff:   assignedStaff.status  === 'fulfilled' ? assignedStaff.value  : null,
    quote:           quote.status           === 'fulfilled' ? quote.value           : null,
    timeline,
  })
}

// ── POST — staff actions ───────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const opp = await prisma.recoveryOpportunity.findUnique({
    where:  { id: params.id },
    select: { id: true, status: true, assignedToId: true },
  })
  if (!opp) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canSeeAll = canSeeAllRecords(session, 'leads')
  if (!canSeeAll && opp.assignedToId && opp.assignedToId !== session.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as {
    action:          string
    note?:           string
    nextActionAt?:   string
    recoveredAmount?: number
    recoveredCurrency?: string
    recoveredBookingId?: string
  }

  const { action } = body

  switch (action) {
    case 'mark_contacted':
      await prisma.recoveryOpportunity.update({
        where: { id: params.id },
        data:  { status: 'CONTACTED', lastActivityAt: new Date() },
      })
      break

    case 'mark_in_progress':
      await prisma.recoveryOpportunity.update({
        where: { id: params.id },
        data:  { status: 'IN_PROGRESS', lastActivityAt: new Date() },
      })
      break

    case 'mark_recovered':
      await prisma.recoveryOpportunity.update({
        where: { id: params.id },
        data: {
          status:            'RECOVERED',
          recoveredAt:       new Date(),
          recoveredAmount:   body.recoveredAmount   ?? null,
          recoveredCurrency: body.recoveredCurrency ?? null,
          recoveredBookingId: body.recoveredBookingId ?? null,
          lastActivityAt:    new Date(),
        },
      })
      break

    case 'mark_lost':
      await prisma.recoveryOpportunity.update({
        where: { id: params.id },
        data:  { status: 'LOST', lastActivityAt: new Date() },
      })
      break

    case 'dismiss':
      await prisma.recoveryOpportunity.update({
        where: { id: params.id },
        data:  { status: 'DISMISSED', lastActivityAt: new Date() },
      })
      break

    case 'add_note': {
      const current = await prisma.recoveryOpportunity.findUnique({
        where:  { id: params.id },
        select: { notes: true },
      })
      const existingNotes = current?.notes ?? ''
      const newNote = `[${session.name} — ${new Date().toISOString().slice(0, 16)}] ${body.note ?? ''}`
      await prisma.recoveryOpportunity.update({
        where: { id: params.id },
        data: {
          notes:         existingNotes ? `${existingNotes}\n${newNote}` : newNote,
          lastActivityAt: new Date(),
        },
      })
      break
    }

    case 'schedule_follow_up':
      await prisma.recoveryOpportunity.update({
        where: { id: params.id },
        data: {
          nextActionAt:  body.nextActionAt ? new Date(body.nextActionAt) : null,
          lastActivityAt: new Date(),
        },
      })
      break

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }

  return NextResponse.json({ ok: true, action })
}
