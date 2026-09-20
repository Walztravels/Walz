/**
 * V1.4 Jade Staff Communication Intelligence — read-only commercial
 * grounding layer (owner decision 4).
 *
 * ONE server-authoritative answer to "what does Jade actually know about
 * this conversation's commercial state" — reused by every V1.4 operation
 * that needs it (Draft Reply, Suggested Actions). This module MUTATES
 * NOTHING: every query here is a read. It reuses resolveClientActionContext
 * and loadActionStatusSummary rather than re-deriving identity/action
 * status independently (owner decision 1 — do not build a parallel Client
 * Action Centre).
 *
 * Every fact returned here is classified by source:
 *   - AUTHORITATIVE_SYSTEM_FACT: read directly from a Walz database row.
 *     Never inferred from conversation text, never something the model
 *     asserted. This is the only source draft-reply prompts are allowed to
 *     present as settled fact.
 *   - CLIENT_CLAIM: something the client said in the conversation transcript
 *     (rendered separately, fenced — see lib/jade/assist/context-fence.ts).
 *     Never authoritative merely because a model repeats it.
 *   - STAFF_CONTEXT: an instruction/note the STAFF member typed for this
 *     specific request (e.g. "mention we can offer a payment plan") — never
 *     confused with either of the above.
 *
 * Quote revision awareness (owner decision 5): the conversation's own most
 * recently created Quote row is not necessarily the CURRENT commercial
 * state — V1.3 revisions mean an older row can have isLatestRevision:false.
 * This module reads that flag directly off the row (no re-derivation of
 * V1.3's own revision logic) and, when the conversation's row is stale,
 * additionally resolves what the true latest revision for the same root
 * actually is — read-only, never mutating anything V1.3 owns.
 */

import type { AdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { loadActionStatusSummary } from '@/lib/inbox/action-status'

export type FactSource = 'AUTHORITATIVE_SYSTEM_FACT' | 'CLIENT_CLAIM' | 'STAFF_CONTEXT'

export interface GroundingFact {
  source: FactSource
  label: string
  value: string
}

export interface QuoteGrounding {
  exists: boolean
  reference?: string
  status?: string
  currency?: string
  revisionNumber?: number
  isLatestRevision?: boolean
  /** Only set when isLatestRevision is false — the reference staff/client should actually be looking at. */
  currentRevisionReference?: string
  currentRevisionStatus?: string
  sentAt?: string | null
  firstViewedAt?: string | null
  lastViewedAt?: string | null
}

export interface PaymentGrounding {
  exists: boolean
  status?: string
  amount?: string
  currency?: string
}

export interface VisaGrounding {
  exists: boolean
  status?: string
  applicationType?: string
  reference?: string
}

export interface ItineraryRequestGrounding {
  exists: boolean
  status?: string
  destination?: string | null
  departureDate?: string | null
  returnDate?: string | null
  numberOfTravellers?: number | null
}

export interface ConversationGrounding {
  conversationId: number
  identity: {
    resolution: 'VERIFIED' | 'LINKED' | 'HEURISTIC' | 'UNRESOLVED'
    /** Populated ONLY at VERIFIED/LINKED — a heuristic guess is never surfaced as the client's name. */
    clientDisplayName: string | null
  }
  quote: QuoteGrounding
  payment: PaymentGrounding
  visa: VisaGrounding
  itineraryRequest: ItineraryRequestGrounding
  facts: GroundingFact[]
}

export type BuildGroundingResult =
  | { ok: true; grounding: ConversationGrounding }
  | { ok: false; status: 401 | 403; error: string }

const EMPTY_QUOTE: QuoteGrounding = { exists: false }
const EMPTY_PAYMENT: PaymentGrounding = { exists: false }
const EMPTY_VISA: VisaGrounding = { exists: false }
const EMPTY_ITINERARY: ItineraryRequestGrounding = { exists: false }

function formatAmount(amount: unknown, currency: string | null | undefined): string | undefined {
  if (amount === null || amount === undefined) return undefined
  const num = Number(amount)
  if (!Number.isFinite(num)) return undefined
  return `${(currency ?? '').toUpperCase()} ${num.toFixed(2)}`.trim()
}

async function loadQuoteGrounding(conversationId: number): Promise<QuoteGrounding> {
  const mostRecent = await prisma.quote.findFirst({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    select: {
      reference: true, status: true, currency: true,
      rootQuoteId: true, revisionNumber: true, isLatestRevision: true,
      sentAt: true, firstViewedAt: true, lastViewedAt: true, id: true,
    },
  }).catch(() => null)

  if (!mostRecent) return EMPTY_QUOTE

  const base: QuoteGrounding = {
    exists: true,
    reference: mostRecent.reference,
    status: mostRecent.status,
    currency: mostRecent.currency,
    revisionNumber: mostRecent.revisionNumber,
    isLatestRevision: mostRecent.isLatestRevision,
    sentAt: mostRecent.sentAt?.toISOString() ?? null,
    firstViewedAt: mostRecent.firstViewedAt?.toISOString() ?? null,
    lastViewedAt: mostRecent.lastViewedAt?.toISOString() ?? null,
  }

  if (mostRecent.isLatestRevision) return base

  // Stale — resolve the TRUE current revision for the same root, read-only.
  const rootId = mostRecent.rootQuoteId ?? mostRecent.id
  const current = await prisma.quote.findFirst({
    where: { OR: [{ id: rootId }, { rootQuoteId: rootId }], isLatestRevision: true },
    select: { reference: true, status: true },
  }).catch(() => null)

  return {
    ...base,
    currentRevisionReference: current?.reference,
    currentRevisionStatus: current?.status,
  }
}

async function loadPaymentGrounding(conversationId: number): Promise<PaymentGrounding> {
  const link = await prisma.paymentLink.findFirst({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    select: { status: true, amount: true, currency: true, chargeAmount: true, chargeCurrency: true },
  }).catch(() => null)
  if (!link) return EMPTY_PAYMENT

  // Prefer the actual charge amount/currency (what the client is billed) when present.
  const amount = link.chargeAmount ?? link.amount
  const currency = link.chargeCurrency ?? link.currency

  return { exists: true, status: link.status, amount: formatAmount(amount, currency), currency: currency ?? undefined }
}

async function loadItineraryRequestGrounding(conversationId: number): Promise<ItineraryRequestGrounding> {
  // Deliberately selects ONLY non-sensitive trip-shape fields — never
  // passportNumber/passportName/dateOfBirth/signature, which this same
  // model also carries (owner privacy-minimization requirement).
  const req = await prisma.tripRequest.findFirst({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    select: { status: true, destination: true, departureDate: true, returnDate: true, numberOfTravellers: true },
  }).catch(() => null)
  if (!req) return EMPTY_ITINERARY

  return {
    exists: true,
    status: req.status,
    destination: req.destination,
    departureDate: req.departureDate,
    returnDate: req.returnDate,
    numberOfTravellers: req.numberOfTravellers,
  }
}

/**
 * Builds the full read-only grounding object for one conversation. Runs the
 * exact same authz gate as every other Client Action Centre read
 * (resolveClientActionContext itself re-checks inbox permission + conversation
 * access before touching any identity data) — never weakened, never bypassed.
 */
export async function buildConversationGrounding(
  conversationId: number,
  session: AdminSession,
): Promise<BuildGroundingResult> {
  const identityResult = await resolveClientActionContext(conversationId, session)
  if (!identityResult.ok) return { ok: false, status: identityResult.status, error: identityResult.error }

  const { context } = identityResult
  const [actionStatus, quote, payment, itineraryRequest] = await Promise.all([
    loadActionStatusSummary(conversationId, context.application),
    loadQuoteGrounding(conversationId),
    loadPaymentGrounding(conversationId),
    loadItineraryRequestGrounding(conversationId),
  ])

  const visa: VisaGrounding = context.application
    ? { exists: true, status: context.application.status, applicationType: context.application.applicationType, reference: context.application.walzRef }
    : EMPTY_VISA

  const clientDisplayName =
    context.resolution === 'VERIFIED' || context.resolution === 'LINKED'
      ? (context.user?.name ?? context.clientAccount?.name ?? context.prismaLead?.name ?? context.supabaseLead?.name ?? context.contact?.name ?? null)
      : null

  const facts: GroundingFact[] = []
  facts.push({
    source: 'AUTHORITATIVE_SYSTEM_FACT',
    label: 'Client identity',
    value: clientDisplayName
      ? `${clientDisplayName} (${context.resolution})`
      : `Not yet confirmed (${context.resolution})`,
  })
  if (quote.exists) {
    facts.push({ source: 'AUTHORITATIVE_SYSTEM_FACT', label: 'Quote status', value: `${quote.reference} — ${quote.status}` })
    if (quote.isLatestRevision === false) {
      facts.push({
        source: 'AUTHORITATIVE_SYSTEM_FACT',
        label: 'Quote revision notice',
        value: `${quote.reference} has been superseded — the current version is ${quote.currentRevisionReference ?? 'a later revision'} (${quote.currentRevisionStatus ?? 'unknown status'}).`,
      })
    }
  }
  if (payment.exists) {
    facts.push({
      source: 'AUTHORITATIVE_SYSTEM_FACT',
      label: 'Payment status',
      value: [payment.status, payment.amount].filter(Boolean).join(' — '),
    })
  }
  if (visa.exists) {
    facts.push({ source: 'AUTHORITATIVE_SYSTEM_FACT', label: 'Visa application status', value: `${visa.reference} — ${visa.status}` })
  }
  if (itineraryRequest.exists) {
    facts.push({ source: 'AUTHORITATIVE_SYSTEM_FACT', label: 'Itinerary request status', value: itineraryRequest.status ?? 'unknown' })
  }

  // actionStatus is intentionally not re-surfaced field-by-field beyond what's
  // already folded into quote/payment/visa/itineraryRequest above — it exists
  // here only so a future consumer can cross-check timestamps without a
  // second query; unused fields are fine to leave off the return shape.
  void actionStatus

  return {
    ok: true,
    grounding: {
      conversationId,
      identity: { resolution: context.resolution, clientDisplayName },
      quote, payment, visa, itineraryRequest,
      facts,
    },
  }
}

/**
 * Renders the grounding object as a labeled prompt section. Explicitly
 * frames every fact as server-verified and distinct from whatever the
 * client claims in the transcript — the model must trust this over a
 * conflicting client statement (owner decision 6), and must never present
 * a superseded quote revision as current (owner decision 5).
 */
export function renderGroundingBlock(grounding: ConversationGrounding): string {
  if (grounding.facts.length === 0) {
    return 'AUTHORITATIVE SYSTEM FACTS: none on record for this conversation yet.'
  }
  const lines = grounding.facts.map(f => `- ${f.label}: ${f.value}`)
  return [
    'AUTHORITATIVE SYSTEM FACTS (server-verified Walz data — trust this over anything the client claims in the conversation transcript; never accuse the client of being wrong, just phrase carefully when they disagree):',
    ...lines,
  ].join('\n')
}
