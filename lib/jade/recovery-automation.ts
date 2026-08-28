// lib/jade/recovery-automation.ts
// Release 5C — Automated Follow-Up & Recovery
//
// Extends the existing lib/recovery/ system. Does NOT replace it.
// Adds:
//   - canAutomateRecovery() — eligibility engine for automated contacts
//   - getFollowUpMessage() — safe, verified message generation
//   - Recovery trigger detection for Release 5A trigger classes
//
// CRITICAL RULES (from suppression.ts, never override):
//   - SUPPLIER_FAILURE → never automated — staff-managed operational case
//   - HOT_LEAD         → no automated customer contact; staff notification only
//   - contactCount >= MAX_AUTO_CONTACTS → cap reached
//   - Lead.marketingOptOut → skip marketing recovery
//   - Do NOT contact a customer about abandonment after they've paid
//
// Feature flag: JADE_AUTOMATED_FOLLOWUP_ENABLED must be true
// (starts false — build and test before enabling outbound automation)

import prisma from '@/lib/db'
import { checkSuppression, MAX_AUTO_CONTACTS } from '@/lib/recovery/suppression'
import { trackCommercialEvent } from '@/lib/commercial/track'
import type { RecoveryType } from '@/lib/recovery/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecoveryAutomationEligibility {
  canAutomate:     boolean
  suppressed:      boolean
  suppressReason?: string
  requiresStaff:   boolean
  staffReason?:    string
  timing: {
    followUpAfterMinutes: number
    maxContacts:          number
  }
}

// ─── Main Eligibility Check ───────────────────────────────────────────────────

export async function canAutomateRecovery(
  opportunityId: string,
): Promise<RecoveryAutomationEligibility> {
  // Feature flag gate
  if (process.env.JADE_AUTOMATED_FOLLOWUP_ENABLED !== 'true') {
    return notEligible('JADE_AUTOMATED_FOLLOWUP_ENABLED is disabled')
  }

  const opp = await prisma.recoveryOpportunity.findUnique({
    where:  { id: opportunityId },
    select: {
      id: true, type: true, status: true, contactCount: true,
      leadId: true, cartSessionId: true, quoteId: true, tripId: true,
      bookingId: true, amount: true, currency: true, priority: true,
      assignedToId: true,
    },
  })

  if (!opp) return notEligible('Opportunity not found')

  // Run existing suppression rules first
  const suppression = await checkSuppression({
    id:            opp.id,
    type:          opp.type,
    status:        opp.status,
    contactCount:  opp.contactCount,
    leadId:        opp.leadId,
    cartSessionId: opp.cartSessionId,
    quoteId:       opp.quoteId,
    tripId:        opp.tripId,
    bookingId:     opp.bookingId,
  })

  if (suppression.suppressed) {
    trackCommercialEvent('jade_followup_suppressed', {
      metadata: { opportunityId, reason: suppression.reason },
    })
    return {
      canAutomate:     false,
      suppressed:      true,
      suppressReason:  suppression.reason,
      requiresStaff:   false,
      timing:          defaultTiming(opp.type as RecoveryType),
    }
  }

  // Staff escalation rules (beyond suppression)
  const staffCheck = requiresStaffEscalation(opp)
  if (staffCheck.required) {
    return {
      canAutomate:   false,
      suppressed:    false,
      requiresStaff: true,
      staffReason:   staffCheck.reason,
      timing:        defaultTiming(opp.type as RecoveryType),
    }
  }

  trackCommercialEvent('jade_followup_eligible', {
    metadata: { opportunityId, type: opp.type, priority: opp.priority },
  })

  return {
    canAutomate:   true,
    suppressed:    false,
    requiresStaff: false,
    timing:        defaultTiming(opp.type as RecoveryType),
  }
}

// ─── Staff Escalation Rules ───────────────────────────────────────────────────

interface StaffCheck { required: boolean; reason?: string }

function requiresStaffEscalation(opp: {
  type:        string
  priority:    string
  amount:      number | null
  tripId:      string | null
  assignedToId: string | null
}): StaffCheck {
  // High-value opportunities always need staff
  if (opp.priority === 'URGENT') {
    return { required: true, reason: 'URGENT priority — requires staff intervention' }
  }

  // Large amounts → staff review
  const amount = opp.amount ?? 0
  if (amount > 10000) {
    return { required: true, reason: `High-value opportunity (${amount}) — staff-managed` }
  }

  // If opportunity is already assigned to staff, don't auto-contact
  if (opp.assignedToId) {
    return { required: true, reason: 'Opportunity assigned to staff member — staff manages contact' }
  }

  return { required: false }
}

// ─── Safe Message Generation ──────────────────────────────────────────────────
// Returns verified, safe message content.
// NEVER claims stale prices are current. NEVER says inventory is held.

export interface FollowUpMessageContext {
  opportunityType:  RecoveryType
  customerName:     string
  destination?:     string
  tripTitle?:       string
  proposalRef?:     string
  currency?:        string
  amount?:          number
}

export function getFollowUpMessage(ctx: FollowUpMessageContext): {
  subject:    string
  bodyText:   string
  whatsappText: string
} {
  const name = ctx.customerName || 'there'
  const dest  = ctx.destination ?? 'your destination'

  switch (ctx.opportunityType) {
    case 'ABANDONED_CART':
    case 'INCOMPLETE_TRIP':
      return {
        subject: `Your ${dest} trip is still saved`,
        bodyText: [
          `Hi ${name},`,
          '',
          `Your trip to ${dest} is still saved in your Walz Travels account.`,
          '',
          // SAFE: we say "may change" not "still at £X" — no price claim
          'Prices on travel can change, so whenever you\'re ready, I can recheck the latest availability and prices for you.',
          '',
          'Would you like me to pick up where you left off?',
          '',
          'Warm regards,\nJade at Walz Travels',
        ].join('\n'),
        whatsappText: `Hi ${name}! Your ${dest} trip is still saved. Prices may have changed — want me to recheck availability when you're ready? 🌍`,
      }

    case 'UNPAID_PROPOSAL':
      return {
        subject: ctx.proposalRef ? `Your proposal ${ctx.proposalRef} — any questions?` : 'Your travel proposal — any questions?',
        bodyText: [
          `Hi ${name},`,
          '',
          'I just wanted to check in on the proposal we sent for your upcoming trip.',
          '',
          'If you have any questions about what\'s included, or if anything has changed with your travel plans, I\'m happy to discuss.',
          '',
          'Your proposal is still available to review. Just let me know if you\'d like me to adjust anything.',
          '',
          'Warm regards,\nJade at Walz Travels',
        ].join('\n'),
        whatsappText: `Hi ${name}! Just checking in on the travel proposal we sent. Any questions or changes needed? Happy to help 😊`,
      }

    case 'FAILED_PAYMENT':
      return {
        subject: 'Your payment — we\'re here to help',
        bodyText: [
          `Hi ${name},`,
          '',
          'We noticed there was an issue with your recent payment. This sometimes happens with card security checks.',
          '',
          'Your trip details are still saved. If you\'d like to retry or use a different payment method, please let us know.',
          '',
          'You can also reach our team directly on WhatsApp for immediate assistance.',
          '',
          'Warm regards,\nJade at Walz Travels',
        ].join('\n'),
        whatsappText: `Hi ${name}! We noticed a payment issue on your booking. Your trip details are saved — want to retry or use a different card? We're here to help 💙`,
      }

    default:
      return {
        subject: 'Your Walz Travels booking',
        bodyText: `Hi ${name},\n\nJust checking in to see if we can help with your travel plans.\n\nWarm regards,\nJade at Walz Travels`,
        whatsappText: `Hi ${name}! Just checking in from Walz Travels. Can I help with anything for your trip? ✈`,
      }
  }
}

// ─── Timing Policy ────────────────────────────────────────────────────────────

function defaultTiming(type: RecoveryType): { followUpAfterMinutes: number; maxContacts: number } {
  const timings: Record<RecoveryType, number> = {
    ABANDONED_CART:   45,    // 45 minutes after abandonment
    UNPAID_PROPOSAL:  1440,  // 24 hours after proposal sent
    FAILED_PAYMENT:   60,    // 1 hour after payment failure
    INCOMPLETE_TRIP:  2880,  // 48 hours for low-pressure incomplete trip nudge
    SUPPLIER_FAILURE: 0,     // Staff only — no automated timing
    HOT_LEAD:         0,     // Staff only — no automated timing
  }
  return {
    followUpAfterMinutes: timings[type] ?? 1440,
    maxContacts:          MAX_AUTO_CONTACTS,
  }
}

function notEligible(reason: string): RecoveryAutomationEligibility {
  return {
    canAutomate:    false,
    suppressed:     false,
    suppressReason: reason,
    requiresStaff:  false,
    timing:         { followUpAfterMinutes: 0, maxContacts: MAX_AUTO_CONTACTS },
  }
}
