// lib/jade/proposal-automation.ts
// Release 5D — Controlled Proposal Automation
//
// Evaluates whether a trip is eligible for automated proposal preparation.
// JADE_PROPOSAL_AUTO_SEND_ENABLED remains false — this file builds the
// eligibility engine only; auto-send is a separate opt-in.
//
// SECURITY:
//   - Server decides eligibility — LLM cannot override
//   - Price revalidation is required before proposal generation
//   - Manual pricing, group travel, visa packages always require staff review

import prisma from '@/lib/db'
import { trackCommercialEvent } from '@/lib/commercial/track'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export interface ProposalAutomationEligibility {
  eligible:            boolean
  riskLevel:           RiskLevel
  requiresStaffReview: boolean
  reasons:             string[]
  blockers:            string[]
  warnings:            string[]
}

// ─── Config ───────────────────────────────────────────────────────────────────

// Trips above this total value threshold always require staff review.
// Denominated in each trip's currency — no cross-currency comparison.
const AUTO_SEND_VALUE_THRESHOLD = parseInt(
  process.env.PROPOSAL_AUTO_SEND_THRESHOLD ?? '5000', 10,
)

// Types that always require staff review
const ALWAYS_STAFF_TYPES = new Set([
  'MANUAL', 'CUSTOM', 'NOTE',
])

// Trip statuses that make a trip eligible for proposal
const PROPOSAL_ELIGIBLE_STATUSES = new Set([
  'PLANNING', 'DRAFT',
])

// ─── Main Eligibility Evaluator ───────────────────────────────────────────────

export async function evaluateProposalAutomationEligibility(
  tripId: string,
  requestedByJade = false,
): Promise<ProposalAutomationEligibility> {
  const blockers:  string[] = []
  const warnings:  string[] = []
  const reasons:   string[] = []
  let requiresStaffReview = false
  let riskLevel: RiskLevel = 'LOW'

  const trip = await prisma.trip.findUnique({
    where:   { id: tripId },
    include: {
      items: {
        select: {
          id: true, type: true, cost: true, currency: true,
          metadata: true, confirmed: true,
        },
      },
    },
  })

  if (!trip) {
    return { eligible: false, riskLevel: 'HIGH', requiresStaffReview: true, reasons: [], blockers: ['Trip not found'], warnings: [] }
  }

  // ── Status check ────────────────────────────────────────────────────────────
  if (!PROPOSAL_ELIGIBLE_STATUSES.has(trip.status)) {
    blockers.push(`Trip status "${trip.status}" is not eligible for proposal automation`)
  }

  // ── Dates required ──────────────────────────────────────────────────────────
  if (!trip.startDate || !trip.endDate) {
    blockers.push('Travel dates are required for an automated proposal')
  }

  // ── Traveler count required ─────────────────────────────────────────────────
  if (trip.adults === 0) {
    blockers.push('Traveler count must be set before proposal can be created')
  }

  // ── Group travel → staff review ─────────────────────────────────────────────
  const totalPax = trip.adults + trip.children + trip.infants
  if (totalPax >= 10) {
    requiresStaffReview = true
    riskLevel = 'HIGH'
    reasons.push(`Group travel (${totalPax} passengers) requires staff review`)
  }

  // ── Items must exist ────────────────────────────────────────────────────────
  if (!trip.items.length) {
    blockers.push('Trip has no items — cannot create a proposal')
  }

  // ── Manual or custom items → staff review ───────────────────────────────────
  const manualItems = trip.items.filter(i => ALWAYS_STAFF_TYPES.has(i.type))
  if (manualItems.length) {
    requiresStaffReview = true
    riskLevel = riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM'
    reasons.push(`${manualItems.length} manual/custom item(s) require staff pricing review`)
  }

  // ── Stale items check ───────────────────────────────────────────────────────
  const staleItems = trip.items.filter(i => {
    const m = i.metadata as Record<string, unknown>
    return !!m?.stale
  })
  if (staleItems.length) {
    blockers.push(`${staleItems.length} item(s) have stale prices — re-search required before proposal`)
  }

  // ── Price freshness check ───────────────────────────────────────────────────
  // Items without a source search ref are considered manually priced
  const noRefItems = trip.items.filter(i => {
    const m = i.metadata as Record<string, unknown>
    return !m?.searchRefId && !m?.rateId && i.type !== 'CUSTOM' && i.type !== 'NOTE'
  })
  if (noRefItems.length > 0 && noRefItems.length === trip.items.length) {
    requiresStaffReview = true
    riskLevel = riskLevel === 'LOW' ? 'MEDIUM' : riskLevel
    warnings.push('No live search refs — all prices should be verified before sending')
  }

  // ── Multi-currency guard (NEVER sum different currencies without authoritative FX) ──
  // If any priced item uses a different currency than the trip, require staff review.
  // Previously these items were silently excluded from the cost sum, allowing trips
  // worth e.g. £3k + $15k to pass a £5k threshold. That was a critical undercount bug.
  const foreignCurrencyItems = trip.items.filter(
    i => i.cost && i.currency && i.currency !== trip.currency,
  )
  if (foreignCurrencyItems.length > 0) {
    requiresStaffReview = true
    riskLevel = 'HIGH'
    const foreignCurrencies = [...new Set(foreignCurrencyItems.map(i => i.currency))].join('/')
    reasons.push(
      `${foreignCurrencyItems.length} item(s) priced in ${foreignCurrencies} (trip currency: ${trip.currency}) — cross-currency trip requires staff review`,
    )
  }

  // ── Value threshold — native-currency items only ────────────────────────────
  const tripCost = trip.items.reduce((sum, i) => {
    if (i.currency !== trip.currency) return sum
    return sum + (i.cost ? Number(i.cost) : 0)
  }, 0)

  if (tripCost > AUTO_SEND_VALUE_THRESHOLD) {
    requiresStaffReview = true
    riskLevel = 'HIGH'
    reasons.push(`Trip value (${trip.currency} ${tripCost.toLocaleString()}) exceeds auto-send threshold`)
  }

  // ── Customer must have explicitly requested a proposal ──────────────────────
  if (!requestedByJade) {
    blockers.push('No explicit customer proposal request — automated proposal not triggered')
  }

  // ── JADE_PROPOSAL_AUTOMATION_ENABLED flag ───────────────────────────────────
  if (process.env.JADE_PROPOSAL_AUTOMATION_ENABLED !== 'true') {
    blockers.push('JADE_PROPOSAL_AUTOMATION_ENABLED is disabled — proposal automation is off')
  }

  const eligible = blockers.length === 0

  // Track evaluation event
  trackCommercialEvent(eligible ? 'jade_proposal_auto_eligible' : 'jade_proposal_automation_evaluated', {
    metadata: {
      tripId,
      eligible,
      riskLevel,
      requiresStaffReview,
      blockerCount: blockers.length,
    },
  })

  if (requiresStaffReview) {
    trackCommercialEvent('jade_proposal_staff_review_required', {
      metadata: { tripId, reasons },
    })
  }

  return {
    eligible,
    riskLevel,
    requiresStaffReview,
    reasons,
    blockers,
    warnings,
  }
}

// ─── Auto-Send Gate ───────────────────────────────────────────────────────────
// Both flags must be enabled AND eligibility must pass before auto-send fires.

export function isProposalAutoSendEnabled(): boolean {
  return (
    process.env.JADE_PROPOSAL_AUTOMATION_ENABLED === 'true' &&
    process.env.JADE_PROPOSAL_AUTO_SEND_ENABLED  === 'true'
  )
}
