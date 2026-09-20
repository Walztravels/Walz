/**
 * Client Action Centre — per-conversation action-status summary.
 *
 * Phase 3 (Agent D — Client Action Centre UX), item C: a compact,
 * read-only summary of the four Client Action Centre actions (Request
 * Payment, Create Quote, Visa Form, Itinerary Request) for a conversation,
 * additive to the EXISTING client-context response — never a new fetch,
 * never a new endpoint, never a new hook. ClientInfo.tsx renders it as a
 * handful of status chips, omitting any action with no record at all.
 *
 * Resolution mirrors the exact paths already used elsewhere in the Client
 * Action Centre — nothing here is invented:
 *   - PaymentLink / Quote / TripRequest each carry a `conversationId`
 *     column added for this feature (inbox_ux41b / ux42 / ux44 migrations)
 *     — findFirst by conversationId, most recent by createdAt.
 *   - VisaApplication has NO conversationId column. The only correct
 *     resolution is the SAME one resolveClientActionContext already uses:
 *     ConversationClientLink.visaApplicationId → loadApplicationDTO. This
 *     module never re-derives that independently — it's passed the
 *     already-resolved `application` DTO (or null) from the caller.
 *
 * Status labels are the raw, unmodified values already stored on each
 * model (PaymentLink.status, Quote.status, TripRequest.status) — the same
 * values the existing drawers' own STATUS_GLYPH/statusLabel maps already
 * render — except VisaApplication, whose `application.status` is already
 * the coarse, client-safe label resolveClientActionContext computes via
 * safeStatusLabel (e.g. 'In Progress', 'Approved') — reused as-is here,
 * never recomputed.
 */

import prisma from '@/lib/db'
import type { ClientApplicationDTO } from './client-context'

export interface ActionStatusEntry {
  /** The raw model status value (PaymentLink/Quote/TripRequest), or the
   *  already-coarse safeStatusLabel string for visaForm. Never invented. */
  status: string
  updatedAt: string
}

export interface ActionStatusSummary {
  payment: ActionStatusEntry | null
  quote: ActionStatusEntry | null
  visaForm: ActionStatusEntry | null
  itineraryRequest: ActionStatusEntry | null
  /** Team Hub "Ask Team" clarification (TeamInboxDiscussionLink) — additive
   *  fifth chip. See loadActionStatusSummary for the OPEN/ANSWERED/RESOLVED
   *  → display-status mapping; RESOLVED is never surfaced as an entry here
   *  (omitted, same as "no record" for the other four chips). */
  teamClarification: ActionStatusEntry | null
}

const EMPTY_SUMMARY: ActionStatusSummary = {
  payment: null, quote: null, visaForm: null, itineraryRequest: null, teamClarification: null,
}

export interface ActionStatusChip {
  key: 'payment' | 'quote' | 'visaForm' | 'itineraryRequest' | 'teamClarification'
  label: string
  status: string
}

const CHIP_LABELS: Record<ActionStatusChip['key'], string> = {
  payment: 'Payment', quote: 'Quote', visaForm: 'Visa form', itineraryRequest: 'Itinerary request',
  teamClarification: 'Team clarification',
}

/** Pure selection/formatting logic for ClientInfo's status chips — kept
 *  separate from the JSX so it's unit-testable without a DOM (this repo's
 *  test suite runs under Jest's 'node' environment, no jsdom/RTL). Omits
 *  any action with no record for this conversation — no "not started"
 *  clutter, ever. */
export function selectActionStatusChips(summary: ActionStatusSummary | null | undefined): ActionStatusChip[] {
  if (!summary) return []
  return (Object.keys(CHIP_LABELS) as ActionStatusChip['key'][])
    .map(key => {
      const entry = summary[key]
      return entry ? { key, label: CHIP_LABELS[key], status: entry.status } : null
    })
    .filter((c): c is ActionStatusChip => c !== null)
}

/** OPEN → "Awaiting team", ANSWERED → "Team responded", RESOLVED → omitted
 *  entirely (same "no record" treatment as every other chip with nothing
 *  to show) — the raw model status is never surfaced verbatim for this one
 *  chip since OPEN/ANSWERED/RESOLVED read oddly as staff-facing labels. */
function teamClarificationEntry(
  link: { status: string; updatedAt: Date } | null,
): ActionStatusEntry | null {
  if (!link || link.status === 'RESOLVED') return null
  const label = link.status === 'ANSWERED' ? 'Team responded' : 'Awaiting team'
  return { status: label, updatedAt: link.updatedAt.toISOString() }
}

/**
 * @param conversationId Chatwoot conversation id.
 * @param application The SAME `application` DTO resolveClientActionContext
 *   already resolved for this conversation (via ConversationClientLink) —
 *   pass exactly what the caller already has; this function never queries
 *   VisaApplication by conversation on its own.
 */
export async function loadActionStatusSummary(
  conversationId: number,
  application: ClientApplicationDTO | null,
): Promise<ActionStatusSummary> {
  try {
    const [payment, quote, itineraryRequest, visaApp, teamLink] = await Promise.all([
      prisma.paymentLink.findFirst({
        where:   { conversationId },
        orderBy: { createdAt: 'desc' },
        select:  { status: true, updatedAt: true },
      }).catch(() => null),
      prisma.quote.findFirst({
        where:   { conversationId },
        orderBy: { createdAt: 'desc' },
        select:  { status: true, updatedAt: true },
      }).catch(() => null),
      prisma.tripRequest.findFirst({
        where:   { conversationId },
        orderBy: { createdAt: 'desc' },
        select:  { status: true, updatedAt: true },
      }).catch(() => null),
      // Cheap PK lookup only for updatedAt — the status itself is the
      // already-resolved `application.status`, never recomputed here.
      application
        ? prisma.visaApplication.findUnique({ where: { id: application.id }, select: { updatedAt: true } }).catch(() => null)
        : Promise.resolve(null),
      // Team Hub "Ask Team" clarification — most recent link for this Inbox
      // conversation, across every Team Hub message ever linked to it.
      // Optional chaining guards a mock/test double that predates this
      // model, matching this module's own fail-closed-to-null discipline.
      (prisma.teamInboxDiscussionLink?.findFirst({
        where:   { chatwootConversationId: conversationId },
        orderBy: { createdAt: 'desc' },
        select:  { status: true, updatedAt: true },
      }) ?? Promise.resolve(null)).catch(() => null),
    ])

    return {
      payment: payment ? { status: payment.status, updatedAt: payment.updatedAt.toISOString() } : null,
      quote:   quote   ? { status: quote.status,   updatedAt: quote.updatedAt.toISOString() }   : null,
      visaForm: application
        ? { status: application.status, updatedAt: visaApp?.updatedAt?.toISOString() ?? new Date(0).toISOString() }
        : null,
      itineraryRequest: itineraryRequest
        ? { status: itineraryRequest.status, updatedAt: itineraryRequest.updatedAt.toISOString() }
        : null,
      teamClarification: teamClarificationEntry(teamLink),
    }
  } catch (e) {
    // Fail closed — same discipline as resolveClientActionContext: a
    // summary failure never blocks or corrupts the rest of client-context,
    // it just renders no chips (identical to "no record exists").
    console.warn('[action-status] summary load failed:', e)
    return EMPTY_SUMMARY
  }
}
