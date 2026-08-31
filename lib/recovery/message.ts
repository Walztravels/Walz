// Recovery message dispatcher (Release 3C)
//
// sendRecoveryMessage(opportunityId):
//   1. Load opportunity
//   2. Check suppression (includes SUPPLIER_FAILURE guard)
//   3. Resolve customer contact info
//   4. Build email HTML
//   5. Send email (if RECOVERY_EMAIL_ENABLED)
//   6. Send WhatsApp (if RECOVERY_WHATSAPP_ENABLED + phone available)
//   7. Record recovery_contacted CommercialEvent
//   8. Increment contactCount, set lastContactedAt, status → CONTACTED
//   9. Set nextActionAt for second contact (or null if cap reached)
//
// All errors are caught — this is best-effort. If no contact info is found,
// the function logs and returns without sending.

import prisma from '@/lib/db'
import { checkSuppression, MAX_AUTO_CONTACTS } from './suppression'
import { checkAndAudit } from '@/lib/automation/audit'
import {
  buildAbandonedCartHtml,
  buildUnpaidProposalHtml,
  buildFailedPaymentHtml,
  buildIncompleteTripHtml,
  sendRecoveryEmail,
  recoverySubject,
} from './email-recovery'
import { sendRecoveryWhatsApp } from './whatsapp-recovery'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://walztravels.com'

// ── Portal notification helpers — safe strings only, no price/availability claims ──
export function portalTitle(type: string, destination?: string): string {
  const dest = destination || 'trip'
  switch (type) {
    case 'ABANDONED_CART':
      return `Continue planning your ${dest}`
    case 'UNPAID_PROPOSAL':
      return 'Your travel proposal is waiting'
    case 'FAILED_PAYMENT':
      return 'Action needed on your booking'
    case 'INCOMPLETE_TRIP':
      return `Your ${dest} plan is still saved`
    default:
      return 'Update from Walz Travels'
  }
}

export function portalBody(type: string): string {
  switch (type) {
    case 'ABANDONED_CART':
      return 'You have an incomplete booking. Tap to continue.'
    case 'UNPAID_PROPOSAL':
      return 'Your proposal is ready to review. Tap to view or ask questions.'
    case 'FAILED_PAYMENT':
      return 'There was an issue with your payment. Tap to resolve.'
    case 'INCOMPLETE_TRIP':
      return 'Your trip plan is saved and waiting. Tap to pick up where you left off.'
    default:
      return 'You have an update. Tap to view your dashboard.'
  }
}

// ── Contact scheduling: delay to second contact after first ──────────────────
const SECOND_CONTACT_DELAY_MS: Record<string, number> = {
  ABANDONED_CART:  20 * 60 * 60 * 1000,  // 20 hours
  UNPAID_PROPOSAL: 44 * 60 * 60 * 1000,  // 44 hours (~2 days total from first)
  FAILED_PAYMENT:  0,                      // no second automated message
  INCOMPLETE_TRIP: 48 * 60 * 60 * 1000,  // 48 hours
}

// ── Contact info resolved from the opportunity's linked entities ─────────────
interface CustomerContact {
  email:       string | null
  name:        string
  phone:       string | null
  destination: string
  resumeUrl:   string
}

async function resolveCustomerContact(opp: {
  type:         string
  leadId:       string | null
  userId:       string | null
  cartSessionId: string | null
  quoteId:      string | null
  tripId:       string | null
  bookingId:    string | null
}): Promise<CustomerContact | null> {
  // ── UNPAID_PROPOSAL — quote has authoritative contact ────────────────────
  if (opp.type === 'UNPAID_PROPOSAL' && opp.quoteId) {
    const quote = await prisma.quote.findUnique({
      where:  { id: opp.quoteId },
      select: { clientName: true, clientEmail: true, title: true, secureTokenHash: true, reference: true },
    })
    if (!quote?.clientEmail) return null
    return {
      email:       quote.clientEmail,
      name:        quote.clientName,
      phone:       null,
      destination: quote.title ?? '',
      resumeUrl:   `${BASE_URL}/proposal/${quote.secureTokenHash}`,
    }
  }

  // ── ABANDONED_CART — resolve via lead or user ────────────────────────────
  if (opp.type === 'ABANDONED_CART') {
    if (opp.leadId) {
      const lead = await prisma.lead.findUnique({
        where:  { id: opp.leadId },
        select: { name: true, email: true, whatsapp: true, destination: true },
      })
      if (lead?.email) {
        return {
          email:       lead.email,
          name:        lead.name,
          phone:       lead.whatsapp ?? null,
          destination: lead.destination ?? '',
          resumeUrl:   `${BASE_URL}/cart`,
        }
      }
    }
    if (opp.userId) {
      const user = await prisma.user.findUnique({
        where:  { id: opp.userId },
        select: { name: true, email: true, phone: true },
      })
      if (user?.email) {
        return {
          email:       user.email,
          name:        user.name ?? 'Valued Customer',
          phone:       user.phone ?? null,
          destination: '',
          resumeUrl:   `${BASE_URL}/cart`,
        }
      }
    }
    // Try via cartSession
    if (opp.cartSessionId) {
      const cart = await prisma.cartSession.findUnique({
        where:  { id: opp.cartSessionId },
        select: { userId: true, leadId: true, sessionId: true },
      })
      if (cart?.leadId) {
        const lead = await prisma.lead.findUnique({
          where:  { id: cart.leadId },
          select: { name: true, email: true, whatsapp: true, destination: true },
        })
        if (lead?.email) {
          return {
            email:       lead.email,
            name:        lead.name,
            phone:       lead.whatsapp ?? null,
            destination: lead.destination ?? '',
            resumeUrl:   `${BASE_URL}/cart`,
          }
        }
      }
    }
    return null
  }

  // ── INCOMPLETE_TRIP ───────────────────────────────────────────────────────
  if (opp.type === 'INCOMPLETE_TRIP' && opp.tripId) {
    const trip = await prisma.trip.findUnique({
      where:  { id: opp.tripId },
      select: { destination: true, userId: true, leadId: true },
    })
    if (trip?.leadId) {
      const lead = await prisma.lead.findUnique({
        where:  { id: trip.leadId },
        select: { name: true, email: true, whatsapp: true },
      })
      if (lead?.email) {
        return {
          email:       lead.email,
          name:        lead.name,
          phone:       lead.whatsapp ?? null,
          destination: trip.destination ?? '',
          resumeUrl:   `${BASE_URL}/plan`,
        }
      }
    }
    if (trip?.userId) {
      const user = await prisma.user.findUnique({
        where:  { id: trip.userId },
        select: { name: true, email: true, phone: true },
      })
      if (user?.email) {
        return {
          email:       user.email,
          name:        user.name ?? 'Valued Customer',
          phone:       user.phone ?? null,
          destination: trip.destination ?? '',
          resumeUrl:   `${BASE_URL}/plan/${opp.tripId}`,
        }
      }
    }
    return null
  }

  // ── FAILED_PAYMENT — try lead or user ────────────────────────────────────
  if (opp.type === 'FAILED_PAYMENT') {
    if (opp.leadId) {
      const lead = await prisma.lead.findUnique({
        where:  { id: opp.leadId },
        select: { name: true, email: true, whatsapp: true },
      })
      if (lead?.email) {
        return {
          email:       lead.email,
          name:        lead.name,
          phone:       lead.whatsapp ?? null,
          destination: '',
          resumeUrl:   `${BASE_URL}/cart`,
        }
      }
    }
    if (opp.userId) {
      const user = await prisma.user.findUnique({
        where:  { id: opp.userId },
        select: { name: true, email: true, phone: true },
      })
      if (user?.email) {
        return {
          email:       user.email,
          name:        user.name ?? 'Valued Customer',
          phone:       user.phone ?? null,
          destination: '',
          resumeUrl:   `${BASE_URL}/cart`,
        }
      }
    }
    return null
  }

  return null
}

// ── Build tracking URL (server-authoritative click recording) ─────────────────
function buildTrackingUrl(opportunityId: string, targetUrl: string): string {
  const encoded = encodeURIComponent(targetUrl)
  return `${BASE_URL}/api/recovery/track/${opportunityId}?url=${encoded}`
}

// ── Main dispatcher ───────────────────────────────────────────────────────────
export async function sendRecoveryMessage(opportunityId: string): Promise<void> {
  // FIX 1 (Blocker Fix): Master kill switch.
  // canAutomateRecovery() also checks this flag, but the dispatcher itself
  // must enforce it — not only the pre-flight function that callers may skip.
  if (process.env.JADE_AUTOMATED_FOLLOWUP_ENABLED !== 'true') return

  if (
    process.env.RECOVERY_EMAIL_ENABLED !== 'true' &&
    process.env.RECOVERY_WHATSAPP_ENABLED !== 'true'
  ) return

  let opp: {
    id: string; type: string; status: string; contactCount: number
    leadId: string | null; userId: string | null; cartSessionId: string | null
    quoteId: string | null; tripId: string | null; bookingId: string | null
    amount: number | null; currency: string | null; reason: string
  } | null = null

  try {
    opp = await prisma.recoveryOpportunity.findUnique({
      where:  { id: opportunityId },
      select: {
        id: true, type: true, status: true, contactCount: true,
        leadId: true, userId: true, cartSessionId: true,
        quoteId: true, tripId: true, bookingId: true,
        amount: true, currency: true, reason: true,
      },
    })
  } catch (err) {
    console.warn('[RecoveryMsg] load failed:', (err as Error).message)
    return
  }

  if (!opp) return

  // ── Suppression check (excludes contact-cap — that is the atomic gate below) ──
  const suppression = await checkSuppression(opp)
  if (suppression.suppressed) {
    console.log('[RecoveryMsg] suppressed:', opp.id, suppression.reason)
    return
  }

  // FIX 2 (Blocker Fix): Audit the automation decision and enforce fail-closed behavior.
  // Must run AFTER suppression (to avoid flooding audit log with suppressed items)
  // and BEFORE the atomic gate (before any autonomous action is taken).
  const { result: eligibility, auditId } = await checkAndAudit(
    {
      action:        'RECOVERY_EMAIL',
      opportunityId: opp.id,
      leadId:        opp.leadId ?? undefined,
    },
    {
      opportunityId: opp.id,
      leadId:        opp.leadId ?? undefined,
      entityType:    'RecoveryOpportunity',
      entityId:      opp.id,
      correlationId: `recovery-${opp.id}`,
      actor:         'system',
    },
  )

  if (eligibility.automationClass === 'BLOCKED' || eligibility.automationClass === 'MANUAL_ONLY') {
    console.log('[RecoveryMsg] eligibility check prevented autonomous send:', opp.id, eligibility.automationClass, eligibility.blockers)
    return
  }

  if (eligibility.automationClass === 'STAFF_APPROVAL_REQUIRED') {
    const { bridgeToApprovalQueue } = await import('@/lib/automation/autopilot')
    await bridgeToApprovalQueue({
      action:     'RECOVERY_EMAIL',
      entityId:   opp.id,
      entityType: 'RecoveryOpportunity',
      reason:     eligibility.reasons.join('; ') || 'Staff review required',
    }).catch(err => console.warn('[RecoveryMsg] bridgeToApprovalQueue failed:', (err as Error).message))
    return
  }

  // AUTO_ALLOWED — fail closed if the audit write failed
  if (auditId === null) {
    console.error('[RecoveryMsg] Audit write failed for AUTO_ALLOWED decision — aborting autonomous send:', opp.id)
    return
  }

  // ── Atomic pre-claim: increment contactCount only if still below cap ──────
  // This is the TOCTOU fix. Concurrent cron runs will race on this updateMany;
  // only the first to succeed (count=1) proceeds. The loser sees count=0 and exits.
  const claimed = await prisma.recoveryOpportunity.updateMany({
    where: {
      id:           opp.id,
      contactCount: { lt: MAX_AUTO_CONTACTS },
      status:       { notIn: ['RECOVERED', 'LOST', 'DISMISSED'] },
    },
    data: { contactCount: { increment: 1 } },
  }).catch(() => ({ count: 0 }))

  if (claimed.count === 0) {
    console.log('[RecoveryMsg] claim lost or cap reached (concurrent run):', opp.id)
    return
  }

  // ── Resolve customer contact ──────────────────────────────────────────────
  const contact = await resolveCustomerContact(opp)
  if (!contact) {
    console.log('[RecoveryMsg] no contact info for opportunity', opp.id, opp.type)
    return
  }

  const trackingUrl = buildTrackingUrl(opp.id, contact.resumeUrl)

  // ── Build and send email ──────────────────────────────────────────────────
  let emailSent = false
  if (process.env.RECOVERY_EMAIL_ENABLED === 'true' && contact.email) {
    try {
      let html = ''
      switch (opp.type) {
        case 'ABANDONED_CART':
          html = buildAbandonedCartHtml({ to: contact.email, clientName: contact.name, destination: contact.destination, trackingUrl, resumeUrl: contact.resumeUrl })
          break
        case 'UNPAID_PROPOSAL':
          // Pull reference from reason string (format: "Proposal REF sent to ...")
          const refMatch = opp.reason.match(/Proposal (\S+) sent/)
          html = buildUnpaidProposalHtml({ to: contact.email, clientName: contact.name, reference: refMatch?.[1] ?? '', destination: contact.destination, trackingUrl })
          break
        case 'FAILED_PAYMENT':
          html = buildFailedPaymentHtml({ to: contact.email, clientName: contact.name, isUnknown: false, trackingUrl, retryUrl: contact.resumeUrl })
          break
        case 'INCOMPLETE_TRIP':
          html = buildIncompleteTripHtml({ to: contact.email, clientName: contact.name, destination: contact.destination, trackingUrl })
          break
      }
      if (html) {
        await sendRecoveryEmail({
          to:      contact.email,
          subject: recoverySubject(opp.type, contact.destination),
          html,
        })
        emailSent = true
      }
    } catch (err) {
      console.warn('[RecoveryMsg] email send failed:', opp.id, (err as Error).message)
    }
  }

  // ── Send WhatsApp ─────────────────────────────────────────────────────────
  let waSent = false
  if (contact.phone && process.env.RECOVERY_WHATSAPP_ENABLED === 'true') {
    try {
      await sendRecoveryWhatsApp({
        toPhone:    contact.phone,
        clientName: contact.name,
        type:       opp.type,
        destination: contact.destination,
        resumeUrl:  trackingUrl,
      })
      waSent = true
    } catch (err) {
      console.warn('[RecoveryMsg] WhatsApp send failed:', opp.id, (err as Error).message)
    }
  }

  // ── Send portal notification ──────────────────────────────────────────────
  if (opp.userId && process.env.RECOVERY_PORTAL_ENABLED === 'true') {
    try {
      const { createCustomerNotification } = await import('@/lib/portal/notifications')
      await createCustomerNotification({
        userId:    opp.userId,
        category:  'ACTION',
        type:      'RECOVERY',
        title:     portalTitle(opp.type, contact.destination),
        body:      portalBody(opp.type),
        href:      '/' + (opp.type === 'UNPAID_PROPOSAL' ? 'dashboard/proposals' : 'dashboard'),
        dedupeKey: `recovery_portal_${opp.id}_${opp.contactCount}`,
      })
    } catch { /* non-fatal */ }
  }

  if (!emailSent && !waSent) return // nothing was sent

  // ── Record commercial event ───────────────────────────────────────────────
  try {
    await prisma.commercialEvent.create({
      data: {
        event:    'recovery_contacted',
        leadId:   opp.leadId ?? null,
        userId:   opp.userId ?? null,
        metadata: { opportunityId: opp.id, type: opp.type, channel: emailSent ? 'email' : 'whatsapp' },
      },
    })
  } catch { /* non-fatal */ }

  // ── Finalise opportunity: contactCount already incremented atomically above ─
  // Compute new count from the pre-claim read + 1 (the atomic gate already wrote it).
  const newCount     = opp.contactCount + 1
  const delayMs      = SECOND_CONTACT_DELAY_MS[opp.type] ?? 0
  const nextActionAt = newCount < MAX_AUTO_CONTACTS && delayMs > 0
    ? new Date(Date.now() + delayMs)
    : null

  try {
    await prisma.recoveryOpportunity.update({
      where: { id: opp.id },
      data: {
        lastContactedAt: new Date(),
        status:          opp.status === 'OPEN' ? 'CONTACTED' : opp.status,
        nextActionAt,
        lastActivityAt:  new Date(),
      },
    })
  } catch (err) {
    console.warn('[RecoveryMsg] update failed:', opp.id, (err as Error).message)
  }
}
