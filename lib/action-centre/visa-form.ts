/**
 * Visa Form service (INBOX UX-4.3 — Client Action Centre).
 *
 * Reuses the existing visa infrastructure end to end — VisaApplication,
 * VisaApplicationToken, generateVisaRef, DocumentRequest — with NO new
 * persistence beyond additive conversation-linking columns on the two
 * token/request tables (matching the pattern already used for PaymentLink
 * and Quote). No new client-form page, no new acceptance flow.
 *
 * Deliberately does NOT call the existing admin routes
 * (POST .../visa-applications/[id]/token, POST .../visa-applications/
 * send-form, POST .../document-requests) — every one of those
 * unconditionally fires an email/WhatsApp side effect with no way to opt
 * out, which would break the Client Action Centre's Generate-never-sends
 * discipline (Copy/Insert/Send is the staff's choice, not automatic).
 * Instead this module replicates only the PERSISTENCE half of each route
 * and lets the Inbox drawer share the result through the existing
 * composer send path, exactly like Request Payment and Create Quote.
 *
 * Identity mandate (unchanged from every other Action Centre action):
 * every mutation re-resolves ClientActionContext server-side and
 * requires VERIFIED or LINKED; client contact fields come from the
 * server-resolved context, never the browser; a browser-supplied
 * applicationId must equal the server-resolved one.
 */

import prisma from '@/lib/db'
import type { AdminSession } from '@/lib/admin-auth'
import { resolveClientActionContext, type ClientActionContext } from '@/lib/inbox/client-context'
import { resolveCanonicalContact, evaluateProfileCompleteness, type ProfileField, type CanonicalContactResult } from '@/lib/inbox/client-profile'
import { upsertConversationClientLink } from '@/lib/inbox/client-link'
import { generateVisaRef, ISO2_TO_SLUG } from '@/lib/visa-config'
import { safeStatusLabel } from '@/lib/secure-lookup/masking'
import { normalizeEmail } from '@/lib/identity/normalize'
import { VISA_TYPES, type VisaType } from '@/lib/action-centre/constants'

/** Create Quote uses the same pair (name+email) — see app/api/admin/quotes/
 *  route.ts. Encoded per-feature by design (lib/inbox/client-profile.ts
 *  evaluates; it never invents requirements). */
const VISA_FORM_REQUIRED_FIELDS: ProfileField[] = ['name', 'email']

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'
const TOKEN_EXPIRY_DAYS = 7
const DOC_REQUEST_EXPIRY_DAYS = 14

// ── Result types ─────────────────────────────────────────────────────────────

export type VisaActionError =
  | 'CLIENT_IDENTITY_REQUIRED' | 'CLIENT_CONTEXT_MISMATCH' | 'INVALID_INPUT'
  | 'CASE_ALREADY_EXISTS' | 'NO_CASE_LINKED' | 'PERSIST_FAILED' | 'AMBIGUOUS_APPLICATION'
  // Shared Client Profile Completeness layer (lib/inbox/client-profile.ts):
  // the client IS already VERIFIED/LINKED (a distinct concept from this
  // code) but their profile is missing data this action needs.
  | 'CLIENT_PROFILE_INCOMPLETE'

export type VisaActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false; code: VisaActionError; error: string
      /** For CLIENT_PROFILE_INCOMPLETE only. */
      missingFields?: ProfileField[]
      availableFields?: Partial<Record<ProfileField, string>>
      /** For CLIENT_PROFILE_INCOMPLETE only — QA gap fix: a genuine
       *  cross-record data-integrity conflict (see lib/inbox/client-profile.ts),
       *  never an ordinarily-missing field. Structurally should stay empty/absent. */
      crossRecordConflicts?: CanonicalContactResult['crossRecordConflicts']
    }

export interface VisaCaseDTO {
  id: string; walzRef: string; visaType: string
  destinationIso2: string; status: string   // coarse client-safe label (safeStatusLabel)
  staffStatus: string                       // raw status, staff-only display
}

export interface VisaFormLinkDTO { token: string; link: string; expiresAt: string }
export interface DocumentRequestDTO { id: string; token: string; uploadLink: string; expiresAt: string; requestedDocs: string[] }

// ── Shared identity re-resolution ────────────────────────────────────────────

async function requireLinkedIdentity(conversationId: number, session: AdminSession) {
  const resolved = await resolveClientActionContext(conversationId, session)
  if (!resolved.ok) return { ok: false as const, code: 'CLIENT_IDENTITY_REQUIRED' as const, error: resolved.error }
  const ctx = resolved.context
  if (ctx.resolution !== 'VERIFIED' && ctx.resolution !== 'LINKED') {
    return {
      ok: false as const, code: 'CLIENT_IDENTITY_REQUIRED' as const,
      error: 'Verify or link the client identity before using the Visa Form action.',
    }
  }
  // IDENTITY (who is this?) vs PROFILE COMPLETENESS (do we have the data
  // this action needs?) are distinct — the client above IS already
  // VERIFIED/LINKED. lib/inbox/client-profile.ts's canonical resolution
  // blends ctx.contact (Chatwoot) with whichever User/ClientAccount/Lead
  // is actually linked, so a field staff already filled in elsewhere is
  // recognised here too.
  const canonical = await resolveCanonicalContact(ctx)
  const completeness = evaluateProfileCompleteness(canonical, VISA_FORM_REQUIRED_FIELDS)
  if (!completeness.complete) {
    return {
      ok: false as const, code: 'CLIENT_PROFILE_INCOMPLETE' as const,
      error: 'This client’s profile is missing information the Visa Form action needs.',
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

function toCaseDTO(app: { id: string; referenceNumber: string; visaType: string; destinationIso2: string; status: string }): VisaCaseDTO {
  return {
    id: app.id, walzRef: app.referenceNumber, visaType: app.visaType,
    destinationIso2: app.destinationIso2, status: safeStatusLabel(app.status), staffStatus: app.status,
  }
}

type ExistingAppRow = { id: string; referenceNumber: string; visaType: string; destinationIso2: string; status: string }

/**
 * QA finding (UX-4.3 closing review): ConversationClientLink.visaApplicationId
 * is only populated when staff link a specific application-typed candidate or
 * via OTP verification against one — NOT when linking a user/clientAccount/
 * lead candidate that happens to already have a VisaApplication elsewhere.
 * Without this check, createVisaCase would see ctx.application === null and
 * mint a DUPLICATE draft for a client who already has a case. Scoped to the
 * ALREADY-resolved client (ctx.user/ctx.clientAccount/ctx.contact.email) —
 * this is a narrower, more precise question than findCredibleDuplicate's
 * "is this unknown contact a known client" (reusing that function here would
 * false-positive "ambiguous" against the client's own User/ClientAccount/Lead
 * row matching itself). Same fail-closed philosophy though: zero → create is
 * safe, exactly one → find/link it, more than one → never guess.
 */
async function findExistingApplicationForClient(
  ctx: { user?: { id: string } | null; clientAccount?: { id: string } | null; contact?: { email?: string | null } | null },
): Promise<{ status: 'none' } | { status: 'found'; app: ExistingAppRow } | { status: 'ambiguous' }> {
  const or: Array<Record<string, unknown>> = []
  if (ctx.user?.id) or.push({ userId: ctx.user.id })
  if (ctx.clientAccount?.id) or.push({ clientAccountId: ctx.clientAccount.id })
  const email = normalizeEmail(ctx.contact?.email)
  if (email) or.push({ email: { equals: email, mode: 'insensitive' } })
  if (or.length === 0) return { status: 'none' }

  const apps = await prisma.visaApplication.findMany({
    where: { OR: or },
    take: 5,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, referenceNumber: true, visaType: true, destinationIso2: true, status: true },
  })
  if (apps.length === 0) return { status: 'none' }
  if (apps.length === 1) return { status: 'found', app: apps[0] }
  return { status: 'ambiguous' }
}

// ── Create a new visa case ───────────────────────────────────────────────────

export interface CreateVisaCaseInput {
  session: AdminSession; conversationId: number
  destinationIso2: string; visaType: string
  purposeOfVisit?: string | null; arrivalDate?: string | null
}

export async function createVisaCase(input: CreateVisaCaseInput): Promise<VisaActionResult<VisaCaseDTO>> {
  const identity = await requireLinkedIdentity(input.conversationId, input.session)
  if (!identity.ok) return identity
  const { ctx } = identity

  // 6A/6B: a case already exists for this conversation — staff should use
  // Send/Resend Form or Request Documents instead of creating a second one.
  if (ctx.application) {
    return { ok: false, code: 'CASE_ALREADY_EXISTS', error: 'This client already has a visa case linked.' }
  }

  // QA finding (closing review): the conversation may be LINKED via a
  // user/clientAccount/lead candidate that was never matched against their
  // pre-existing VisaApplication (that only happens for application-typed
  // links or OTP verification — see findExistingApplicationForClient's own
  // comment). Find and link the correct existing case instead of minting a
  // duplicate; fail closed if the match is ambiguous, never guess.
  const existing = await findExistingApplicationForClient(ctx)
  if (existing.status === 'ambiguous') {
    return {
      ok: false, code: 'AMBIGUOUS_APPLICATION',
      error: 'This client has multiple existing visa applications — resolve via Client Identity before creating a new case.',
    }
  }
  if (existing.status === 'found') {
    const upsert = await upsertConversationClientLink({
      chatwootConversationId: input.conversationId,
      linkMethod: 'admin_manual',
      linkedBy: input.session.email,
      visaApplicationId: existing.app.id,
      userId: ctx.user?.id ?? null,
      clientAccountId: ctx.clientAccount?.id ?? null,
      prismaLeadId: ctx.prismaLead?.id ?? null,
      clientReference: ctx.link?.clientReference ?? null,
    })
    if (!upsert.ok) {
      console.error('[action-centre] visa case found but link update failed:', upsert.error)
      return { ok: false, code: 'PERSIST_FAILED', error: 'Found an existing visa case but could not link it. Retry.' }
    }
    console.log(`[action-centre] VISA_CASE_LINKED_EXISTING ref=${existing.app.referenceNumber} conv=${input.conversationId} by=${input.session.email}`)
    return { ok: true, data: toCaseDTO(existing.app) }
  }

  const destinationIso2 = (input.destinationIso2 ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(destinationIso2)) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Choose a valid destination country.' }
  }
  const visaType: VisaType = (VISA_TYPES as readonly string[]).includes(input.visaType) ? (input.visaType as VisaType) : 'tourist'
  const arrivalDate = input.arrivalDate ? new Date(input.arrivalDate) : null
  if (input.arrivalDate && Number.isNaN(arrivalDate?.getTime())) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Invalid expected travel date.' }
  }

  // Security review (MEDIUM): VisaApplication has no conversationId column,
  // so a double-click/retry race can't be closed by querying it directly —
  // two concurrent calls can both read ctx.application === null before
  // either write commits. Narrow the window by re-checking the link table
  // itself for a case created for THIS conversation in the last few
  // seconds (mirrors the 10s duplicate-draft guard added for Create Quote).
  const recentLink = await prisma.conversationClientLink.findFirst({
    where: {
      chatwootConversationId: input.conversationId,
      visaApplicationId: { not: null },
      createdAt: { gte: new Date(Date.now() - 10_000) },
    },
    orderBy: { createdAt: 'desc' },
    select: { visaApplicationId: true },
  }).catch(() => null)
  if (recentLink?.visaApplicationId) {
    return { ok: false, code: 'CASE_ALREADY_EXISTS', error: 'A visa case was just created for this conversation.' }
  }

  // Server-derived contact only — never a browser-typed name/email for the
  // case record (the identity was already established earlier in this
  // conversation's lifecycle, by verification or Find/Create client).
  const nameParts = ctx.contact!.name!.trim().split(/\s+/)
  let referenceNumber = generateVisaRef()
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.visaApplication.findUnique({ where: { referenceNumber }, select: { id: true } })
    if (!clash) break
    referenceNumber = generateVisaRef()
  }

  let app: { id: string; referenceNumber: string; visaType: string; destinationIso2: string; status: string }
  try {
    app = await prisma.visaApplication.create({
      data: {
        referenceNumber, destinationIso2, visaType,
        firstName: nameParts[0] ?? null,
        lastName: nameParts.slice(1).join(' ') || null,
        email: ctx.contact!.email, phone: ctx.contact!.phone ?? null,
        purposeOfVisit: input.purposeOfVisit?.trim() || null,
        arrivalDate,
        status: 'draft', isDraft: true, initiatedBy: 'admin', source: 'admin',
        userId: ctx.user?.id ?? null, clientAccountId: ctx.clientAccount?.id ?? null,
      },
      select: { id: true, referenceNumber: true, visaType: true, destinationIso2: true, status: true },
    })
  } catch (e) {
    console.error('[action-centre] visa case creation failed:', (e as Error).message)
    return { ok: false, code: 'PERSIST_FAILED', error: 'Could not create the visa case. Retry.' }
  }

  // Extend the SAME conversation link with the new case — preserving the
  // already-established userId/clientAccountId/prismaLeadId (upsert with a
  // different visaApplicationId is a different "target", so client-link.ts
  // correctly deactivates the old row and appends a new one, append-only).
  const upsert = await upsertConversationClientLink({
    chatwootConversationId: input.conversationId,
    linkMethod: 'admin_manual',
    linkedBy: input.session.email,
    visaApplicationId: app.id,
    userId: ctx.user?.id ?? null,
    clientAccountId: ctx.clientAccount?.id ?? null,
    prismaLeadId: ctx.prismaLead?.id ?? null,
    clientReference: ctx.link?.clientReference ?? null,
  })
  if (!upsert.ok) {
    console.warn('[action-centre] visa case created but link update failed:', upsert.error)
    // Non-fatal: the case exists and is findable; report success — staff can
    // still act on it via Send/Resend Form, which re-resolves fresh anyway.
  }

  console.log(`[action-centre] VISA_CASE_CREATED ref=${referenceNumber} conv=${input.conversationId} by=${input.session.email}`)
  return { ok: true, data: toCaseDTO(app) }
}

// ── Mint (or re-mint) a secure client-facing form link ──────────────────────

export interface MintVisaFormLinkInput {
  session: AdminSession; conversationId: number
  /** Must equal the server-resolved application id when supplied. */
  applicationId?: string | null
}

export async function mintVisaFormLink(input: MintVisaFormLinkInput): Promise<VisaActionResult<VisaFormLinkDTO>> {
  const identity = await requireLinkedIdentity(input.conversationId, input.session)
  if (!identity.ok) return identity
  const { ctx } = identity

  if (!ctx.application) {
    return { ok: false, code: 'NO_CASE_LINKED', error: 'Create a visa case for this client first.' }
  }
  if (input.applicationId && input.applicationId !== ctx.application.id) {
    return { ok: false, code: 'CLIENT_CONTEXT_MISMATCH', error: 'This application does not match the conversation’s linked client.' }
  }

  const app = await prisma.visaApplication.findUnique({
    where: { id: ctx.application.id }, select: { id: true, destinationIso2: true },
  })
  if (!app) return { ok: false, code: 'NO_CASE_LINKED', error: 'The linked visa case could not be found.' }

  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  let tokenRow: { token: string }
  try {
    tokenRow = await prisma.visaApplicationToken.create({
      data: {
        applicationId: app.id,
        clientEmail: ctx.contact!.email!, clientName: ctx.contact!.name!,
        expiresAt, conversationId: input.conversationId, source: 'inbox_action_centre',
      },
      select: { token: true },
    })
  } catch (e) {
    console.error('[action-centre] visa token mint failed:', (e as Error).message)
    return { ok: false, code: 'PERSIST_FAILED', error: 'Could not generate the form link. Retry.' }
  }

  const slug = ISO2_TO_SLUG[app.destinationIso2] ?? app.destinationIso2.toLowerCase()
  const link = `${SITE}/visa/apply/${slug}?token=${tokenRow.token}&draft=${app.id}`
  console.log(`[action-centre] VISA_FORM_LINK_GENERATED ref=${ctx.application.walzRef} conv=${input.conversationId} by=${input.session.email}`)
  return { ok: true, data: { token: tokenRow.token, link, expiresAt: expiresAt.toISOString() } }
}

// ── Request documents ────────────────────────────────────────────────────────

export interface RequestDocumentsInput {
  session: AdminSession; conversationId: number
  applicationId?: string | null
  requestedDocs: string[]; message?: string | null
}

export async function requestDocuments(input: RequestDocumentsInput): Promise<VisaActionResult<DocumentRequestDTO>> {
  const identity = await requireLinkedIdentity(input.conversationId, input.session)
  if (!identity.ok) return identity
  const { ctx } = identity

  if (!ctx.application) {
    return { ok: false, code: 'NO_CASE_LINKED', error: 'Create a visa case for this client first.' }
  }
  if (input.applicationId && input.applicationId !== ctx.application.id) {
    return { ok: false, code: 'CLIENT_CONTEXT_MISMATCH', error: 'This application does not match the conversation’s linked client.' }
  }
  const docNames = (input.requestedDocs ?? []).map(d => String(d).trim()).filter(Boolean)
  if (docNames.length === 0) {
    return { ok: false, code: 'INVALID_INPUT', error: 'List at least one document to request.' }
  }
  // Security review HIGH: app/upload/[token]/page.tsx and the admin case
  // detail page both require requestedDocs as an array of {name, required,
  // ...} objects, JSON-stringified — the same contract already used by
  // app/api/admin/document-requests/route.ts. A plain string[] here would
  // leave every document upload attempt 400ing on a missing docName.
  const requestedDocObjects = docNames.map(name => ({ name, required: true }))

  const expiresAt = new Date(Date.now() + DOC_REQUEST_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  let row: { id: string; token: string }
  try {
    row = await prisma.documentRequest.create({
      data: {
        applicationId: ctx.application.id,
        clientEmail: ctx.contact!.email!, clientName: ctx.contact!.name!,
        requestedBy: input.session.email,
        requestedDocs: JSON.stringify(requestedDocObjects),
        totalRequired: requestedDocObjects.length,
        message: input.message?.trim() || null,
        expiresAt, conversationId: input.conversationId, source: 'inbox_action_centre',
      },
      select: { id: true, token: true },
    })
  } catch (e) {
    console.error('[action-centre] document request creation failed:', (e as Error).message)
    return { ok: false, code: 'PERSIST_FAILED', error: 'Could not create the document request. Retry.' }
  }

  console.log(`[action-centre] VISA_DOCUMENT_REQUEST_CREATED ref=${ctx.application.walzRef} conv=${input.conversationId} by=${input.session.email}`)
  return {
    ok: true,
    data: { id: row.id, token: row.token, uploadLink: `${SITE}/upload/${row.token}`, expiresAt: expiresAt.toISOString(), requestedDocs: docNames },
  }
}

// ── Recent visa actions for a conversation (Client 360 list) ────────────────

export interface RecentVisaActionDTO {
  kind: 'form_link' | 'document_request'
  id: string; createdAt: string; expiresAt: string
  used?: boolean; status?: string
}

export async function listRecentVisaActions(conversationId: number): Promise<RecentVisaActionDTO[]> {
  try {
    const [tokens, docRequests] = await Promise.all([
      prisma.visaApplicationToken.findMany({
        where: { conversationId }, orderBy: { createdAt: 'desc' }, take: 10,
        select: { id: true, used: true, expiresAt: true, createdAt: true },
      }),
      prisma.documentRequest.findMany({
        where: { conversationId }, orderBy: { createdAt: 'desc' }, take: 10,
        select: { id: true, status: true, expiresAt: true, createdAt: true },
      }),
    ])
    return [
      ...tokens.map(t => ({
        kind: 'form_link' as const, id: t.id, createdAt: t.createdAt.toISOString(),
        expiresAt: t.expiresAt.toISOString(), used: t.used,
      })),
      ...docRequests.map(d => ({
        kind: 'document_request' as const, id: d.id, createdAt: d.createdAt.toISOString(),
        expiresAt: d.expiresAt.toISOString(), status: d.status,
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10)
  } catch (e) {
    console.warn('[action-centre] listRecentVisaActions failed:', (e as Error).message)
    return []
  }
}

