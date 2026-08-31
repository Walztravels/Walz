// lib/automation/eligibility.ts — Release 7.0: Unified Automation Control Plane
//
// Single authoritative gate for ALL automation decisions.
// Every automated action (recovery, proposal, follow-up) MUST pass this check.
//
// SECURITY RULES (never override):
//   - JADE_AUTOMATED_FOLLOWUP_ENABLED=false  → all recovery automation BLOCKED
//   - JADE_PROPOSAL_AUTOMATION_ENABLED=false → all proposal automation BLOCKED
//   - LLM cannot call this; only server-side code invokes checkAutomationEligibility()
//   - PAYMENT_RECEIVED ≠ CONFIRMED — automation never acts on unconfirmed payments
//   - Staff-assigned leads: BLOCKED from automation (escalate to staff)
//   - Multi-currency trips: BLOCKED (cannot sum value without authoritative FX)
//   - Refunds, cancellations, visa items: MANUAL_ONLY
//
// AutomationClass precedence (worse() helper enforces this — never downgrade):
//   BLOCKED(3) > MANUAL_ONLY(2) > STAFF_APPROVAL_REQUIRED(1) > AUTO_ALLOWED(0)

export type AutomationClass =
  | 'AUTO_ALLOWED'
  | 'STAFF_APPROVAL_REQUIRED'
  | 'MANUAL_ONLY'
  | 'BLOCKED'

const CLASS_SEVERITY: Record<AutomationClass, number> = {
  AUTO_ALLOWED:             0,
  STAFF_APPROVAL_REQUIRED:  1,
  MANUAL_ONLY:              2,
  BLOCKED:                  3,
}

// Returns the more restrictive of two AutomationClass values — never downgrades.
export function worse(a: AutomationClass, b: AutomationClass): AutomationClass {
  return CLASS_SEVERITY[a] >= CLASS_SEVERITY[b] ? a : b
}

// ─── Request & Result types ───────────────────────────────────────────────────

export type AutomationAction =
  | 'RECOVERY_EMAIL'
  | 'RECOVERY_WHATSAPP'
  | 'PROPOSAL_AUTO_SEND'
  | 'FOLLOW_UP_MESSAGE'
  | 'CHECKOUT_HANDOFF'
  | 'CRM_LEAD_UPDATE'

export interface EligibilityRequest {
  action:          AutomationAction
  // Risk factors — all optional; provide what's known for the entity being automated
  tripId?:         string
  bookingId?:      string
  leadId?:         string
  opportunityId?:  string
  // Inline values (avoid re-querying if already known)
  tripCurrency?:   string
  hasMultiCurrency?: boolean   // true if any item uses a different currency than the trip
  totalValue?:     number      // in trip currency (native items only, after multi-currency check)
  passengerCount?: number
  hasVisaItem?:    boolean
  hasManualItem?:  boolean
  hasStaleItem?:   boolean
  paymentState?:   'PENDING' | 'PAYMENT_RECEIVED' | 'CONFIRMED' | 'FAILED' | 'REFUNDED' | 'CANCELLED'
  isStaffAssigned?: boolean    // lead.assignedToId is set
  isMarketingOptOut?: boolean
  isGroupBooking?:  boolean    // passengerCount >= 10
  requestedByCustomer?: boolean // explicit customer action (not Jade-initiated)
}

export interface EligibilityResult {
  automationClass: AutomationClass
  reasons:         string[]
  blockers:        string[]
  warnings:        string[]
  auditMetadata:   Record<string, unknown>
}

// ─── Value thresholds ─────────────────────────────────────────────────────────

const AUTO_VALUE_THRESHOLD = parseInt(
  process.env.PROPOSAL_AUTO_SEND_THRESHOLD ?? '5000', 10,
)
const STAFF_REVIEW_VALUE_THRESHOLD = parseInt(
  process.env.AUTOMATION_STAFF_REVIEW_THRESHOLD ?? '2000', 10,
)

// ─── Main eligibility gate ────────────────────────────────────────────────────

export function checkAutomationEligibility(req: EligibilityRequest): EligibilityResult {
  let cls: AutomationClass = 'AUTO_ALLOWED'
  const reasons:  string[] = []
  const blockers: string[] = []
  const warnings: string[] = []

  // ── Global feature flags (master switches) ───────────────────────────────
  if (req.action === 'RECOVERY_EMAIL' || req.action === 'RECOVERY_WHATSAPP' || req.action === 'FOLLOW_UP_MESSAGE') {
    if (process.env.JADE_AUTOMATED_FOLLOWUP_ENABLED !== 'true') {
      cls = worse(cls, 'BLOCKED')
      blockers.push('JADE_AUTOMATED_FOLLOWUP_ENABLED is off — recovery automation disabled')
    }
  }

  if (req.action === 'PROPOSAL_AUTO_SEND') {
    if (process.env.JADE_PROPOSAL_AUTOMATION_ENABLED !== 'true') {
      cls = worse(cls, 'BLOCKED')
      blockers.push('JADE_PROPOSAL_AUTOMATION_ENABLED is off — proposal automation disabled')
    }
    if (process.env.JADE_PROPOSAL_AUTO_SEND_ENABLED !== 'true') {
      cls = worse(cls, 'BLOCKED')
      blockers.push('JADE_PROPOSAL_AUTO_SEND_ENABLED is off — auto-send disabled')
    }
  }

  if (req.action === 'CHECKOUT_HANDOFF') {
    if (process.env.JADE_CHECKOUT_HANDOFF_ENABLED !== 'true') {
      cls = worse(cls, 'BLOCKED')
      blockers.push('JADE_CHECKOUT_HANDOFF_ENABLED is off')
    }
  }

  // ── Staff assignment — must escalate, never auto-contact ─────────────────
  if (req.isStaffAssigned) {
    cls = worse(cls, 'BLOCKED')
    blockers.push('Lead is staff-assigned — escalate to staff, do not auto-contact')
  }

  // ── Marketing opt-out ────────────────────────────────────────────────────
  if (req.isMarketingOptOut) {
    cls = worse(cls, 'BLOCKED')
    blockers.push('Customer has opted out of marketing communications')
  }

  // ── Payment state guards ──────────────────────────────────────────────────
  if (req.paymentState === 'PAYMENT_RECEIVED') {
    // PAYMENT_RECEIVED ≠ CONFIRMED — automation must not treat this as complete
    cls = worse(cls, 'STAFF_APPROVAL_REQUIRED')
    reasons.push('Payment received but supplier not yet confirmed — requires staff verification')
  }
  if (req.paymentState === 'REFUNDED' || req.paymentState === 'CANCELLED') {
    cls = worse(cls, 'BLOCKED')
    blockers.push(`Action blocked: booking is in terminal state (${req.paymentState})`)
  }

  // ── Multi-currency — NEVER sum different currencies without authoritative FX ──
  if (req.hasMultiCurrency) {
    cls = worse(cls, 'BLOCKED')
    blockers.push('Trip has items in multiple currencies — cannot determine total value without authoritative FX conversion')
  }

  // ── Value thresholds ──────────────────────────────────────────────────────
  if (req.totalValue !== undefined) {
    if (req.totalValue > AUTO_VALUE_THRESHOLD) {
      cls = worse(cls, 'BLOCKED')
      blockers.push(`Trip value (${req.totalValue.toLocaleString()}) exceeds auto-send threshold (${AUTO_VALUE_THRESHOLD})`)
    } else if (req.totalValue > STAFF_REVIEW_VALUE_THRESHOLD) {
      cls = worse(cls, 'STAFF_APPROVAL_REQUIRED')
      reasons.push(`Trip value (${req.totalValue.toLocaleString()}) exceeds staff-review threshold (${STAFF_REVIEW_VALUE_THRESHOLD})`)
    }
  }

  // ── Group booking ─────────────────────────────────────────────────────────
  if (req.isGroupBooking || (req.passengerCount !== undefined && req.passengerCount >= 10)) {
    cls = worse(cls, 'STAFF_APPROVAL_REQUIRED')
    reasons.push(`Group booking (${req.passengerCount ?? '10+'} pax) requires staff review`)
  }

  // ── Visa items — always manual ────────────────────────────────────────────
  if (req.hasVisaItem) {
    cls = worse(cls, 'MANUAL_ONLY')
    reasons.push('Trip includes a visa item — visa decisions are always human-authorised')
  }

  // ── Manual supplier items ─────────────────────────────────────────────────
  if (req.hasManualItem) {
    cls = worse(cls, 'STAFF_APPROVAL_REQUIRED')
    reasons.push('Trip has manually-priced items — requires staff pricing review')
  }

  // ── Stale prices ──────────────────────────────────────────────────────────
  if (req.hasStaleItem) {
    cls = worse(cls, 'BLOCKED')
    blockers.push('One or more items have stale prices — re-search required before automation')
  }

  // ── Proposal auto-send requires explicit customer request ─────────────────
  if (req.action === 'PROPOSAL_AUTO_SEND' && !req.requestedByCustomer) {
    cls = worse(cls, 'BLOCKED')
    blockers.push('Proposal auto-send requires an explicit customer request — not Jade-initiated')
  }

  return {
    automationClass: cls,
    reasons,
    blockers,
    warnings,
    auditMetadata: {
      action:              req.action,
      automationClass:     cls,
      hasMultiCurrency:    req.hasMultiCurrency ?? false,
      totalValue:          req.totalValue ?? null,
      passengerCount:      req.passengerCount ?? null,
      hasVisaItem:         req.hasVisaItem ?? false,
      hasManualItem:       req.hasManualItem ?? false,
      hasStaleItem:        req.hasStaleItem ?? false,
      isStaffAssigned:     req.isStaffAssigned ?? false,
      paymentState:        req.paymentState ?? null,
      flagFollowup:        process.env.JADE_AUTOMATED_FOLLOWUP_ENABLED,
      flagProposalAuto:    process.env.JADE_PROPOSAL_AUTOMATION_ENABLED,
      flagProposalSend:    process.env.JADE_PROPOSAL_AUTO_SEND_ENABLED,
    },
  }
}
