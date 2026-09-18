import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { upsertConversationClientLink, type ConversationLinkMethod } from '@/lib/inbox/client-link'
import {
  findCredibleDuplicate, resolveExistingReference, generateClientReference,
  deriveChannelIdentity, type ClientCandidateType,
} from '@/lib/inbox/client-identity'
import { createLeadRaceSafe } from '@/lib/leads/identity'
import { normalizeEmail, normalizePhoneE164, isPsidLike } from '@/lib/identity/normalize'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Client Action Centre context (UX-4.1A).
 *
 * GET  — resolve the conversation's client context (server-authoritative).
 * POST — explicit admin link. The server RE-VERIFIES everything: when a
 *        verificationId is supplied, the application id is derived from the
 *        verification row — a browser-supplied application id is IGNORED.
 *
 *        UX-4.1C adds two additional `mode`d requests on the SAME endpoint
 *        (one identity-mutation surface, not a second one):
 *          - mode:'link_existing' — bind an EXISTING User/ClientAccount/
 *            Lead/VisaApplication/Booking (found via the sibling
 *            /client-search route) to this conversation. The server
 *            re-verifies the target exists; nothing about WHICH client
 *            gets linked is trusted beyond that existence check.
 *          - mode:'create_new' — create a brand-new Lead for a first-time
 *            customer and link it. Server-side duplicate detection runs
 *            first (never trust the browser's "I already checked");
 *            the record's CHANNEL identifiers (source/sourceId) are
 *            derived from the conversation's own Chatwoot contact, never
 *            from the staff-typed form — only the descriptive CRM fields
 *            (name/email/phone as informational contact data) come from
 *            the form, because there is no other source for a brand-new
 *            person's details.
 *        Both new modes require inbox_assign (assignment-class acts, same
 *        bar as the existing admin_manual verificationId-less path).
 *
 * Auth pattern mirrors app/api/admin/conversations/[id]/route.ts exactly:
 * getAdminSession → checkInboxPermission('inbox_view') →
 * checkConversationAccess. 401/403 fail closed BEFORE any resolution.
 * The response is the context DTO only — never raw Supabase service rows.
 */

function parseConversationId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const authz = checkInboxPermission(session, 'inbox_view')
  if (!authz.allowed) return NextResponse.json({ error: authz.error }, { status: authz.status })
  const convId = parseConversationId(params.id)
  if (!convId) return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
  const access = await checkConversationAccess(session, params.id)
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status })

  // Resolution runs only after the auth gates above (the resolver re-checks
  // them internally as defense in depth — both checks are cached).
  const result = await resolveClientActionContext(convId, session)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ context: result.context })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const authz = checkInboxPermission(session, 'inbox_view')
  if (!authz.allowed) return NextResponse.json({ error: authz.error }, { status: authz.status })
  const convId = parseConversationId(params.id)
  if (!convId) return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
  const access = await checkConversationAccess(session, params.id)
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status })

  // Link writes are rate limited like the sibling lookup route.
  const rl = rateLimit({ key: `client-link:${session.email}`, limit: 20, windowMs: 5 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many link changes — try again shortly.' }, { status: 429 })
  }

  let rawBody: Record<string, unknown> = {}
  try { rawBody = await req.json() } catch { /* handled below */ }
  const mode = typeof rawBody.mode === 'string' ? rawBody.mode : null

  // ── UX-4.1C: mode:'link_existing' / mode:'create_new' ──────────────────────
  // Fully separate branches that return early — the legacy (no `mode`)
  // verificationId/visaApplicationId path below is completely untouched.
  if (mode === 'link_existing' || mode === 'create_new') {
    const assignAuthz = checkInboxPermission(session, 'inbox_assign')
    if (!assignAuthz.allowed) {
      return NextResponse.json({ error: assignAuthz.error }, { status: assignAuthz.status })
    }

    if (mode === 'link_existing') {
      const targetType = rawBody.targetType as ClientCandidateType | undefined
      const targetId = typeof rawBody.targetId === 'string' ? rawBody.targetId : null
      const VALID_TYPES: ClientCandidateType[] = ['user', 'clientAccount', 'lead', 'application', 'booking']
      if (!targetType || !VALID_TYPES.includes(targetType) || !targetId) {
        return NextResponse.json({ error: 'targetType and targetId required' }, { status: 400 })
      }

      // Server RE-VERIFIES the target exists — a browser can name a type
      // and an id, but never anything beyond that; 'booking' resolves to
      // its owning user, since a Booking itself isn't a link FK target.
      let linkType: ClientCandidateType = targetType
      let linkId = targetId
      if (targetType === 'booking') {
        const booking = await prisma.booking.findUnique({ where: { id: targetId }, select: { userId: true } })
        if (!booking?.userId) {
          return NextResponse.json({ error: 'This booking has no linkable client.' }, { status: 404 })
        }
        linkType = 'user'
        linkId = booking.userId
      } else {
        const exists = await (
          linkType === 'user' ? prisma.user.findUnique({ where: { id: linkId }, select: { id: true } })
          : linkType === 'clientAccount' ? prisma.clientAccount.findUnique({ where: { id: linkId }, select: { id: true } })
          : linkType === 'lead' ? prisma.lead.findUnique({ where: { id: linkId }, select: { id: true } })
          : prisma.visaApplication.findUnique({ where: { id: linkId }, select: { id: true } })
        )
        if (!exists) return NextResponse.json({ error: 'Client record not found' }, { status: 404 })
      }

      const clientReference = await resolveExistingReference(linkType, linkId) ?? generateClientReference()
      const upsert = await upsertConversationClientLink({
        chatwootConversationId: convId,
        linkMethod: 'admin_manual',
        linkedBy:   session.email,
        clientReference,
        ...(linkType === 'application' ? { visaApplicationId: linkId }
          : linkType === 'user' ? { userId: linkId }
          : linkType === 'clientAccount' ? { clientAccountId: linkId }
          : { prismaLeadId: linkId }),
      })
      if (!upsert.ok) {
        return NextResponse.json({ error: 'Could not save the client link. Please try again.' }, { status: 500 })
      }
      const result = await resolveClientActionContext(convId, session)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json({ context: result.context })
    }

    // mode === 'create_new'
    const firstName = typeof rawBody.firstName === 'string' ? rawBody.firstName.trim() : ''
    const lastName  = typeof rawBody.lastName  === 'string' ? rawBody.lastName.trim()  : ''
    const rawEmail  = typeof rawBody.email === 'string' ? rawBody.email.trim() : ''
    const rawPhone  = typeof rawBody.phone === 'string' ? rawBody.phone.trim() : ''
    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'First and last name are required.', code: 'INVALID_INPUT' }, { status: 400 })
    }
    if (!rawEmail && !rawPhone) {
      return NextResponse.json({ error: 'An email or phone number is required.', code: 'INVALID_INPUT' }, { status: 400 })
    }
    const normalizedEmail = normalizeEmail(rawEmail)
    const normalizedPhone = rawPhone && !isPsidLike(rawPhone) ? normalizePhoneE164(rawPhone) : null

    // Duplicate protection — ALWAYS re-checked server-side; a client-typed
    // "no duplicates" claim (there isn't one, but hypothetically) would
    // never be trusted anyway. Ambiguous or found → do not create.
    const dup = await findCredibleDuplicate({ email: normalizedEmail, phone: normalizedPhone })
    if (dup.status !== 'none') {
      return NextResponse.json(
        {
          error: dup.status === 'ambiguous'
            ? 'Multiple existing records could match this customer — resolve manually.'
            : 'An existing record matches this customer — link it instead of creating a new one.',
          code: dup.status === 'ambiguous' ? 'DUPLICATE_AMBIGUOUS' : 'DUPLICATE_FOUND',
          ...(dup.status === 'found' ? { candidate: dup.candidate } : { candidates: dup.candidates }),
        },
        { status: 409 },
      )
    }

    // Channel identifiers derived SERVER-SIDE from the conversation's own
    // Chatwoot contact — never from the staff-typed form (identity mandate).
    const channel = await deriveChannelIdentity(convId)
    const clientReference = generateClientReference()

    // Security review M2: Lead.whatsapp is a de-facto identity key elsewhere
    // in the codebase (Jade's saveLead resolves/updates leads by exact
    // whatsapp match; lead import/reconcile dedupe by it too) — it is NOT
    // purely descriptive, so it must stay SERVER-DERIVED only. A staff-typed
    // phone that happens to belong to someone else would otherwise merge
    // that unrelated person's future messages into this Lead. The staff-
    // typed number (when it differs) is preserved as freeform text instead.
    const staffTypedPhoneNote =
      normalizedPhone && normalizedPhone !== channel.whatsapp
        ? `Client-provided contact phone: ${normalizedPhone}`
        : null

    let leadId: string
    try {
      const lead = await createLeadRaceSafe(prisma, 'inbox_action_centre', channel.sourceId, {
        name: `${firstName} ${lastName}`.trim(),
        email: normalizedEmail,
        whatsapp: channel.whatsapp,
        details: staffTypedPhoneNote,
        service: 'Other',
        source: 'inbox_action_centre',
      })
      leadId = lead.id
    } catch (e) {
      console.warn('[client-identity] lead creation failed:', (e as Error).message)
      return NextResponse.json({ error: 'Could not create the client record. Please try again.', code: 'PERSIST_FAILED' }, { status: 500 })
    }

    const upsert = await upsertConversationClientLink({
      chatwootConversationId: convId,
      linkMethod: 'admin_manual',
      linkedBy:   session.email,
      prismaLeadId: leadId,
      clientReference,
    })
    if (!upsert.ok) {
      return NextResponse.json({ error: 'Client was created but could not be linked. Please try again.', code: 'PERSIST_FAILED' }, { status: 500 })
    }
    const result = await resolveClientActionContext(convId, session)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ context: result.context })
  }

  // ── Legacy path (no `mode`): verificationId / admin_manual visaApplicationId ──
  const body = rawBody as { visaApplicationId?: unknown; verificationId?: unknown }
  const verificationId = typeof body?.verificationId === 'string' ? body.verificationId : null
  const bodyApplicationId = typeof body?.visaApplicationId === 'string' ? body.visaApplicationId : null

  let visaApplicationId: string
  let linkMethod: ConversationLinkMethod

  if (verificationId) {
    // Server-side RE-VERIFICATION (never trust the browser): the
    // verification must be this staff member's, for THIS conversation,
    // status verified and unexpired — and the application id comes from
    // the verification row, not from the request body.
    const v = await prisma.applicationVerification.findUnique({
      where:  { id: verificationId },
      select: {
        applicationId: true, channel: true, staffEmail: true,
        conversationId: true, method: true, status: true, verifiedUntil: true,
      },
    })
    if (!v) return NextResponse.json({ error: 'Verification not found' }, { status: 404 })
    if (v.status !== 'verified' || !v.verifiedUntil) {
      return NextResponse.json({ error: 'NOT_VERIFIED' }, { status: 403 })
    }
    if (v.verifiedUntil.getTime() < Date.now()) {
      return NextResponse.json({ error: 'VERIFICATION_EXPIRED' }, { status: 403 })
    }
    if (v.channel !== 'STAFF_SUPPORT' || (v.staffEmail ?? '').toLowerCase() !== session.email.toLowerCase()) {
      return NextResponse.json({ error: 'This verification belongs to another session.' }, { status: 403 })
    }
    if (v.conversationId !== String(convId)) {
      return NextResponse.json({ error: 'Verification is bound to a different conversation.' }, { status: 403 })
    }
    visaApplicationId = v.applicationId   // derived server-side; body id ignored
    linkMethod = v.method === 'FALLBACK' ? 'fallback_verified' : 'otp_verified'
  } else {
    // Explicit manual link WITHOUT client verification — an assignment-class
    // act, so it requires the stronger inbox_assign permission (security
    // review M1). Verified links above stay at inbox_view: the staff member
    // just completed the client's own OTP/fallback verification.
    const assignAuthz = checkInboxPermission(session, 'inbox_assign')
    if (!assignAuthz.allowed) {
      return NextResponse.json({ error: assignAuthz.error }, { status: assignAuthz.status })
    }
    if (!bodyApplicationId) {
      return NextResponse.json({ error: 'visaApplicationId or verificationId required' }, { status: 400 })
    }
    const app = await prisma.visaApplication.findUnique({
      where: { id: bodyApplicationId }, select: { id: true },
    })
    if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    visaApplicationId = app.id
    linkMethod = 'admin_manual'
  }

  const upsert = await upsertConversationClientLink({
    chatwootConversationId: convId,
    linkMethod,
    linkedBy:       session.email,
    verificationId: verificationId ?? null,
    visaApplicationId,
  })
  if (!upsert.ok) {
    return NextResponse.json({ error: 'Could not save the client link. Please try again.' }, { status: 500 })
  }

  const result = await resolveClientActionContext(convId, session)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ context: result.context })
}
