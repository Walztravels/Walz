// lib/jade/commercial-context.ts
// Release 5A — Jade Sales Intelligence: Commercial Customer Context
//
// SECURITY:
//   - Never returns partnerNetPrice, supplierCost, rateKey, markup, supplier credentials
//   - All journey-stage and payment decisions come from authoritative DB state only
//   - LLM receives a compact summary; the full context object stays server-side

import prisma from '@/lib/db'

// ─── Journey Stage ────────────────────────────────────────────────────────────

export type JourneyStage =
  | 'NEW_LEAD'
  | 'DISCOVERY'
  | 'SEARCHING'
  | 'TRIP_BUILDING'
  | 'TRIP_READY'
  | 'PROPOSAL_DRAFT'
  | 'PROPOSAL_SENT'
  | 'PROPOSAL_ACCEPTED'
  | 'CHECKOUT_STARTED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'SUPPLIER_CONFIRMING'
  | 'PARTIALLY_CONFIRMED'
  | 'CONFIRMED'
  | 'RECOVERY'
  | 'POST_BOOKING'

// ─── Types ────────────────────────────────────────────────────────────────────

export type IntentLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'TRANSACTIONAL'

export type MissingComponent = 'FLIGHT' | 'HOTEL' | 'TRANSFER' | 'ACTIVITY' | 'ESIM'

export type BlockerType =
  | 'STALE_INVENTORY'
  | 'AWAITING_SUPPLIER_CONFIRMATION'
  | 'PARTIAL_SUPPLIER_FAILURE'
  | 'SUPPLIER_FAILURE'
  | 'RECONCILIATION_REQUIRED'
  | 'ACTIVE_RECOVERY'
  | 'UNPAID_PROPOSAL'
  | 'PAYMENT_FAILED'
  | 'STAFF_REVIEW_REQUIRED'

export type NextBestActionType =
  | 'ASK_DESTINATION'
  | 'ASK_DATES'
  | 'ASK_TRAVELERS'
  | 'ASK_BUDGET'
  | 'SEARCH_FLIGHT'
  | 'SEARCH_HOTEL'
  | 'SEARCH_ACTIVITY'
  | 'SEARCH_TRANSFER'
  | 'SEARCH_ESIM'
  | 'COMPLETE_TRIP'
  | 'REQUEST_PROPOSAL'
  | 'PREPARE_CHECKOUT'
  | 'FOLLOW_UP'
  | 'CROSS_SELL'
  | 'ESCALATE_TO_STAFF'
  | 'WAIT_FOR_SUPPLIER'
  | 'NO_ACTION'

export interface TripSummary {
  id:              string
  title:           string
  destination:     string
  status:          string
  startDate:       string | null
  endDate:         string | null
  adults:          number
  children:        number
  currency:        string
  budget:          number | null
  itemCount:       number
  itemTypes:       string[]
  hasStaleItems:   boolean
}

export interface ProposalSummary {
  id:          string
  reference:   string
  status:      string
  currency:    string
  sentAt:      string | null
  acceptedAt:  string | null
  declinedAt:  string | null
  convertedAt: string | null
}

export interface NextBestAction {
  action:         NextBestActionType
  confidence:     'HIGH' | 'MEDIUM' | 'LOW'
  reasons:        string[]
  safeToAutomate: boolean
  requiresStaff:  boolean
}

export interface JadeCommercialContext {
  customer: {
    userId:          string | null
    leadId:          string | null
    leadStatus:      string | null
    jadeAssisted:    boolean
    interestLevel:   string | null
    assignedStaffId: string | null
  }
  journey: {
    stage:         JourneyStage
    nextBestStage: JourneyStage | null
  }
  intent: {
    score:   number
    level:   IntentLevel
    reasons: string[]
  }
  trips:             TripSummary[]
  activeTrip:        TripSummary | null
  proposals:         ProposalSummary[]
  missingComponents: MissingComponent[]
  blockers:          Array<{ type: BlockerType; description: string }>
  opportunities:     string[]
  nextBestAction:    NextBestAction
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface CommercialContextInput {
  userId?:    string | null
  sessionId?: string | null
  leadId?:    string | null
  tripId?:    string | null
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function getJadeCommercialContext(
  input: CommercialContextInput,
): Promise<JadeCommercialContext> {
  const { userId, sessionId, leadId, tripId } = input

  // Parallel DB queries — never block on each other
  const [lead, trips, searchEvents] = await Promise.all([
    resolveLead(userId, leadId),
    resolveTrips(userId, sessionId, tripId),
    resolveRecentSearchEvents(userId, sessionId),
  ])

  const activeTrip = selectActiveTrip(trips, tripId)

  // Proposals linked to the active trip or lead
  const proposals = await resolveProposals(activeTrip?.id ?? null, lead?.id ?? null)

  // Recovery opportunities
  const openRecovery = await resolveOpenRecovery(userId, lead?.id ?? null, activeTrip?.id ?? null)

  // Build journey stage from authoritative state
  const stage = determineJourneyStage({
    lead,
    activeTrip,
    proposals,
    openRecovery,
    hasSearchEvents: searchEvents > 0,
  })

  const missingComponents = detectMissingComponents(activeTrip)
  const blockers          = detectBlockers({ activeTrip, proposals, openRecovery })
  const opportunities     = buildOpportunities({ activeTrip, missingComponents, proposals })

  const { score, level, reasons: intentReasons } = scoreIntent({
    lead,
    activeTrip,
    proposals,
    hasSearchEvents: searchEvents > 0,
  })

  const nextBestAction = getNextBestAction({
    stage,
    activeTrip,
    missingComponents,
    blockers,
    proposals,
    lead,
    intentLevel: level,
  })

  return {
    customer: {
      userId:          userId ?? null,
      leadId:          lead?.id ?? null,
      leadStatus:      lead?.status ?? null,
      jadeAssisted:    lead?.jadeAssisted ?? false,
      interestLevel:   lead?.interestLevel ?? null,
      assignedStaffId: lead?.assignedToId ?? null,
    },
    journey: {
      stage,
      nextBestStage: nextStageAfter(stage),
    },
    intent: {
      score,
      level,
      reasons: intentReasons,
    },
    trips:    trips.map(toTripSummary),
    activeTrip: activeTrip ? toTripSummary(activeTrip) : null,
    proposals,
    missingComponents,
    blockers,
    opportunities,
    nextBestAction,
  }
}

// ─── Compact Summary for LLM System Prompt ───────────────────────────────────

export function buildCommercialContextSummary(ctx: JadeCommercialContext): string {
  const lines: string[] = ['## Commercial Context']

  lines.push(`Intent: ${ctx.intent.level} (score: ${ctx.intent.score})`)
  lines.push(`Journey stage: ${ctx.journey.stage}`)

  if (ctx.activeTrip) {
    const t = ctx.activeTrip
    lines.push(`Active trip: "${t.title}" → ${t.destination} | ${t.status} | ${t.adults}A ${t.children}C`)
    if (t.startDate) lines.push(`  Dates: ${t.startDate}${t.endDate ? ` – ${t.endDate}` : ''}`)
    if (t.itemTypes.length) lines.push(`  Components: ${t.itemTypes.join(', ')}`)
    if (t.budget)           lines.push(`  Budget: ${t.currency} ${t.budget.toLocaleString()}`)
    if (t.hasStaleItems)    lines.push(`  ⚠ Some items may be stale — re-search before checkout`)
  } else {
    lines.push('No active trip')
  }

  if (ctx.missingComponents.length) {
    lines.push(`Missing: ${ctx.missingComponents.join(', ')}`)
  }

  if (ctx.blockers.length) {
    lines.push(`Blockers: ${ctx.blockers.map(b => b.description).join(' | ')}`)
  }

  if (ctx.proposals.length) {
    const p = ctx.proposals[0]
    lines.push(`Proposal: ${p.reference} (${p.status})`)
  }

  lines.push(`Recommended action: ${ctx.nextBestAction.action}`)
  if (ctx.nextBestAction.reasons.length) {
    lines.push(`  Reason: ${ctx.nextBestAction.reasons[0]}`)
  }

  // SECURITY: never include supplier costs, markup, rateKey in the LLM prompt
  return lines.join('\n')
}

// ─── Journey Stage Engine ────────────────────────────────────────────────────

interface StageDetermineInput {
  lead:            Awaited<ReturnType<typeof resolveLead>>
  activeTrip:      RawTrip | null
  proposals:       ProposalSummary[]
  openRecovery:    boolean
  hasSearchEvents: boolean
}

function determineJourneyStage(input: StageDetermineInput): JourneyStage {
  const { lead, activeTrip, proposals, openRecovery, hasSearchEvents } = input

  // Terminal/operational states (authoritative from Trip.status)
  if (activeTrip) {
    const s = activeTrip.status
    if (s === 'CONFIRMED')           return 'CONFIRMED'
    if (s === 'PARTIALLY_CONFIRMED') return 'PARTIALLY_CONFIRMED'
    if (s === 'CONFIRMING')          return 'SUPPLIER_CONFIRMING'
    if (s === 'PAID')                return 'PAID'
    if (s === 'CHECKOUT_STARTED')    return 'CHECKOUT_STARTED'
    if (s === 'COMPLETED')           return 'POST_BOOKING'
  }

  // Recovery supersedes most other stages
  if (openRecovery) return 'RECOVERY'

  // Proposal lifecycle
  if (proposals.length) {
    const latest = proposals[0]
    if (latest.convertedAt)                           return 'CHECKOUT_STARTED'
    if (latest.acceptedAt && !latest.convertedAt)     return 'PROPOSAL_ACCEPTED'
    if (latest.sentAt && !latest.acceptedAt && !latest.declinedAt) return 'PROPOSAL_SENT'
    if (!latest.sentAt)                               return 'PROPOSAL_DRAFT'
  }

  // Trip building stages
  if (activeTrip) {
    const hasMinimumItems = activeTrip.items.some(
      i => ['FLIGHT', 'HOTEL', 'TOUR'].includes(i.type),
    )
    const isComplete = isTripComplete(activeTrip)
    if (isComplete)        return 'TRIP_READY'
    if (hasMinimumItems)   return 'TRIP_BUILDING'
    if (activeTrip.items.length > 0) return 'TRIP_BUILDING'
    return 'SEARCHING'
  }

  if (hasSearchEvents) return 'SEARCHING'

  if (lead?.jadeActive) return 'DISCOVERY'

  return 'NEW_LEAD'
}

function nextStageAfter(stage: JourneyStage): JourneyStage | null {
  const map: Partial<Record<JourneyStage, JourneyStage>> = {
    NEW_LEAD:         'DISCOVERY',
    DISCOVERY:        'SEARCHING',
    SEARCHING:        'TRIP_BUILDING',
    TRIP_BUILDING:    'TRIP_READY',
    TRIP_READY:       'PROPOSAL_DRAFT',
    PROPOSAL_DRAFT:   'PROPOSAL_SENT',
    PROPOSAL_SENT:    'PROPOSAL_ACCEPTED',
    PROPOSAL_ACCEPTED:'CHECKOUT_STARTED',
    CHECKOUT_STARTED: 'PAID',
    PAID:             'SUPPLIER_CONFIRMING',
    SUPPLIER_CONFIRMING: 'CONFIRMED',
    PARTIALLY_CONFIRMED: 'CONFIRMED',
    CONFIRMED:        'POST_BOOKING',
  }
  return map[stage] ?? null
}

// ─── Trip Completeness ────────────────────────────────────────────────────────

function isTripComplete(trip: RawTrip): boolean {
  const types = new Set(trip.items.map(i => i.type))
  const hasFlight = types.has('FLIGHT')
  const hasHotel  = types.has('HOTEL')
  // A trip is "ready" when it has at least a flight + hotel, OR a complete tour package
  return (hasFlight && hasHotel) || types.has('TOUR')
}

function detectMissingComponents(trip: RawTrip | null): MissingComponent[] {
  if (!trip) return []
  const types    = new Set(trip.items.map(i => i.type))
  const missing: MissingComponent[] = []

  const hasFlight   = types.has('FLIGHT')
  const hasHotel    = types.has('HOTEL')
  const hasTransfer = types.has('TRANSFER') || types.has('TRANSPORT')
  const hasActivity = types.has('ACTIVITY') || types.has('TOUR')
  const hasEsim     = types.has('ESIM')
  const destination = trip.destination.trim()

  if (hasFlight && !hasHotel)                             missing.push('HOTEL')
  if (!hasFlight && hasHotel)                             missing.push('FLIGHT')
  if ((hasFlight || hasHotel) && !hasTransfer)            missing.push('TRANSFER')
  if (destination && !hasActivity)                         missing.push('ACTIVITY')
  if (destination && !hasEsim)                            missing.push('ESIM')

  return missing
}

// ─── Blocker Detection ────────────────────────────────────────────────────────

interface BlockerInput {
  activeTrip:   RawTrip | null
  proposals:    ProposalSummary[]
  openRecovery: boolean
}

function detectBlockers(input: BlockerInput): Array<{ type: BlockerType; description: string }> {
  const blockers: Array<{ type: BlockerType; description: string }> = []
  const { activeTrip, proposals, openRecovery } = input

  if (activeTrip?.hasStaleItems) {
    blockers.push({ type: 'STALE_INVENTORY', description: 'One or more items need re-searching — prices or availability may have changed' })
  }

  if (activeTrip?.status === 'CONFIRMING') {
    blockers.push({ type: 'AWAITING_SUPPLIER_CONFIRMATION', description: 'Payment received — awaiting supplier confirmation' })
  }

  if (activeTrip?.status === 'PARTIALLY_CONFIRMED') {
    blockers.push({ type: 'PARTIAL_SUPPLIER_FAILURE', description: 'Some items confirmed; others require attention' })
  }

  if (openRecovery) {
    blockers.push({ type: 'ACTIVE_RECOVERY', description: 'An open recovery opportunity exists for this customer' })
  }

  const acceptedNotPaid = proposals.find(p => p.acceptedAt && !p.convertedAt)
  if (acceptedNotPaid) {
    blockers.push({ type: 'UNPAID_PROPOSAL', description: `Proposal ${acceptedNotPaid.reference} accepted but payment not started` })
  }

  return blockers
}

// ─── Intent Scoring ───────────────────────────────────────────────────────────

interface IntentInput {
  lead:            Awaited<ReturnType<typeof resolveLead>>
  activeTrip:      RawTrip | null
  proposals:       ProposalSummary[]
  hasSearchEvents: boolean
}

function scoreIntent(input: IntentInput): { score: number; level: IntentLevel; reasons: string[] } {
  const { lead, activeTrip, proposals, hasSearchEvents } = input
  let score = 0
  const reasons: string[] = []

  // Lead signals
  if (lead?.interestLevel === 'hot')  { score += 20; reasons.push('Lead marked HOT') }
  if (lead?.interestLevel === 'warm') { score += 10; reasons.push('Lead marked WARM') }
  if (lead?.jadeAssisted)             { score += 5;  reasons.push('Jade-assisted lead') }

  // Trip signals
  if (activeTrip) {
    if (activeTrip.destination) { score += 10; reasons.push('Destination known') }
    if (activeTrip.startDate)   { score += 10; reasons.push('Dates known') }
    if (activeTrip.adults > 0)  { score += 5;  reasons.push('Traveler count known') }
    if (activeTrip.budget)      { score += 5;  reasons.push('Budget specified') }

    const itemBonus = Math.min(activeTrip.items.length * 5, 30)
    if (itemBonus) { score += itemBonus; reasons.push(`${activeTrip.items.length} item(s) in trip`) }

    if (['CHECKOUT_STARTED', 'PAID', 'CONFIRMING', 'CONFIRMED', 'PARTIALLY_CONFIRMED'].includes(activeTrip.status)) {
      score += 40; reasons.push('Payment or checkout initiated')
    }
  }

  // Search signals
  if (hasSearchEvents) { score += 15; reasons.push('Live search triggered') }

  // Proposal signals
  if (proposals.some(p => p.sentAt && !p.acceptedAt && !p.declinedAt)) {
    score += 25; reasons.push('Proposal sent — awaiting decision')
  }
  if (proposals.some(p => p.acceptedAt)) {
    score += 35; reasons.push('Proposal accepted')
  }

  const level: IntentLevel =
    score >= 70 ? 'TRANSACTIONAL' :
    score >= 46 ? 'HIGH' :
    score >= 21 ? 'MEDIUM' :
    'LOW'

  return { score, level, reasons }
}

// ─── Next Best Action ─────────────────────────────────────────────────────────

interface NBAInput {
  stage:             JourneyStage
  activeTrip:        RawTrip | null
  missingComponents: MissingComponent[]
  blockers:          Array<{ type: BlockerType; description: string }>
  proposals:         ProposalSummary[]
  lead:              Awaited<ReturnType<typeof resolveLead>>
  intentLevel:       IntentLevel
}

export function getNextBestAction(input: NBAInput): NextBestAction {
  const { stage, activeTrip, missingComponents, blockers, proposals, lead, intentLevel } = input

  // Operational states — no automated action
  if (stage === 'CONFIRMED' || stage === 'POST_BOOKING') {
    return {
      action: missingComponents.length ? 'CROSS_SELL' : 'NO_ACTION',
      confidence: 'HIGH',
      reasons: stage === 'CONFIRMED' ? ['Trip confirmed — cross-sell opportunity'] : ['Post-booking follow-up window'],
      safeToAutomate: false,
      requiresStaff: false,
    }
  }

  if (stage === 'SUPPLIER_CONFIRMING' || stage === 'PARTIALLY_CONFIRMED') {
    return {
      action: 'WAIT_FOR_SUPPLIER',
      confidence: 'HIGH',
      reasons: ['Awaiting supplier confirmation — no customer action required'],
      safeToAutomate: false,
      requiresStaff: stage === 'PARTIALLY_CONFIRMED',
    }
  }

  // Blocker precedence
  const supplierBlocker = blockers.find(b => ['SUPPLIER_FAILURE', 'PARTIAL_SUPPLIER_FAILURE', 'RECONCILIATION_REQUIRED'].includes(b.type))
  if (supplierBlocker) {
    return {
      action: 'ESCALATE_TO_STAFF',
      confidence: 'HIGH',
      reasons: [supplierBlocker.description],
      safeToAutomate: false,
      requiresStaff: true,
    }
  }

  // Proposal accepted but not paid — nudge to checkout
  if (stage === 'PROPOSAL_ACCEPTED') {
    return {
      action: 'PREPARE_CHECKOUT',
      confidence: 'HIGH',
      reasons: ['Proposal accepted — guide customer to checkout'],
      safeToAutomate: false,
      requiresStaff: false,
    }
  }

  // Proposal sent — wait for response
  if (stage === 'PROPOSAL_SENT') {
    return {
      action: 'NO_ACTION',
      confidence: 'HIGH',
      reasons: ['Proposal sent — awaiting customer decision'],
      safeToAutomate: false,
      requiresStaff: false,
    }
  }

  // Trip ready — suggest proposal
  if (stage === 'TRIP_READY') {
    return {
      action: 'REQUEST_PROPOSAL',
      confidence: 'HIGH',
      reasons: ['Trip is complete — customer may be ready for a proposal'],
      safeToAutomate: false,
      requiresStaff: false,
    }
  }

  // Trip building — fill missing components
  if (stage === 'TRIP_BUILDING') {
    if (missingComponents.includes('HOTEL'))    return nba('SEARCH_HOTEL',    'HIGH', 'Flight added — hotel is next', false)
    if (missingComponents.includes('FLIGHT'))   return nba('SEARCH_FLIGHT',   'HIGH', 'Hotel added — find a flight', false)
    if (missingComponents.includes('TRANSFER')) return nba('SEARCH_TRANSFER', 'MEDIUM', 'Add airport transfer to complete the trip', false)
    if (missingComponents.includes('ACTIVITY')) return nba('SEARCH_ACTIVITY', 'LOW', 'Activities would enhance this trip', false)
    if (missingComponents.includes('ESIM'))     return nba('SEARCH_ESIM',     'LOW', 'International trip — suggest eSIM data', false)
    return nba('COMPLETE_TRIP', 'MEDIUM', 'Trip building in progress', false)
  }

  // Searching — encourage trip creation
  if (stage === 'SEARCHING') {
    return nba('SEARCH_FLIGHT', 'MEDIUM', 'Customer is searching — guide to trip creation', false)
  }

  // Discovery / new lead — qualify
  if (stage === 'DISCOVERY') {
    if (!activeTrip?.destination) return nba('ASK_DESTINATION', 'HIGH', 'Destination unknown', false)
    if (!activeTrip?.startDate)   return nba('ASK_DATES',       'HIGH', 'Travel dates unknown', false)
    if (!activeTrip?.adults)      return nba('ASK_TRAVELERS',   'MEDIUM', 'Traveler count unknown', false)
    if (!activeTrip?.budget)      return nba('ASK_BUDGET',      'MEDIUM', 'Budget unknown', false)
    return nba('SEARCH_FLIGHT', 'MEDIUM', 'Ready to search flights', false)
  }

  if (stage === 'NEW_LEAD') {
    return nba('ASK_DESTINATION', 'HIGH', 'New lead — start discovery', false)
  }

  if (stage === 'RECOVERY') {
    return {
      action: 'FOLLOW_UP',
      confidence: 'MEDIUM',
      reasons: ['Open recovery opportunity — handle via recovery engine'],
      safeToAutomate: false,
      requiresStaff: intentLevel === 'TRANSACTIONAL',
    }
  }

  return nba('NO_ACTION', 'LOW', 'No clear next action', false)
}

function nba(
  action: NextBestActionType,
  confidence: 'HIGH' | 'MEDIUM' | 'LOW',
  reason: string,
  requiresStaff: boolean,
): NextBestAction {
  return {
    action,
    confidence,
    reasons: [reason],
    safeToAutomate: !requiresStaff && ['ASK_DESTINATION', 'ASK_DATES', 'ASK_TRAVELERS', 'ASK_BUDGET', 'SEARCH_FLIGHT', 'SEARCH_HOTEL', 'SEARCH_ACTIVITY', 'SEARCH_TRANSFER', 'SEARCH_ESIM', 'CROSS_SELL'].includes(action),
    requiresStaff,
  }
}

// ─── Opportunities ────────────────────────────────────────────────────────────

interface OpportunityInput {
  activeTrip:        RawTrip | null
  missingComponents: MissingComponent[]
  proposals:         ProposalSummary[]
}

function buildOpportunities(input: OpportunityInput): string[] {
  const { activeTrip, missingComponents, proposals } = input
  const opps: string[] = []

  if (!activeTrip && !proposals.length) return opps

  if (missingComponents.includes('HOTEL') && activeTrip?.destination) {
    opps.push(`Hotel cross-sell: ${activeTrip.destination}`)
  }
  if (missingComponents.includes('FLIGHT') && activeTrip?.destination) {
    opps.push(`Flight cross-sell: ${activeTrip.destination}`)
  }
  if (missingComponents.includes('TRANSFER')) {
    opps.push('Airport transfer upsell')
  }
  if (missingComponents.includes('ACTIVITY') && activeTrip?.destination) {
    opps.push(`Activity upsell: ${activeTrip.destination}`)
  }
  if (missingComponents.includes('ESIM') && activeTrip?.destination) {
    opps.push(`eSIM cross-sell: ${activeTrip.destination}`)
  }

  const acceptedNotPaid = proposals.find(p => p.acceptedAt && !p.convertedAt)
  if (acceptedNotPaid) {
    opps.push(`Checkout opportunity: proposal ${acceptedNotPaid.reference} accepted`)
  }

  return opps
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

interface RawTrip {
  id:          string
  title:       string
  destination: string
  origin:      string | null
  status:      string
  startDate:   Date | null
  endDate:     Date | null
  adults:      number
  children:    number
  currency:    string
  budget:      number | null
  items:       Array<{ type: string; metadata: Record<string, unknown> }>
  hasStaleItems: boolean
}

async function resolveLead(userId?: string | null, leadId?: string | null) {
  // Lead model has no userId field — can only look up by leadId
  void userId
  if (!leadId) return null
  return prisma.lead.findFirst({
    where:  { id: leadId },
    select: {
      id: true, status: true, jadeAssisted: true, jadeActive: true,
      interestLevel: true, assignedToId: true, destination: true,
      travelDate: true, marketingOptOut: true,
    },
    orderBy: { createdAt: 'desc' },
  }).catch(() => null)
}

async function resolveTrips(userId?: string | null, sessionId?: string | null, tripId?: string | null) {
  if (!userId && !sessionId && !tripId) return []
  return prisma.trip.findMany({
    where: {
      OR: [
        ...(userId    ? [{ userId }]    : []),
        ...(sessionId ? [{ sessionId }] : []),
        ...(tripId    ? [{ id: tripId }]: []),
      ],
      status: { notIn: ['CANCELLED'] },
    },
    include: {
      items: {
        select: { type: true, metadata: true, sourceType: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  }).then(trips => trips.map(t => ({
    ...t,
    status:      t.status as string,
    budget:      t.budget ? Number(t.budget) : null,
    hasStaleItems: t.items.some(i => {
      const m = (i.metadata ?? {}) as Record<string, unknown>
      return !!m?.stale
    }),
    items: t.items.map(i => ({
      type:     i.type as string,
      metadata: (i.metadata ?? {}) as Record<string, unknown>,
    })),
  } as RawTrip))).catch(() => [] as RawTrip[])
}

async function resolveRecentSearchEvents(userId?: string | null, sessionId?: string | null): Promise<number> {
  if (!userId && !sessionId) return 0
  return prisma.commercialEvent.count({
    where: {
      event: { in: ['jade_flight_search', 'jade_hotel_search', 'jade_activity_search', 'jade_transfer_search', 'jade_esim_search'] },
      ...(userId    ? { userId }    : {}),
      ...(sessionId ? { sessionId } : {}),
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  }).catch(() => 0)
}

async function resolveProposals(tripId: string | null, leadId: string | null): Promise<ProposalSummary[]> {
  if (!tripId && !leadId) return []
  const quotes = await prisma.quote.findMany({
    where: {
      OR: [
        ...(tripId ? [{ tripId }] : []),
        ...(leadId ? [{ leadId }] : []),
      ],
    },
    select: {
      id: true, reference: true, status: true, currency: true,
      sentAt: true, acceptedAt: true, declinedAt: true, convertedAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  }).catch(() => [])

  return quotes.map(q => ({
    id:          q.id,
    reference:   q.reference,
    status:      q.status,
    currency:    q.currency,
    sentAt:      q.sentAt?.toISOString() ?? null,
    acceptedAt:  q.acceptedAt?.toISOString() ?? null,
    declinedAt:  q.declinedAt?.toISOString() ?? null,
    convertedAt: q.convertedAt?.toISOString() ?? null,
  }))
}

async function resolveOpenRecovery(userId?: string | null, leadId?: string | null, tripId?: string | null): Promise<boolean> {
  if (!userId && !leadId && !tripId) return false
  const opp = await prisma.recoveryOpportunity.findFirst({
    where: {
      status: { in: ['OPEN', 'CONTACTED', 'IN_PROGRESS'] },
      OR: [
        ...(userId ? [{ userId }] : []),
        ...(leadId ? [{ leadId }] : []),
        ...(tripId ? [{ tripId }] : []),
      ],
    },
    select: { id: true },
  }).catch(() => null)
  return !!opp
}

function selectActiveTrip(trips: RawTrip[], preferredTripId?: string | null): RawTrip | null {
  if (!trips.length) return null
  if (preferredTripId) {
    const preferred = trips.find(t => t.id === preferredTripId)
    if (preferred) return preferred
  }
  // Priority: most advanced status first, then most items
  const STATUS_PRIORITY: Record<string, number> = {
    CONFIRMED: 10, PARTIALLY_CONFIRMED: 9, CONFIRMING: 8, PAID: 7,
    CHECKOUT_STARTED: 6, PLANNING: 5, DRAFT: 4, COMPLETED: 3,
  }
  return [...trips].sort((a, b) => {
    const sa = STATUS_PRIORITY[a.status] ?? 0
    const sb = STATUS_PRIORITY[b.status] ?? 0
    if (sa !== sb) return sb - sa
    return b.items.length - a.items.length
  })[0] ?? null
}

function toTripSummary(trip: RawTrip): TripSummary {
  return {
    id:            trip.id,
    title:         trip.title,
    destination:   trip.destination,
    status:        trip.status,
    startDate:     trip.startDate?.toISOString().slice(0, 10) ?? null,
    endDate:       trip.endDate?.toISOString().slice(0, 10) ?? null,
    adults:        trip.adults,
    children:      trip.children,
    currency:      trip.currency,
    budget:        trip.budget,
    itemCount:     trip.items.length,
    itemTypes:     [...new Set(trip.items.map(i => i.type))],
    hasStaleItems: trip.hasStaleItems,
  }
}
