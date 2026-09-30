// lib/business/services.ts — Walz Business (Release 2): TravelRequestService
// activation — linking a TravelRequest to the mature booking domain
// (Quote / VisaApplication / Itinerary / Trip).
//
// TENANT MODEL (the single most important rule in this module)
//   Quote / VisaApplication / Itinerary / Trip carry NO organizationId. Their
//   organization scope is resolved ONLY by joining
//     linked entity  <-  TravelRequestService.linked*Id
//                    ->  TravelRequestService.travelRequestId
//                    ->  TravelRequest.organizationId
//   Every read therefore needs the TWO-PRONGED check the approve route
//   established:
//     (1) assertOrgScopedAccess(userId, urlOrgId)       (caller is a member)
//     (2) the TravelRequestService row reached actually hangs off a
//         TravelRequest whose organizationId === urlOrgId (and, for nested
//         routes, whose id === urlRequestId).
//   loadServiceInRequestInOrg() below is (2) for single-service routes;
//   list reads query services `where: { travelRequestId }` only AFTER the
//   request itself passed (2).
//
// EXCLUSIVITY (the cross-org linkage defence)
//   A given Quote/Visa/Itinerary/Trip may be linked to services of AT MOST
//   ONE organization. findForeignOrganizationLink() is checked inside a
//   SERIALIZABLE transaction before every link write, so an org-A request
//   can never be linked to a record that already belongs to org B — even if
//   the caller supplies org B's real record id.
//
// OWNERSHIP GATE (security-review remediation, Finding A)
//   Exclusivity alone is not enough: an unlinked retail customer's record
//   could otherwise be attached to any organization. Before the CAS, the
//   link transaction loads the record's OWN ownership signal (never anything
//   from the request body — see loadLinkTargetOwnership) and requires it to
//   match an ACTIVE member or a CLAIMED (claim-verified) traveller of the
//   TARGET organization (ownerBelongsToOrganization — see its evidence
//   hierarchy; an unclaimed roster traveller is never evidence). No match — including a Trip with no userId
//   or a record with no checkable signal at all — is OWNERSHIP_UNVERIFIED,
//   resolvable only by an explicit, reasoned, audited staff override.
//
// WHO MAY LINK: staff only (b2b.manage). A customer org member can never
// search the global Quote/Visa/Itinerary/Trip tables, so the customer API
// only ever creates UNLINKED service rows (serviceType only) and ignores any
// linked*Id a client sends.

import prisma from '@/lib/db'

export const SERVICE_TYPES = ['FLIGHT', 'HOTEL', 'VISA', 'TRANSFER', 'ESIM', 'ITINERARY'] as const
export type ServiceType = (typeof SERVICE_TYPES)[number]

export const LINK_KINDS = ['QUOTE', 'VISA_APPLICATION', 'ITINERARY', 'TRIP'] as const
export type LinkKind = (typeof LINK_KINDS)[number]

export const LINK_COLUMN: Record<LinkKind, 'linkedQuoteId' | 'linkedVisaApplicationId' | 'linkedItineraryId' | 'linkedTripId'> = {
  QUOTE: 'linkedQuoteId',
  VISA_APPLICATION: 'linkedVisaApplicationId',
  ITINERARY: 'linkedItineraryId',
  TRIP: 'linkedTripId',
}

// Which kinds of mature record make sense for which service type. A VISA
// service links only to a visa case; every other service type links to a
// commercial record (quote/itinerary/trip), never to a visa case.
export const ALLOWED_LINKS: Record<ServiceType, readonly LinkKind[]> = {
  FLIGHT: ['QUOTE', 'ITINERARY', 'TRIP'],
  HOTEL: ['QUOTE', 'ITINERARY', 'TRIP'],
  TRANSFER: ['QUOTE', 'ITINERARY', 'TRIP'],
  ESIM: ['QUOTE', 'ITINERARY', 'TRIP'],
  ITINERARY: ['ITINERARY', 'QUOTE', 'TRIP'],
  VISA: ['VISA_APPLICATION'],
}

export function isServiceType(v: unknown): v is ServiceType {
  return typeof v === 'string' && (SERVICE_TYPES as readonly string[]).includes(v)
}
export function isLinkKind(v: unknown): v is LinkKind {
  return typeof v === 'string' && (LINK_KINDS as readonly string[]).includes(v)
}

type Db = Pick<typeof prisma, 'travelRequestService' | 'quote' | 'visaApplication' | 'itinerary' | 'trip' | 'organizationMembership' | 'businessTraveller'>

/**
 * Prong (2) for single-service routes. Returns the service row only if it
 * exists, hangs off `requestId`, and that request belongs to `organizationId`.
 * Every failure is the same `null` (callers map it to a generic 404).
 */
export async function loadServiceInRequestInOrg(serviceId: string, requestId: string, organizationId: string) {
  if (!serviceId || !requestId || !organizationId) return null
  const service = await prisma.travelRequestService.findUnique({
    where: { id: serviceId },
    include: { travelRequest: { select: { id: true, organizationId: true } } },
  })
  if (!service) return null
  if (service.travelRequestId !== requestId) return null
  if (!service.travelRequest || service.travelRequest.id !== requestId) return null
  if (service.travelRequest.organizationId !== organizationId) return null
  return service
}

/** Does the mature record exist at all? */
export async function linkTargetExists(db: Db, kind: LinkKind, id: string): Promise<boolean> {
  switch (kind) {
    case 'QUOTE': return !!(await db.quote.findUnique({ where: { id }, select: { id: true } }))
    case 'VISA_APPLICATION': return !!(await db.visaApplication.findUnique({ where: { id }, select: { id: true } }))
    case 'ITINERARY': return !!(await db.itinerary.findUnique({ where: { id }, select: { id: true } }))
    case 'TRIP': return !!(await db.trip.findUnique({ where: { id }, select: { id: true } }))
  }
}

/**
 * The ownership signal of a mature record, read from the record row itself.
 * Authoritative fields (prisma/schema.prisma):
 *   QUOTE            clientEmail (required; Quote has no userId)
 *   VISA_APPLICATION userId (preferred) — email ONLY when userId is null
 *   ITINERARY        clientEmail (required)
 *   TRIP             userId (nullable; Trip has no email) — a null userId
 *                    (anonymous/session trip) can never be auto-verified.
 */
// Error code for a link whose ownership could not be verified. Distinct from
// the generic tenant-isolation 404 ('Not found') and from the other 409s: a
// legitimate staff decision point, not a security denial. The response
// never carries any detected identity (in particular no visa applicant data).
export const OWNERSHIP_UNVERIFIED_ERROR = 'OWNERSHIP_UNVERIFIED'

export interface LinkTargetOwnership { userId: string | null; email: string | null }

export function normalizeEmail(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const n = v.trim().toLowerCase()
  return n || null
}

/**
 * Loads the record and its ownership signal. Returns null when the record
 * does not exist (callers keep the existing generic 'missing' path).
 * Identity is ALWAYS derived from the stored row — never from the request.
 */
export async function loadLinkTargetOwnership(db: Db, kind: LinkKind, id: string): Promise<LinkTargetOwnership | null> {
  switch (kind) {
    case 'QUOTE': {
      const r = await db.quote.findUnique({ where: { id }, select: { id: true, clientEmail: true } })
      return r ? { userId: null, email: normalizeEmail(r.clientEmail) } : null
    }
    case 'VISA_APPLICATION': {
      const r = await db.visaApplication.findUnique({ where: { id }, select: { id: true, userId: true, email: true } })
      if (!r) return null
      // Prefer the stronger userId signal; email is a fallback only.
      return r.userId ? { userId: r.userId, email: null } : { userId: null, email: normalizeEmail(r.email) }
    }
    case 'ITINERARY': {
      const r = await db.itinerary.findUnique({ where: { id }, select: { id: true, clientEmail: true } })
      return r ? { userId: null, email: normalizeEmail(r.clientEmail) } : null
    }
    case 'TRIP': {
      const r = await db.trip.findUnique({ where: { id }, select: { id: true, userId: true } })
      return r ? { userId: r.userId ?? null, email: null } : null
    }
  }
}

// Exact status values that count as "belongs to the org" for the ownership
// gate. See ownerBelongsToOrganization() doc comment. Note the differing case:
// OrganizationMembership uses 'ACTIVE' (INVITED|ACTIVE|SUSPENDED|REMOVED, DB
// CHECK constraint); BusinessTraveller uses free-text, default 'active'.
// NOTE: traveller `status` is LIFECYCLE state only — it is the schema default
// at creation and says NOTHING about identity. It is never ownership evidence
// on its own; see OWNERSHIP_CLAIMED_TRAVELLER below.
export const OWNERSHIP_MEMBERSHIP_STATUS = 'ACTIVE'
export const OWNERSHIP_TRAVELLER_STATUS = 'active'

// Prisma `where` fragment selecting ONLY BusinessTraveller rows whose identity
// has been independently verified by the actual person through the explicit
// claim flow (lib/business/claim.ts::consumeBusinessTravellerClaim, which is
// the ONLY writer of claimVerifiedAt/userId and sets them together, atomically,
// once). An unclaimed roster row — which any TRAVEL_MANAGER can create for any
// email with zero consent from that person — never matches this fragment.
//   claimVerifiedAt NOT NULL : the claim was consumed (verified inbox + signed-in
//                              account registered to that inbox).
//   userId NOT NULL          : the verified account link still exists (a User
//                              deletion SetNulls userId; a re-issued claim token
//                              nulls claimVerifiedAt) — both must hold.
// The lifecycle `status` allow-list is applied IN ADDITION (defense in depth:
// a claimed row that is later deactivated must stop counting), never instead.
export const OWNERSHIP_CLAIMED_TRAVELLER = {
  status: OWNERSHIP_TRAVELLER_STATUS,
  claimVerifiedAt: { not: null },
  userId: { not: null },
} as const

/**
 * Does the record's owner belong to `organizationId`? Explicit ownership
 * EVIDENCE HIERARCHY — every query is scoped to the TARGET organization only:
 *
 *   1. Authoritative User linkage (record carries a real userId — TRIP, or
 *      VISA_APPLICATION with userId set). Passes iff that userId holds
 *        (a) an OrganizationMembership with status 'ACTIVE' in the org, OR
 *        (b) a CLAIMED BusinessTraveller of the org whose userId matches
 *            (OWNERSHIP_CLAIMED_TRAVELLER).
 *      A userId that does not match is never rescued by an email.
 *   2. Email linkage (record has no userId — QUOTE, ITINERARY, or
 *      VISA_APPLICATION with null userId; normalized stored email). Passes iff
 *      the email equals (normalized) either
 *        (a) the email of a CLAIMED BusinessTraveller of the org
 *            (OWNERSHIP_CLAIMED_TRAVELLER) — an unclaimed traveller row,
 *            whatever its status, is NOT ownership evidence, OR
 *        (b) the User.email of a user holding an ACTIVE membership in the org.
 *   3. Anything else — unclaimed traveller match, no match, no signal at all
 *      (e.g. TRIP with null userId, which has no email field) — false
 *      (OWNERSHIP_UNVERIFIED; resolvable only by the audited staff override).
 *
 * Status filters are EXACT-MATCH allow-lists, never deny-lists:
 *   - OrganizationMembership: only 'ACTIVE' (the same rule as
 *     lib/business/authz.ts::assertOrgScopedAccess). INVITED rows are created
 *     by an org admin with ZERO consent from the invitee (members POST route),
 *     so an INVITED/SUSPENDED/REMOVED row must never count as ownership.
 *   - BusinessTraveller: only the literal lowercase 'active', AND claimed.
 *     Status alone is never sufficient: the travellers POST route
 *     (TRAVEL_MANAGER) creates 'active' rows for any email without consent.
 * Emails are compared after trim+lowercase on BOTH sides in application
 * code, so legacy rows stored with stray whitespace/case still match.
 */
export async function ownerBelongsToOrganization(db: Db, owner: LinkTargetOwnership, organizationId: string): Promise<boolean> {
  if (!organizationId) return false
  if (owner.userId) {
    const [member, traveller] = await Promise.all([
      db.organizationMembership.findFirst({
        where: { organizationId, userId: owner.userId, status: OWNERSHIP_MEMBERSHIP_STATUS },
        select: { id: true },
      }),
      db.businessTraveller.findFirst({
        where: { ...OWNERSHIP_CLAIMED_TRAVELLER, organizationId, userId: owner.userId },
        select: { id: true },
      }),
    ])
    return !!member || !!traveller
  }
  const email = normalizeEmail(owner.email)
  if (!email) return false
  const [travellers, members] = await Promise.all([
    db.businessTraveller.findMany({ where: { ...OWNERSHIP_CLAIMED_TRAVELLER, organizationId }, select: { email: true } }),
    db.organizationMembership.findMany({
      where: { organizationId, status: OWNERSHIP_MEMBERSHIP_STATUS },
      select: { user: { select: { email: true } } },
    }),
  ])
  if (travellers.some(t => normalizeEmail(t.email) === email)) return true
  return members.some(m => normalizeEmail(m.user?.email) === email)
}

/**
 * Returns a service row (of ANY request) that links `kind:id` and belongs to
 * an organization OTHER than `organizationId`, or null. Non-null means the
 * record already belongs to another tenant and must never be linked here.
 */
export async function findForeignOrganizationLink(db: Db, kind: LinkKind, id: string, organizationId: string) {
  return db.travelRequestService.findFirst({
    where: {
      [LINK_COLUMN[kind]]: id,
      travelRequest: { organizationId: { not: organizationId } },
    },
    select: { id: true },
  })
}

export interface LinkedSummaryOptions {
  // Monetary fields (quote totals, itinerary price) are only returned when
  // the caller is allowed to see them (never the floor TRAVELLER role).
  includeFinancials: boolean
}

export interface LinkedSummary {
  kind: LinkKind
  id: string
  reference: string | null
  title: string | null
  status: string | null
  detail: string | null
  startDate: Date | null
  endDate: Date | null
  currency?: string | null
  total?: string | null
}

type ServiceLinks = { linkedQuoteId: string | null; linkedVisaApplicationId: string | null; linkedItineraryId: string | null; linkedTripId: string | null }

/**
 * Batch-loads minimal summaries for every linked record across `services`.
 * The caller MUST have already scoped `services` to one verified request /
 * organization (prong 2). Visa summaries NEVER include any applicant
 * personal data or passport fields — only reference/destination/type/status.
 */
export async function loadLinkedSummaries(services: ServiceLinks[], opts: LinkedSummaryOptions): Promise<Map<string, LinkedSummary>> {
  const ids = (col: keyof ServiceLinks) => Array.from(new Set(services.map(s => s[col]).filter((v): v is string => !!v)))
  const quoteIds = ids('linkedQuoteId')
  const visaIds = ids('linkedVisaApplicationId')
  const itinIds = ids('linkedItineraryId')
  const tripIds = ids('linkedTripId')

  const [quotes, visas, itins, trips] = await Promise.all([
    quoteIds.length ? prisma.quote.findMany({
      where: { id: { in: quoteIds } },
      select: { id: true, reference: true, title: true, status: true, currency: true, totalMinor: true, validUntil: true },
    }) : Promise.resolve([]),
    visaIds.length ? prisma.visaApplication.findMany({
      where: { id: { in: visaIds } },
      select: { id: true, referenceNumber: true, destinationIso2: true, visaType: true, status: true },
    }) : Promise.resolve([]),
    itinIds.length ? prisma.itinerary.findMany({
      where: { id: { in: itinIds } },
      select: { id: true, referenceNumber: true, title: true, status: true, destination: true, startDate: true, endDate: true, currency: true, totalPrice: true },
    }) : Promise.resolve([]),
    tripIds.length ? prisma.trip.findMany({
      where: { id: { in: tripIds } },
      select: { id: true, title: true, status: true, destination: true, startDate: true, endDate: true },
    }) : Promise.resolve([]),
  ])

  const out = new Map<string, LinkedSummary>()
  for (const q of quotes) {
    out.set(`QUOTE:${q.id}`, {
      kind: 'QUOTE', id: q.id, reference: q.reference, title: q.title, status: q.status,
      detail: `Valid until ${q.validUntil.toISOString().slice(0, 10)}`, startDate: null, endDate: null,
      ...(opts.includeFinancials ? { currency: q.currency, total: (Number(q.totalMinor) / 100).toFixed(2) } : {}),
    })
  }
  for (const v of visas) {
    out.set(`VISA_APPLICATION:${v.id}`, {
      kind: 'VISA_APPLICATION', id: v.id, reference: v.referenceNumber, title: `${v.visaType} visa — ${v.destinationIso2}`,
      status: v.status, detail: null, startDate: null, endDate: null,
    })
  }
  for (const i of itins) {
    out.set(`ITINERARY:${i.id}`, {
      kind: 'ITINERARY', id: i.id, reference: i.referenceNumber, title: i.title, status: i.status,
      detail: i.destination, startDate: i.startDate, endDate: i.endDate,
      ...(opts.includeFinancials ? { currency: i.currency, total: i.totalPrice != null ? i.totalPrice.toFixed(2) : null } : {}),
    })
  }
  for (const t of trips) {
    out.set(`TRIP:${t.id}`, {
      kind: 'TRIP', id: t.id, reference: null, title: t.title, status: String(t.status),
      detail: t.destination || null, startDate: t.startDate, endDate: t.endDate,
    })
  }
  return out
}

export interface ServiceRow extends ServiceLinks { id: string; serviceType: string; createdAt: Date }

export function serializeServices(services: ServiceRow[], summaries: Map<string, LinkedSummary>) {
  return services.map(s => ({
    id: s.id,
    serviceType: s.serviceType,
    createdAt: s.createdAt,
    links: (LINK_KINDS.map(kind => {
      const id = s[LINK_COLUMN[kind]]
      if (!id) return null
      // A dangling id (record deleted; FK is ON DELETE SET NULL so this is
      // only a transient state) renders as an opaque "unavailable" link.
      return summaries.get(`${kind}:${id}`) ?? { kind, id, reference: null, title: 'Record unavailable', status: null, detail: null, startDate: null, endDate: null }
    }).filter(Boolean)) as LinkedSummary[],
  }))
}
