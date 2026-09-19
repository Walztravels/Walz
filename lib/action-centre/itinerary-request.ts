/**
 * Itinerary Request service (INBOX UX-4.4 — Client Action Centre).
 *
 * REUSES the existing client-intake-to-itinerary pipeline end to end —
 * TripRequest, its public page (app/trip-request/[token]), its public API
 * (app/api/trip-request/[token]), and the existing admin conversion bridge
 * (app/api/admin/trip-requests/[id]/convert) — with NO new persistence
 * model, only additive conversation-linking columns on TripRequest
 * (matching the pattern already used for PaymentLink, Quote, and the visa
 * tables). No new client-form page, no new conversion UI.
 *
 * Deliberately does NOT call the existing admin mint route
 * (POST /api/admin/trip-requests) — that route unconditionally fires an
 * invite email via Resend on creation, with no way to opt out, which would
 * break the Client Action Centre's Generate-never-sends discipline
 * (Copy/Insert/Send is the staff's choice, not automatic). Instead this
 * module replicates only the PERSISTENCE half of that route (create the
 * TripRequest + generate its token) and lets the Inbox drawer share the
 * result through the existing composer send path, exactly like Request
 * Payment, Create Quote, and Visa Form.
 *
 * Identity mandate (unchanged from every other Action Centre action):
 * every mutation re-resolves ClientActionContext server-side and requires
 * VERIFIED or LINKED; client contact fields come from the server-resolved
 * context, never the browser.
 *
 * Client-wide duplicate prevention mirrors the fix shipped for Visa Form's
 * findExistingApplicationForClient: TripRequest has no clientAccountId
 * column, so email is the primary match key for LINKED-via-clientAccount
 * clients (userId is used too, when the conversation is linked to a
 * registered User). See findExistingForClient below for the full
 * zero/one/many fail-closed decision tree.
 */

import crypto from 'crypto'
import prisma from '@/lib/db'
import type { AdminSession } from '@/lib/admin-auth'
import { resolveClientActionContext, type ClientActionContext } from '@/lib/inbox/client-context'
import { resolveCanonicalContact, evaluateProfileCompleteness, type ProfileField, type CanonicalContactResult } from '@/lib/inbox/client-profile'
import { normalizeEmail } from '@/lib/identity/normalize'

/** Itinerary Request's actual requirement is narrower than Visa Form/Create
 *  Quote's ['name','email'] — the public TripRequest form collects the
 *  client's name and every other detail itself (see the module header:
 *  "the CLIENT fills these in on the public form"), so staff only ever
 *  needed an email on file to send the intake link. The bespoke check this
 *  replaces also required ctx.contact.name, which was over-strict — the
 *  UX-4.x Client Profile Completeness audit documented Itinerary Request's
 *  real requirement as email-only, and this module now enforces exactly
 *  that instead. Do not widen this to ['name','email'] by copying Visa
 *  Form's requirement — that would invent a requirement, not fix a bug. */
const ITINERARY_REQUEST_REQUIRED_FIELDS: ProfileField[] = ['email']

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

// TripRequest can carry passport-level PII once the client fills in the
// later steps of the public form (passportNumber, dateOfBirth, etc.) — a
// similar sensitivity profile to the visa document-request flow, so this
// mirrors DOC_REQUEST_EXPIRY_DAYS rather than the shorter visa-form-link
// window (which only ever collects the initial visa-case basics).
const REQUEST_EXPIRY_DAYS = 14

// ── Result types ─────────────────────────────────────────────────────────────

export type ItineraryRequestError =
  | 'CLIENT_IDENTITY_REQUIRED' | 'INVALID_INPUT' | 'REQUEST_ALREADY_EXISTS'
  | 'AMBIGUOUS_REQUEST' | 'ITINERARY_ALREADY_EXISTS' | 'PERSIST_FAILED'
  // Shared Client Profile Completeness layer (lib/inbox/client-profile.ts):
  // the client IS already VERIFIED/LINKED (a distinct concept from
  // CLIENT_IDENTITY_REQUIRED above) but their profile is missing data this
  // action needs — exactly mirrors Visa Form's VisaActionError.
  | 'CLIENT_PROFILE_INCOMPLETE'

export interface ItineraryRequestDTO {
  id: string
  referenceNumber: string
  status: string            // 'pending' | 'submitted' | 'viewed' | 'converted'
  link: string
  expiresAt: string | null
  submittedAt: string | null
  createdAt: string
}

export type ItineraryRequestResult<T> =
  | { ok: true; data: T }
  | {
      ok: false; code: ItineraryRequestError; error: string
      /** REQUEST_ALREADY_EXISTS: the request already linked to this conversation. */
      existing?: ItineraryRequestDTO
      /** ITINERARY_ALREADY_EXISTS: the client's existing itinerary reference. */
      itineraryRef?: string
      /** For CLIENT_PROFILE_INCOMPLETE only. */
      missingFields?: ProfileField[]
      availableFields?: Partial<Record<ProfileField, string>>
      /** For CLIENT_PROFILE_INCOMPLETE only — QA gap fix: a genuine
       *  cross-record data-integrity conflict (see lib/inbox/client-profile.ts),
       *  never an ordinarily-missing field. Structurally should stay empty/absent. */
      crossRecordConflicts?: CanonicalContactResult['crossRecordConflicts']
    }

// ── Shared identity re-resolution ────────────────────────────────────────────

async function requireLinkedIdentity(conversationId: number, session: AdminSession) {
  const resolved = await resolveClientActionContext(conversationId, session)
  if (!resolved.ok) return { ok: false as const, code: 'CLIENT_IDENTITY_REQUIRED' as const, error: resolved.error }
  const ctx = resolved.context
  if (ctx.resolution !== 'VERIFIED' && ctx.resolution !== 'LINKED') {
    return {
      ok: false as const, code: 'CLIENT_IDENTITY_REQUIRED' as const,
      error: 'Verify or link the client identity before using the Itinerary Request action.',
    }
  }
  // IDENTITY (who is this?) vs PROFILE COMPLETENESS (do we have the data
  // this action needs?) are distinct — the client above IS already
  // VERIFIED/LINKED. lib/inbox/client-profile.ts's canonical resolution
  // blends ctx.contact (Chatwoot) with whichever User/ClientAccount/Lead/
  // VisaApplication is actually linked, so a field staff already filled in
  // elsewhere is recognised here too. Mirrors Visa Form's
  // requireLinkedIdentity exactly, except the requirement list (see
  // ITINERARY_REQUEST_REQUIRED_FIELDS above — email only, not name+email).
  const canonical = await resolveCanonicalContact(ctx)
  const completeness = evaluateProfileCompleteness(canonical, ITINERARY_REQUEST_REQUIRED_FIELDS)
  if (!completeness.complete) {
    return {
      ok: false as const, code: 'CLIENT_PROFILE_INCOMPLETE' as const,
      error: 'This client’s profile is missing information the Itinerary Request action needs.',
      missingFields: completeness.missingFields,
      availableFields: completeness.availableFields,
      crossRecordConflicts: completeness.crossRecordConflicts,
    }
  }
  // Server-derived contact for everything below — the CANONICAL values
  // (never raw ctx.contact alone, which may be thinner) — but never a
  // browser-typed one.
  const contact = {
    name: canonical.fields.name?.value ?? null,
    email: canonical.fields.email?.value ?? null,
    phone: canonical.fields.phone?.value ?? null,
  }
  return { ok: true as const, ctx: { ...ctx, contact } as ClientActionContext }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type TripRequestRow = {
  id: string; referenceNumber: string; status: string; token: string
  expiresAt: Date | null; submittedAt: Date | null; createdAt: Date
}

const TR_SELECT = {
  id: true, referenceNumber: true, status: true, token: true,
  expiresAt: true, submittedAt: true, createdAt: true,
} as const

function toDTO(row: TripRequestRow): ItineraryRequestDTO {
  return {
    id: row.id, referenceNumber: row.referenceNumber, status: row.status,
    link: `${SITE}/trip-request/${row.token}`,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Mirrors app/api/admin/trip-requests/route.ts's own generateRef() —
 *  kept local because that function is not exported from the route file. */
function generateReferenceNumber(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let ref = 'WALZ-REQ-'
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)]
  return ref
}

type ExistingTripRequestRow = TripRequestRow & { conversationId: number | null }
type ExistingItineraryRow = { id: string; referenceNumber: string }

/**
 * Client-wide duplicate check, scoped to the ALREADY-resolved client
 * (ctx.user / ctx.contact.email) — mirrors Visa Form's
 * findExistingApplicationForClient. Fail-closed: zero -> create is safe,
 * exactly one -> find/link (or report) it, more than one (whether across
 * TripRequests, Itineraries, or a mix) -> never guess.
 *
 * QA Bug B fix: the Itinerary side of this check must exclude terminal/
 * closed itineraries, or a client who finished a trip long ago can never
 * get a fresh intake request again. Itinerary.status has NO enum in
 * schema.prisma (String @default("draft")) — the real, currently-used
 * vocabulary was confirmed directly against call sites, not guessed:
 * draft/proposal/approved/revision_sent/revision_accepted/live (the public
 * status gate — app/itinerary/[ref]/page.tsx:45 — and the accept route's
 * ELIGIBLE_STATUSES/comment — app/api/itinerary/[ref]/approve/route.ts:
 * 23,164-166) plus 'archived' (the manually-set closed/terminal state —
 * STATUS_LABELS/STATUS_CONFIG dictionaries and the status-editing dropdown
 * in app/admin/itinerary-planner/[id]/page.tsx:293-298,4288 and
 * app/admin/itinerary-planner/page.tsx:28-33). There is no 'completed',
 * 'cancelled', or 'delivered' value anywhere in the codebase — 'archived'
 * is the only real terminal/closed state staff use once a trip is done, so
 * that is the one excluded below.
 */
async function findExistingForClient(
  ctx: { user?: { id: string } | null; clientAccount?: { id: string } | null; contact?: { email?: string | null } | null },
): Promise<
  | { status: 'none' }
  | { status: 'tripRequest'; tripRequest: ExistingTripRequestRow }
  | { status: 'itinerary'; itinerary: ExistingItineraryRow }
  | { status: 'ambiguous' }
> {
  const email = normalizeEmail(ctx.contact?.email)

  const trOr: Array<Record<string, unknown>> = []
  if (ctx.user?.id) trOr.push({ userId: ctx.user.id })
  if (email) trOr.push({ email: { equals: email, mode: 'insensitive' } })

  const itinOr: Array<Record<string, unknown>> = []
  if (ctx.clientAccount?.id) itinOr.push({ clientAccountId: ctx.clientAccount.id })
  if (email) itinOr.push({ clientEmail: { equals: email, mode: 'insensitive' } })

  if (trOr.length === 0 && itinOr.length === 0) return { status: 'none' }

  const [tripRequests, itineraries] = await Promise.all([
    trOr.length > 0
      ? prisma.tripRequest.findMany({
          where: { OR: trOr, status: { not: 'converted' } },
          take: 5,
          orderBy: { updatedAt: 'desc' },
          select: { ...TR_SELECT, conversationId: true },
        })
      : Promise.resolve([] as ExistingTripRequestRow[]),
    itinOr.length > 0
      ? prisma.itinerary.findMany({
          // QA Bug B: exclude 'archived' — the confirmed real terminal
          // status (see the comment above findExistingForClient for where
          // this vocabulary was checked) — so a completed/archived trip
          // never permanently blocks a new intake request for the client.
          where: { OR: itinOr, status: { not: 'archived' } },
          take: 5,
          orderBy: { updatedAt: 'desc' },
          select: { id: true, referenceNumber: true },
        })
      : Promise.resolve([] as ExistingItineraryRow[]),
  ])

  const total = tripRequests.length + itineraries.length
  if (total === 0) return { status: 'none' }
  if (total > 1) return { status: 'ambiguous' }
  if (tripRequests.length === 1) return { status: 'tripRequest', tripRequest: tripRequests[0] }
  return { status: 'itinerary', itinerary: itineraries[0] }
}

// ── Create (mint) an itinerary intake request ────────────────────────────────

export interface CreateItineraryRequestInput {
  session: AdminSession
  conversationId: number
  /**
   * All optional — the whole point of TripRequest is the CLIENT fills
   * these in on the public form; staff are never required to pre-fill it
   * on the client's behalf. Plain hints only.
   */
  destination?: string | null
  departureDate?: string | null   // 'YYYY-MM-DD', stored as-is (schema: String?)
  returnDate?: string | null      // 'YYYY-MM-DD', stored as-is (schema: String?)
  numberOfTravellers?: number | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function createItineraryRequest(
  input: CreateItineraryRequestInput,
): Promise<ItineraryRequestResult<ItineraryRequestDTO>> {
  const identity = await requireLinkedIdentity(input.conversationId, input.session)
  if (!identity.ok) return identity
  const { ctx } = identity

  // (1) This conversation already has a STILL-OPEN request — never mint a
  // second one. QA Bug A fix: this must NOT match a request that was
  // already `converted` into a completed Itinerary — a long-running
  // Chatwoot/WhatsApp thread can span many separate trips over months or
  // years, and a converted request from an old trip should never
  // permanently disable this feature for the conversation. Scoped with the
  // exact same `status: { not: 'converted' }` filter already used three
  // lines below for the client-wide TripRequest check, for consistency.
  let convExisting: ExistingTripRequestRow | null = null
  try {
    convExisting = await prisma.tripRequest.findFirst({
      where: { conversationId: input.conversationId, status: { not: 'converted' } },
      orderBy: { createdAt: 'desc' },
      select: { ...TR_SELECT, conversationId: true },
    })
  } catch (e) {
    console.warn('[action-centre] itinerary request conversation lookup failed:', (e as Error).message)
  }
  if (convExisting) {
    return {
      ok: false, code: 'REQUEST_ALREADY_EXISTS',
      error: 'An itinerary request already exists for this conversation.',
      existing: toDTO(convExisting),
    }
  }

  // (2) Client-wide duplicate prevention — fail closed, never guess.
  const found = await findExistingForClient(ctx)
  if (found.status === 'ambiguous') {
    return {
      ok: false, code: 'AMBIGUOUS_REQUEST',
      error: 'This client has multiple existing itinerary requests or itineraries — resolve manually before generating a new one.',
    }
  }
  if (found.status === 'itinerary') {
    return {
      ok: false, code: 'ITINERARY_ALREADY_EXISTS',
      error: `This client already has an itinerary in progress: ${found.itinerary.referenceNumber}.`,
      itineraryRef: found.itinerary.referenceNumber,
    }
  }
  if (found.status === 'tripRequest') {
    // Attach THIS conversation to the client's existing open request
    // instead of minting a duplicate — no separate link table is involved
    // here (unlike Visa Form's ConversationClientLink extension): the
    // audit deliberately kept this feature off that shared table, per the
    // Quote precedent.
    try {
      const updated = await prisma.tripRequest.update({
        where: { id: found.tripRequest.id },
        data: { conversationId: input.conversationId, source: 'inbox_action_centre' },
        select: TR_SELECT,
      })
      console.log(`[action-centre] ITINERARY_REQUEST_LINKED_EXISTING ref=${updated.referenceNumber} conv=${input.conversationId} by=${input.session.email}`)
      return { ok: true, data: toDTO(updated) }
    } catch (e) {
      console.error('[action-centre] itinerary request link failed:', (e as Error).message)
      return { ok: false, code: 'PERSIST_FAILED', error: 'Found an existing intake link but could not attach it to this conversation. Retry.' }
    }
  }

  // (3) Input validation — every field optional; validate only what's supplied.
  const destination = input.destination != null ? String(input.destination).trim() : ''
  if (destination.length > 200) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Destination is too long.' }
  }
  for (const [label, value] of [['departureDate', input.departureDate], ['returnDate', input.returnDate]] as const) {
    if (value != null && value !== '' && !DATE_RE.test(String(value))) {
      return { ok: false, code: 'INVALID_INPUT', error: `Invalid ${label}.` }
    }
  }
  let numberOfTravellers: number | undefined
  if (input.numberOfTravellers != null) {
    const n = Number(input.numberOfTravellers)
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      return { ok: false, code: 'INVALID_INPUT', error: 'Number of travellers must be a whole number between 1 and 50.' }
    }
    numberOfTravellers = n
  }

  // Server-derived contact only — never a browser-typed name/email. Name is
  // NOT a required field for this action (see ITINERARY_REQUEST_REQUIRED_
  // FIELDS — only email is) — the client fills their name in on the public
  // TripRequest form themselves, so it may legitimately be absent here.
  const trimmedName = ctx.contact?.name?.trim() ?? ''
  const nameParts = trimmedName ? trimmedName.split(/\s+/) : []
  let referenceNumber = generateReferenceNumber()
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.tripRequest.findUnique({ where: { referenceNumber }, select: { id: true } })
    if (!clash) break
    referenceNumber = generateReferenceNumber()
  }
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + REQUEST_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  // Security review (MEDIUM): two concurrent POSTs on the same conversation
  // can both pass the (1) findFirst check above before either create()
  // lands, minting two TripRequest rows for one conversation. Mirrors the
  // recentLink re-check added for createVisaCase (lib/action-centre/
  // visa-form.ts, "Security review (MEDIUM)" comment) — but TripRequest,
  // unlike VisaApplication, IS queryable directly by conversationId, so no
  // indirection through a link table is needed here. This narrows, not
  // eliminates, the race — the same accepted limitation as that precedent.
  const recentConvRequest = await prisma.tripRequest.findFirst({
    where: {
      conversationId: input.conversationId,
      status: { not: 'converted' },
      createdAt: { gte: new Date(Date.now() - 10_000) },
    },
    orderBy: { createdAt: 'desc' },
    select: { ...TR_SELECT, conversationId: true },
  }).catch(() => null)
  if (recentConvRequest) {
    return {
      ok: false, code: 'REQUEST_ALREADY_EXISTS',
      error: 'An itinerary request already exists for this conversation.',
      existing: toDTO(recentConvRequest),
    }
  }

  let row: TripRequestRow
  try {
    row = await prisma.tripRequest.create({
      data: {
        token, referenceNumber, status: 'pending',
        firstName: nameParts[0] ?? null,
        lastName: nameParts.slice(1).join(' ') || null,
        email: ctx.contact!.email, phone: ctx.contact!.phone ?? null,
        destination: destination || null,
        departureDate: input.departureDate || null,
        returnDate: input.returnDate || null,
        numberOfTravellers: numberOfTravellers ?? undefined,
        userId: ctx.user?.id ?? null,
        sentBy: input.session.email,
        sentByName: input.session.name ?? null,
        conversationId: input.conversationId,
        source: 'inbox_action_centre',
        expiresAt,
      },
      select: TR_SELECT,
    })
  } catch (e) {
    console.error('[action-centre] itinerary request creation failed:', (e as Error).message)
    return { ok: false, code: 'PERSIST_FAILED', error: 'Could not create the itinerary request. Retry.' }
  }

  console.log(`[action-centre] ITINERARY_REQUEST_CREATED ref=${referenceNumber} conv=${input.conversationId} by=${input.session.email}`)
  return { ok: true, data: toDTO(row) }
}

// ── Recent itinerary requests for a conversation (Client 360 list) ─────────

export async function listRecentItineraryRequests(conversationId: number): Promise<ItineraryRequestDTO[]> {
  try {
    const rows = await prisma.tripRequest.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: TR_SELECT,
    })
    return rows.map(toDTO)
  } catch (e) {
    console.warn('[action-centre] listRecentItineraryRequests failed:', (e as Error).message)
    return []
  }
}
