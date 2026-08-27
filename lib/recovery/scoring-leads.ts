// Hot lead scoring (Release 3B)
//
// Transparent, rule-based scoring — no opaque ML.
// Weights are intentionally visible here; change them without touching detection logic.

import prisma from '@/lib/db'

export type LeadBand = 'HOT' | 'WARM' | 'COLD'

export interface LeadScore {
  score:   number
  band:    LeadBand
  signals: string[]
}

// ── Scoring weights ───────────────────────────────────────────────────────────
// Keep these in one place so they can be reviewed / changed together.
const W = {
  jadeQualified:   10,
  tripCreated:     10,
  proposalOpened:  10,  // per first open; capped at 1 for band calculation
  proposalReopened: 10, // each reopen beyond first, capped at 2
  paymentClicked:  20,
  checkoutStarted: 20,
  paymentFailed:   30,
  returnedIn24h:   10,
} as const

// ── Scoring thresholds ────────────────────────────────────────────────────────
export const HOT_THRESHOLD  = 40
export const WARM_THRESHOLD = 20

// ── Main scoring function ─────────────────────────────────────────────────────
// Accepts pre-fetched event rows to avoid N+1 in bulk detection.
// Caller is responsible for fetching with the queries shown in detect-leads.ts.

export interface ScoringInput {
  lead: {
    jadeQualifiedAt: Date | null
    createdAt:       Date
  }
  events: Array<{ event: string; createdAt: Date }>
  // Optional: proposal signals sourced from QuoteActivity by the caller
  proposalViewCount?: number  // total views on any linked unresolved quote
}

export function scoreLeadInput(input: ScoringInput): LeadScore {
  const { lead, events, proposalViewCount = 0 } = input
  const now   = Date.now()
  const ms24h = 86_400_000

  let score = 0
  const signals: string[] = []

  // ── Jade-qualified ────────────────────────────────────────────────────────
  if (lead.jadeQualifiedAt) {
    score += W.jadeQualified
    signals.push('Jade-qualified lead')
  }

  // ── CommercialEvent-based signals ────────────────────────────────────────
  const eventNames = events.map(e => e.event)

  if (eventNames.includes('jade_trip_intent')) {
    score += W.tripCreated
    signals.push('Trip intent signalled to Jade')
  }

  if (eventNames.includes('checkout_started')) {
    score += W.checkoutStarted
    signals.push('Checkout started')
  }

  if (eventNames.includes('payment_started')) {
    score += W.paymentClicked
    signals.push('Payment page visited')
  }

  const failCount = eventNames.filter(e => e === 'payment_failed').length
  if (failCount > 0) {
    score += W.paymentFailed
    signals.push(`Payment failed (${failCount}×)`)
  }

  // Return visit: at least one event today AND at least one older event
  const hasToday = events.some(e => now - e.createdAt.getTime() < ms24h)
  const hasOlder = events.some(e => now - e.createdAt.getTime() >= ms24h)
  if (hasToday && hasOlder) {
    score += W.returnedIn24h
    signals.push('Returned within last 24 hours')
  }

  // ── Proposal signals (passed in from caller) ─────────────────────────────
  if (proposalViewCount >= 1) {
    score += W.proposalOpened
    signals.push('Proposal opened')
  }
  if (proposalViewCount >= 3) {
    score += W.proposalReopened
    signals.push(`Proposal viewed ${proposalViewCount} times`)
  }
  if (proposalViewCount >= 5) {
    // Extra urgency for very-hot proposal engagement
    score += W.proposalReopened
    signals.push('Proposal viewed repeatedly (very high intent)')
  }

  const band: LeadBand =
    score >= HOT_THRESHOLD  ? 'HOT'  :
    score >= WARM_THRESHOLD ? 'WARM' : 'COLD'

  return { score, band, signals }
}

// ── Convenience: score a single lead by ID (used by detail pages / Jade) ─────
export async function calculateLeadRecoveryScore(leadId: string): Promise<LeadScore> {
  const [lead, events, quotes] = await Promise.all([
    prisma.lead.findUnique({
      where:  { id: leadId },
      select: { jadeQualifiedAt: true, createdAt: true, email: true },
    }),
    prisma.commercialEvent.findMany({
      where:   { leadId },
      orderBy: { createdAt: 'desc' },
      take:    200,
      select:  { event: true, createdAt: true },
    }),
    // Attempt to find any open proposals linked to this lead via email
    prisma.lead.findUnique({
      where:  { id: leadId },
      select: { email: true },
    }).then(l =>
      l?.email
        ? prisma.quote.findMany({
            where:  { clientEmail: l.email, convertedAt: null, declinedAt: null, status: { in: ['sent', 'viewed'] } },
            select: { viewCount: true },
          })
        : []
    ),
  ])

  if (!lead) return { score: 0, band: 'COLD', signals: [] }

  const proposalViewCount = quotes.reduce((sum, q) => sum + q.viewCount, 0)

  return scoreLeadInput({ lead, events, proposalViewCount })
}
