// lib/commercial/jade-analytics-5f.ts
// Release 5F — Revenue Optimization & Experimentation Analytics
//
// Extends jade-analytics.ts (Release 4E) without modifying it.
// All monetary values are per-currency — never cross-currency sums.
// Attach rates use DISTINCT Trip counts, never TripItem row counts.

import prisma from '@/lib/db'
import type { DateRange } from './metrics'

// ─── Next-Best-Action Analytics ───────────────────────────────────────────────

export interface NBAMetrics {
  action:     string
  generated:  number
  accepted:   number
  ignored:    number
  converted:  number
}

export async function getNBAAnalytics(range: DateRange): Promise<NBAMetrics[]> {
  const [generated, accepted, converted] = await Promise.all([
    prisma.commercialEvent.groupBy({
      by: ['metadata'],
      where: {
        event:     'jade_next_best_action',
        createdAt: { gte: range.from, lte: range.to },
      },
      _count: { id: true },
    }),
    prisma.commercialEvent.groupBy({
      by: ['metadata'],
      where: {
        event:     'jade_recommendation_selected',
        createdAt: { gte: range.from, lte: range.to },
      },
      _count: { id: true },
    }),
    prisma.commercialEvent.groupBy({
      by: ['metadata'],
      where: {
        event:     { in: ['jade_checkout_converted', 'jade_checkout_started'] },
        createdAt: { gte: range.from, lte: range.to },
      },
      _count: { id: true },
    }),
  ])

  // Aggregate by action type from metadata
  const map = new Map<string, NBAMetrics>()

  for (const row of generated) {
    const m      = (row.metadata ?? {}) as Record<string, unknown>
    const action = (m.action as string | undefined) ?? 'UNKNOWN'
    const entry  = map.get(action) ?? { action, generated: 0, accepted: 0, ignored: 0, converted: 0 }
    entry.generated += row._count.id
    map.set(action, entry)
  }

  for (const row of accepted) {
    const m      = (row.metadata ?? {}) as Record<string, unknown>
    const action = (m.action as string | undefined) ?? 'UNKNOWN'
    const entry  = map.get(action) ?? { action, generated: 0, accepted: 0, ignored: 0, converted: 0 }
    entry.accepted += row._count.id
    map.set(action, entry)
  }

  // Ignored = generated - accepted
  for (const entry of map.values()) {
    entry.ignored = Math.max(0, entry.generated - entry.accepted)
  }

  return [...map.values()].sort((a, b) => b.generated - a.generated)
}

// ─── Follow-Up Performance ────────────────────────────────────────────────────

export interface FollowUpMetrics {
  eligible:   number
  scheduled:  number
  sent:       number
  suppressed: number
  converted:  number
  conversionRate: number
}

export async function getFollowUpMetrics(range: DateRange): Promise<FollowUpMetrics> {
  const [eligible, scheduled, sent, suppressed, converted] = await Promise.all([
    prisma.commercialEvent.count({ where: { event: 'jade_followup_eligible',   createdAt: { gte: range.from, lte: range.to } } }),
    prisma.commercialEvent.count({ where: { event: 'jade_followup_scheduled',  createdAt: { gte: range.from, lte: range.to } } }),
    prisma.commercialEvent.count({ where: { event: 'jade_followup_sent',       createdAt: { gte: range.from, lte: range.to } } }),
    prisma.commercialEvent.count({ where: { event: 'jade_followup_suppressed', createdAt: { gte: range.from, lte: range.to } } }),
    prisma.commercialEvent.count({ where: { event: 'jade_followup_converted',  createdAt: { gte: range.from, lte: range.to } } }),
  ])

  return {
    eligible, scheduled, sent, suppressed, converted,
    conversionRate: sent > 0 ? Math.round((converted / sent) * 100) : 0,
  }
}

// ─── Proposal Automation Analytics ───────────────────────────────────────────

export interface ProposalAutomationMetrics {
  evaluated:         number
  autoEligible:      number
  staffReviewRequired: number
  autoSent:          number
  autoSendFailed:    number
  paid:              number
}

export async function getProposalAutomationMetrics(range: DateRange): Promise<ProposalAutomationMetrics> {
  const [evaluated, eligible, staffRequired, autoSent, failed, paid] = await Promise.all([
    prisma.commercialEvent.count({ where: { event: 'jade_proposal_automation_evaluated', createdAt: { gte: range.from, lte: range.to } } }),
    prisma.commercialEvent.count({ where: { event: 'jade_proposal_auto_eligible',        createdAt: { gte: range.from, lte: range.to } } }),
    prisma.commercialEvent.count({ where: { event: 'jade_proposal_staff_review_required', createdAt: { gte: range.from, lte: range.to } } }),
    prisma.commercialEvent.count({ where: { event: 'jade_proposal_auto_sent',            createdAt: { gte: range.from, lte: range.to } } }),
    prisma.commercialEvent.count({ where: { event: 'jade_proposal_auto_send_failed',     createdAt: { gte: range.from, lte: range.to } } }),
    // Proposals that converted to payment after auto-send
    prisma.quote.count({
      where: {
        convertedAt: { gte: range.from, lte: range.to },
        status:      'converted',
      },
    }),
  ])

  return {
    evaluated,
    autoEligible:         eligible,
    staffReviewRequired:  staffRequired,
    autoSent,
    autoSendFailed:       failed,
    paid,
  }
}

// ─── Package Analytics ────────────────────────────────────────────────────────

export interface PackageMetrics {
  generated:           number
  selected:            number
  checkoutStarted:     number
  paid:                number
  confirmed:           number
  partialConfirmations: number
}

export async function getPackageMetrics(range: DateRange): Promise<PackageMetrics> {
  const [generated, selected, checkoutStarted, paid, confirmed, partial] = await Promise.all([
    prisma.commercialEvent.count({ where: { event: 'jade_package_generated',        createdAt: { gte: range.from, lte: range.to } } }),
    prisma.commercialEvent.count({ where: { event: 'jade_package_selected',         createdAt: { gte: range.from, lte: range.to } } }),
    prisma.commercialEvent.count({ where: { event: 'jade_package_checkout_started', createdAt: { gte: range.from, lte: range.to } } }),
    prisma.commercialEvent.count({ where: { event: 'jade_package_paid',             createdAt: { gte: range.from, lte: range.to } } }),
    prisma.commercialEvent.count({ where: { event: 'jade_package_confirmed',        createdAt: { gte: range.from, lte: range.to } } }),
    // Partially confirmed trips
    prisma.trip.count({ where: { status: 'PARTIALLY_CONFIRMED', updatedAt: { gte: range.from, lte: range.to } } }),
  ])

  return {
    generated, selected, checkoutStarted, paid, confirmed,
    partialConfirmations: partial,
  }
}

// ─── Revenue Leakage Detection ────────────────────────────────────────────────

export interface RevenueLeakageItem {
  category:    string
  count:       number
  description: string
  severity:    'LOW' | 'MEDIUM' | 'HIGH'
}

export async function getRevenueLeakage(): Promise<RevenueLeakageItem[]> {
  const twoHoursAgo   = new Date(Date.now() - 2  * 60 * 60 * 1000)
  const twoDaysAgo    = new Date(Date.now() - 48 * 60 * 60 * 1000)
  const sevenDaysAgo  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [
    paidAwaitingSupplier,
    acceptedUnpaid,
    recoveryBacklog,
    highIntentNoTrip,
    tripsNoCheckout,
  ] = await Promise.all([
    // Paid but supplier not yet confirmed
    prisma.trip.count({ where: { status: 'CONFIRMING' } }),
    // Proposal accepted but checkout not started
    prisma.quote.count({ where: { acceptedAt: { not: null }, convertedAt: null, declinedAt: null } }),
    // Open recovery opportunities older than 48h
    prisma.recoveryOpportunity.count({
      where: { status: { in: ['OPEN', 'CONTACTED'] }, detectedAt: { lte: twoDaysAgo } },
    }),
    // HOT leads from the last 30 days (Lead has no tripId — count all hot leads as at-risk)
    prisma.lead.count({
      where: {
        interestLevel: 'hot',
        createdAt:     { gte: thirtyDaysAgo },
      },
    }),
    // Trips in PLANNING/DRAFT older than 7 days with no checkout
    prisma.trip.count({
      where: {
        status:    { in: ['PLANNING', 'DRAFT'] },
        updatedAt: { lte: sevenDaysAgo },
        items:     { some: {} },
      },
    }),
  ])

  const items: RevenueLeakageItem[] = []

  if (paidAwaitingSupplier > 0) {
    items.push({
      category:    'paid_awaiting_supplier',
      count:       paidAwaitingSupplier,
      description: `${paidAwaitingSupplier} paid trip(s) awaiting supplier confirmation`,
      severity:    'HIGH',
    })
  }

  if (acceptedUnpaid > 0) {
    items.push({
      category:    'accepted_proposals_unpaid',
      count:       acceptedUnpaid,
      description: `${acceptedUnpaid} accepted proposal(s) have not reached payment`,
      severity:    'HIGH',
    })
  }

  if (recoveryBacklog > 0) {
    items.push({
      category:    'recovery_backlog',
      count:       recoveryBacklog,
      description: `${recoveryBacklog} recovery opportunit${recoveryBacklog === 1 ? 'y' : 'ies'} open for 48h+`,
      severity:    'MEDIUM',
    })
  }

  if (highIntentNoTrip > 0) {
    items.push({
      category:    'high_intent_no_trip',
      count:       highIntentNoTrip,
      description: `${highIntentNoTrip} HOT lead(s) from the last 30 days may need active follow-up`,
      severity:    'MEDIUM',
    })
  }

  if (tripsNoCheckout > 0) {
    items.push({
      category:    'stale_trips',
      count:       tripsNoCheckout,
      description: `${tripsNoCheckout} trip(s) with items have not reached checkout in 7+ days`,
      severity:    'LOW',
    })
  }

  return items.sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    return order[a.severity] - order[b.severity]
  })
}

// ─── Executive Insight Cards (deterministic) ──────────────────────────────────

export interface InsightCard {
  id:         string
  title:      string
  value:      string | number
  trend?:     string
  severity:   'info' | 'warning' | 'critical'
  actionHref?: string
}

export async function getExecutiveInsights(): Promise<InsightCard[]> {
  const leakage = await getRevenueLeakage()
  const cards:  InsightCard[] = []

  for (const item of leakage) {
    const severity =
      item.severity === 'HIGH'   ? 'critical' :
      item.severity === 'MEDIUM' ? 'warning'  : 'info'

    cards.push({
      id:       item.category,
      title:    item.description,
      value:    item.count,
      severity,
      actionHref: getCategoryHref(item.category),
    })
  }

  return cards
}

function getCategoryHref(category: string): string {
  switch (category) {
    case 'paid_awaiting_supplier':      return '/admin/trips?status=CONFIRMING'
    case 'accepted_proposals_unpaid':   return '/admin/quotes?status=accepted'
    case 'recovery_backlog':            return '/admin/recovery'
    case 'high_intent_no_trip':         return '/admin/leads?interestLevel=hot'
    case 'stale_trips':                 return '/admin/trips?status=PLANNING'
    default:                            return '/admin/revenue'
  }
}

// ─── Combined Release 5F Report ───────────────────────────────────────────────

export interface Release5FReport {
  nba:                NBAMetrics[]
  followUp:           FollowUpMetrics
  proposalAutomation: ProposalAutomationMetrics
  packages:           PackageMetrics
  leakage:            RevenueLeakageItem[]
  insights:           InsightCard[]
}

export async function getRelease5FReport(range: DateRange): Promise<Release5FReport> {
  const [nba, followUp, proposalAutomation, packages, leakage, insights] = await Promise.all([
    getNBAAnalytics(range),
    getFollowUpMetrics(range),
    getProposalAutomationMetrics(range),
    getPackageMetrics(range),
    getRevenueLeakage(),
    getExecutiveInsights(),
  ])

  return { nba, followUp, proposalAutomation, packages, leakage, insights }
}
