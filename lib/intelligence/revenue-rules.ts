import prisma from '@/lib/db'

/**
 * Revenue Opportunities rules engine (INT-5) — deterministic detection
 * from actual Walz client behaviour. No model calls, no random values.
 *
 * Every rule emits candidates with a dedupeKey; generation is idempotent
 * (the partial unique index rejects duplicates, and a pre-migration
 * fallback checks for an existing open opportunity). estimatedValue is
 * set ONLY when genuinely calculable from a real record — otherwise 0
 * with no claim. Nothing here contacts a client.
 */

export interface OpportunityCandidate {
  dedupeKey: string
  userId?: string | null
  leadId?: string | null
  type: string
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  estimatedValue: number          // 0 = not calculable; never invented
  currency: string
  actionRequired: string
  deadline?: Date | null
}

const DAYS = 86_400_000

/** R1 — visa approved recently, no flight booked (User-linked or by email). */
async function ruleVisaApprovedNoFlight(now: Date): Promise<OpportunityCandidate[]> {
  const since = new Date(now.getTime() - 180 * DAYS)
  const approved = await prisma.visaApplication.findMany({
    where: { status: 'approved', isDraft: false, updatedAt: { gte: since } },
    select: { id: true, userId: true, email: true, destinationIso2: true, firstName: true, lastName: true },
    take: 200,
  })
  const out: OpportunityCandidate[] = []
  for (const app of approved) {
    // Email union: public-web bookings have userId null, so check both.
    const flight = await prisma.booking.findFirst({
      where: {
        type: 'FLIGHT',
        OR: [
          ...(app.userId ? [{ userId: app.userId }] : []),
          ...(app.email ? [{ contactEmail: { equals: app.email, mode: 'insensitive' as const } }] : []),
        ],
        createdAt: { gte: since },
      },
      select: { id: true },
    })
    if (flight || (!app.userId && !app.email)) continue
    out.push({
      dedupeKey: `VISA_NO_FLIGHT:${app.id}`,
      userId: app.userId, type: 'flight_opportunity', priority: 'high',
      title: `Visa approved — no flight booked (${app.destinationIso2.toUpperCase()})`,
      description: `${[app.firstName, app.lastName].filter(Boolean).join(' ') || 'The client'}'s ${app.destinationIso2.toUpperCase()} visa was approved but no flight has been booked with Walz.`,
      estimatedValue: 0, currency: 'GBP',
      actionRequired: 'Offer flight options for the approved destination and travel dates.',
    })
  }
  return out
}

/** R2 — quote sent/viewed, no response after 48h, still valid. Value = the quote itself. */
async function ruleQuoteFollowUp(now: Date): Promise<OpportunityCandidate[]> {
  const threshold = new Date(now.getTime() - 2 * DAYS)
  const quotes = await prisma.quote.findMany({
    where: {
      status: { in: ['sent', 'viewed'] },
      sentAt: { not: null, lte: threshold },
      acceptedAt: null, declinedAt: null, convertedAt: null,
      validUntil: { gte: now },
    },
    select: { id: true, clientEmail: true, clientName: true, totalMinor: true, currency: true, viewCount: true, validUntil: true },
    take: 100,
  }).catch(() => [])
  return quotes.map(q => ({
    dedupeKey: `QUOTE_FOLLOWUP:${q.id}`,
    type: 'quote_follow_up',
    priority: (q.viewCount ?? 0) > 0 ? 'high' as const : 'medium' as const,
    title: `Quote awaiting response — ${q.clientName ?? q.clientEmail}`,
    description: `Quote sent${(q.viewCount ?? 0) > 0 ? ` and viewed ${q.viewCount} time(s)` : ''} with no response for 48h+.`,
    estimatedValue: q.totalMinor != null ? Number(q.totalMinor) / 100 : 0,
    currency: q.currency ?? 'GBP',
    actionRequired: 'Follow up on the outstanding quote before it expires.',
    deadline: q.validUntil,
  }))
}

/** R3 — flight quote pending/viewed and going stale. Value = displayed price. */
async function ruleFlightQuoteStale(now: Date): Promise<OpportunityCandidate[]> {
  const threshold = new Date(now.getTime() - 2 * DAYS)
  const quotes = await prisma.flightQuote.findMany({
    where: {
      status: { in: ['pending', 'viewed'] },
      createdAt: { lte: threshold },
      approvedAt: null,
      expiresAt: { gte: now },
    },
    select: { id: true, clientEmail: true, clientName: true, displayPrice: true, currency: true, expiresAt: true },
    take: 100,
  }).catch(() => [])
  return quotes.map(q => ({
    dedupeKey: `FLIGHT_QUOTE_STALE:${q.id}`,
    type: 'quote_follow_up', priority: 'medium' as const,
    title: `Flight quote unanswered — ${q.clientName ?? q.clientEmail ?? 'client'}`,
    description: 'A flight quote has been outstanding for 48h+ without approval.',
    estimatedValue: q.displayPrice != null ? Number(q.displayPrice) : 0,
    currency: q.currency ?? 'GBP',
    actionRequired: 'Follow up on the flight quote before fares change.',
    deadline: q.expiresAt,
  }))
}

/** R4/R5 — trip composition gaps on paid/confirmed trips (TripItem types). */
async function ruleTripGaps(): Promise<OpportunityCandidate[]> {
  const trips = await prisma.trip.findMany({
    where: { status: { in: ['PAID', 'CONFIRMING', 'CONFIRMED', 'PARTIALLY_CONFIRMED'] } },
    select: {
      id: true, userId: true, leadId: true, title: true,
      items: { select: { type: true } },
    },
    take: 100,
  }).catch(() => [])
  const out: OpportunityCandidate[] = []
  for (const trip of trips) {
    const types = new Set(trip.items.map(i => String(i.type)))
    const base = { userId: trip.userId, leadId: trip.leadId, estimatedValue: 0, currency: 'GBP' }
    if (types.has('FLIGHT') && !types.has('HOTEL')) {
      out.push({ ...base, dedupeKey: `TRIP_HOTEL_GAP:${trip.id}`, type: 'hotel_opportunity', priority: 'high',
        title: `Trip has flights but no hotel — ${trip.title ?? trip.id}`,
        description: 'A paid trip includes flights with no accommodation booked through Walz.',
        actionRequired: 'Offer hotel options for the trip dates.' })
    }
    if (types.has('HOTEL') && !types.has('TRANSFER') && !types.has('TRANSPORT')) {
      out.push({ ...base, dedupeKey: `TRIP_TRANSFER_GAP:${trip.id}`, type: 'transfer_opportunity', priority: 'medium',
        title: `Trip has a hotel but no transfer — ${trip.title ?? trip.id}`,
        description: 'Accommodation is booked with no airport transfer arranged.',
        actionRequired: 'Offer an airport transfer for arrival and departure.' })
    }
    if ((types.has('FLIGHT') || types.has('HOTEL')) && !types.has('ACTIVITY') && !types.has('TOUR')) {
      out.push({ ...base, dedupeKey: `TRIP_ACTIVITY_GAP:${trip.id}`, type: 'activities_opportunity', priority: 'low',
        title: `Trip without activities — ${trip.title ?? trip.id}`,
        description: 'A booked trip has no activities or tours attached.',
        actionRequired: 'Suggest activities for the destination.' })
    }
    if (types.has('FLIGHT') && !types.has('ESIM')) {
      out.push({ ...base, dedupeKey: `TRIP_ESIM_GAP:${trip.id}`, type: 'esim_opportunity', priority: 'low',
        title: `Trip without an eSIM — ${trip.title ?? trip.id}`,
        description: 'A trip with flights has no Jade Connect eSIM attached.',
        actionRequired: 'Offer a Jade Connect eSIM for the destination.' })
    }
  }
  return out
}

/** R6 — premium itinerary (≥ threshold) → concierge/lounge upsell. */
async function rulePremiumItinerary(): Promise<OpportunityCandidate[]> {
  const itins = await prisma.itinerary.findMany({
    where: { totalPrice: { gte: 5000 }, status: { in: ['sent', 'approved', 'draft'] } },
    select: { id: true, userId: true, title: true, totalPrice: true, currency: true },
    take: 50,
  }).catch(() => [])
  return itins.map(it => ({
    dedupeKey: `PREMIUM_ITIN:${it.id}`,
    userId: it.userId, type: 'concierge_upsell', priority: 'medium' as const,
    title: `Premium itinerary — ${it.title ?? it.id}`,
    description: `A high-value itinerary (${it.currency} ${it.totalPrice?.toLocaleString()}) may suit lounge access, chauffeur or concierge add-ons.`,
    estimatedValue: 0, currency: it.currency ?? 'GBP',
    actionRequired: 'Offer premium add-ons: lounge, chauffeur, concierge.',
  }))
}

export const REVENUE_RULES = [
  ruleVisaApprovedNoFlight, ruleQuoteFollowUp, ruleFlightQuoteStale,
  ruleTripGaps, rulePremiumItinerary,
] as const

/** Run all rules and persist idempotently. Returns created/skipped counts. */
export async function generateRevenueOpportunities(now = new Date()): Promise<{ created: number; skipped: number; errors: number }> {
  let created = 0, skipped = 0, errors = 0
  for (const rule of REVENUE_RULES) {
    let candidates: OpportunityCandidate[] = []
    try { candidates = await (rule.length > 0 ? (rule as (n: Date) => Promise<OpportunityCandidate[]>)(now) : (rule as () => Promise<OpportunityCandidate[]>)()) }
    catch (e) { errors++; console.error('[revenue-rules]', e instanceof Error ? e.message.slice(0, 160) : 'rule failed'); continue }
    for (const c of candidates) {
      try {
        await prisma.revenueOpportunity.create({
          data: {
            dedupeKey: c.dedupeKey, userId: c.userId ?? null, leadId: c.leadId ?? null,
            type: c.type, priority: c.priority, title: c.title.slice(0, 200),
            description: c.description, estimatedValue: c.estimatedValue,
            currency: c.currency, actionRequired: c.actionRequired,
            deadline: c.deadline ?? null,
          },
        })
        created++
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (/unique/i.test(msg)) { skipped++; continue }           // idempotent
        if (/dedupeKey|column/i.test(msg)) {
          // Pre-migration: no dedupeKey column — fall back to an
          // existence check so runs still never duplicate.
          const existing = await prisma.revenueOpportunity.findFirst({
            where: { type: c.type, title: c.title.slice(0, 200), status: 'open' },
            select: { id: true },
          })
          if (existing) { skipped++; continue }
          await prisma.revenueOpportunity.create({
            data: {
              userId: c.userId ?? null, leadId: c.leadId ?? null,
              type: c.type, priority: c.priority, title: c.title.slice(0, 200),
              description: c.description, estimatedValue: c.estimatedValue,
              currency: c.currency, actionRequired: c.actionRequired,
              deadline: c.deadline ?? null,
            } as never,
          }).then(() => created++).catch(() => errors++)
          continue
        }
        errors++
      }
    }
  }
  return { created, skipped, errors }
}
