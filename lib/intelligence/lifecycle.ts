import prisma from '@/lib/db'

/**
 * Client Lifecycle (INT-6) — DETERMINISTIC lifecycle states from real
 * events. Replaces the fixed-multiplier pseudo-predictions (LTV = spend
 * × 2.5, two-valued "churn probability") with states a staff member can
 * act on. Every field is derived from actual records; nothing is
 * predicted, and no probability theatre.
 */

export const LIFECYCLE_VERSION = 'int6.1'

export type LifecycleStage =
  | 'NEW'               // registered, nothing else yet
  | 'VISA_IN_PROGRESS'
  | 'VISA_DECIDED'      // decided, nothing booked yet
  | 'QUOTED'            // open quote awaiting response
  | 'BOOKED'            // upcoming/active booking
  | 'POST_TRIP'         // most recent booking completed
  | 'REPEAT_CLIENT'     // 2+ completed bookings
  | 'DORMANT'           // no engagement in 180+ days

export interface LifecycleState {
  version: string
  computedAt: string
  userId: string
  stage: LifecycleStage
  stageBasis: string                  // the record that determined the stage
  outstandingAction: string | null    // what staff should do next
  nextLogicalService: string | null   // flight | hotel | esim | activities | none
  followUpRequired: boolean
  lastEngagementDate: string | null
  totals: {
    bookings: number
    completedBookings: number
    visaApplications: number
    approvedVisas: number
    openQuotes: number
    spendByCurrency: Record<string, number>
  }
}

const DAYS = 86_400_000

export async function deriveLifecycle(userId: string): Promise<LifecycleState | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } })
  if (!user) return null

  const [visaApps, bookings, payments, esims] = await Promise.all([
    prisma.visaApplication.findMany({
      where: { userId, isDraft: false },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, status: true, destinationIso2: true, updatedAt: true, arrivalDate: true },
    }),
    prisma.booking.findMany({
      where: {
        OR: [
          { userId },
          ...(user.email ? [{ contactEmail: { equals: user.email, mode: 'insensitive' as const } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, status: true, totalAmount: true, currency: true, createdAt: true },
    }),
    prisma.portalPayment.findMany({ where: { userId }, select: { paidAt: true, createdAt: true } }).catch(() => []),
    prisma.esimOrder.findMany({ where: { userId }, select: { id: true } }).catch(() => []),
  ])
  const quotes = user.email
    ? await prisma.quote.findMany({
        where: { clientEmail: { equals: user.email, mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, sentAt: true, validUntil: true, createdAt: true },
      }).catch(() => [])
    : []

  const now = new Date()
  const activeBookings    = bookings.filter(b => ['PENDING', 'CONFIRMED'].includes(String(b.status)))
  const completedBookings = bookings.filter(b => String(b.status) === 'COMPLETED')
  const openQuotes        = quotes.filter(q => ['sent', 'viewed'].includes(q.status) && (!q.validUntil || q.validUntil >= now))
  const activeVisa        = visaApps.find(a => !['approved', 'refused'].includes(a.status))
  const decidedVisa       = visaApps.find(a => ['approved', 'refused'].includes(a.status))

  const engagementDates = [
    ...visaApps.map(a => a.updatedAt),
    ...bookings.map(b => b.createdAt),
    ...quotes.map(q => q.sentAt ?? q.createdAt),
    ...payments.map(p => p.paidAt ?? p.createdAt),
  ].filter((d): d is Date => Boolean(d))
  const lastEngagement = engagementDates.length
    ? new Date(Math.max(...engagementDates.map(d => d.getTime())))
    : null
  const dormant = lastEngagement ? now.getTime() - lastEngagement.getTime() > 180 * DAYS : false

  // Stage: most specific active state wins, deterministically.
  let stage: LifecycleStage, stageBasis: string
  if (completedBookings.length >= 2)      { stage = 'REPEAT_CLIENT';    stageBasis = `${completedBookings.length} completed bookings` }
  else if (activeBookings.length > 0)     { stage = 'BOOKED';           stageBasis = `Active ${activeBookings[0].type} booking` }
  else if (openQuotes.length > 0)         { stage = 'QUOTED';           stageBasis = `${openQuotes.length} open quote(s) awaiting response` }
  else if (activeVisa)                    { stage = 'VISA_IN_PROGRESS'; stageBasis = `Visa application ${activeVisa.status} (${activeVisa.destinationIso2.toUpperCase()})` }
  else if (decidedVisa)                   { stage = 'VISA_DECIDED';     stageBasis = `Visa ${decidedVisa.status} (${decidedVisa.destinationIso2.toUpperCase()})` }
  else if (completedBookings.length === 1){ stage = 'POST_TRIP';        stageBasis = 'One completed booking' }
  else                                    { stage = 'NEW';              stageBasis = 'No applications, quotes or bookings yet' }
  if (dormant && !['BOOKED', 'VISA_IN_PROGRESS'].includes(stage)) {
    stage = 'DORMANT'
    stageBasis = `No engagement since ${lastEngagement?.toISOString().slice(0, 10)}`
  }

  // Next logical service — the same deterministic gaps the revenue rules use.
  const hasFlight = bookings.some(b => String(b.type) === 'FLIGHT')
  const hasHotel  = bookings.some(b => String(b.type) === 'HOTEL')
  let nextLogicalService: string | null = null
  let outstandingAction: string | null = null
  if (stage === 'VISA_DECIDED' && decidedVisa?.status === 'approved' && !hasFlight) {
    nextLogicalService = 'flight'
    outstandingAction  = 'Visa approved — offer flights for the approved destination.'
  } else if (stage === 'BOOKED' && hasFlight && !hasHotel) {
    nextLogicalService = 'hotel'
    outstandingAction  = 'Flight booked with no accommodation — offer hotels.'
  } else if (stage === 'BOOKED' && hasFlight && esims.length === 0) {
    nextLogicalService = 'esim'
    outstandingAction  = 'Trip coming up — offer a Jade Connect eSIM.'
  } else if (stage === 'QUOTED') {
    outstandingAction  = 'Follow up on the outstanding quote.'
  } else if (stage === 'VISA_IN_PROGRESS' && activeVisa?.status === 'documents_pending') {
    outstandingAction  = 'Chase the outstanding documents.'
  } else if (stage === 'DORMANT') {
    outstandingAction  = 'Re-engage: check upcoming travel plans.'
  } else if (stage === 'POST_TRIP' || stage === 'REPEAT_CLIENT') {
    nextLogicalService = 'activities'
    outstandingAction  = 'Post-trip: invite feedback and suggest the next trip.'
  }

  const spendByCurrency: Record<string, number> = {}
  for (const b of bookings) {
    if (b.totalAmount == null) continue
    const cur = b.currency ?? 'GBP'
    spendByCurrency[cur] = Math.round(((spendByCurrency[cur] ?? 0) + b.totalAmount) * 100) / 100
  }

  return {
    version: LIFECYCLE_VERSION,
    computedAt: now.toISOString(),
    userId,
    stage, stageBasis,
    outstandingAction, nextLogicalService,
    followUpRequired: Boolean(outstandingAction),
    lastEngagementDate: lastEngagement?.toISOString() ?? null,
    totals: {
      bookings: bookings.length,
      completedBookings: completedBookings.length,
      visaApplications: visaApps.length,
      approvedVisas: visaApps.filter(a => a.status === 'approved').length,
      openQuotes: openQuotes.length,
      spendByCurrency,
    },
  }
}
