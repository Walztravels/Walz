// Recovery suppression (Release 3C)
//
// All suppression rules in one place. sendRecoveryMessage() calls this before
// sending anything. Any rule returning suppressed=true aborts the send.
//
// CRITICAL RULES (never override):
//   • SUPPLIER_FAILURE → never automated — staff-managed operational case
//   • HOT_LEAD         → no automated customer contact; staff notification only
//   • contactCount >= MAX_AUTO_CONTACTS → cap reached
//   • Lead.marketingOptOut → skip marketing recovery
//   • Closed/resolved entity → skip (cart converted, quote accepted/declined)

import prisma from '@/lib/db'

// Max automated messages per opportunity before handing to staff
export const MAX_AUTO_CONTACTS = parseInt(
  process.env.RECOVERY_MAX_AUTO_CONTACTS ?? '2', 10
)

// Types that must never trigger automated customer messaging
const NEVER_AUTO_MESSAGE_TYPES = new Set(['SUPPLIER_FAILURE', 'HOT_LEAD'])

export interface SuppressionResult {
  suppressed: boolean
  reason?:    string
}

export interface OpportunityForSuppression {
  id:            string
  type:          string
  status:        string
  contactCount:  number
  leadId:        string | null
  cartSessionId: string | null
  quoteId:       string | null
  tripId:        string | null
  bookingId:     string | null
}

export async function checkSuppression(
  opp: OpportunityForSuppression
): Promise<SuppressionResult> {

  // ── Hardcoded: operational types never get automated messages ─────────────
  if (NEVER_AUTO_MESSAGE_TYPES.has(opp.type)) {
    return { suppressed: true, reason: `type ${opp.type} is staff-managed only` }
  }

  // ── Status-based ──────────────────────────────────────────────────────────
  if (['RECOVERED', 'LOST', 'DISMISSED'].includes(opp.status)) {
    return { suppressed: true, reason: `opportunity already ${opp.status}` }
  }

  // ── Contact cap ───────────────────────────────────────────────────────────
  if (opp.contactCount >= MAX_AUTO_CONTACTS) {
    return { suppressed: true, reason: `contact cap reached (${opp.contactCount}/${MAX_AUTO_CONTACTS})` }
  }

  // ── Lead marketing opt-out ────────────────────────────────────────────────
  if (opp.leadId) {
    const lead = await prisma.lead.findUnique({
      where:  { id: opp.leadId },
      select: { marketingOptOut: true },
    })
    if (lead?.marketingOptOut) {
      return { suppressed: true, reason: 'lead has opted out of marketing' }
    }
  }

  // ── Cart already converted ────────────────────────────────────────────────
  if (opp.type === 'ABANDONED_CART' && opp.cartSessionId) {
    const cart = await prisma.cartSession.findUnique({
      where:  { id: opp.cartSessionId },
      select: { convertedAt: true },
    })
    if (cart?.convertedAt) {
      return { suppressed: true, reason: 'cart already converted' }
    }
  }

  // ── Quote already resolved ────────────────────────────────────────────────
  if (opp.type === 'UNPAID_PROPOSAL' && opp.quoteId) {
    const quote = await prisma.quote.findUnique({
      where:  { id: opp.quoteId },
      select: { acceptedAt: true, declinedAt: true, convertedAt: true },
    })
    if (quote?.acceptedAt || quote?.declinedAt || quote?.convertedAt) {
      return { suppressed: true, reason: 'proposal already resolved' }
    }
  }

  return { suppressed: false }
}
