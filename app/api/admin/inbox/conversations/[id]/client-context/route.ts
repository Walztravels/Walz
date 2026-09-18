import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { upsertConversationClientLink, type ConversationLinkMethod } from '@/lib/inbox/client-link'
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

  let body: { visaApplicationId?: unknown; verificationId?: unknown } | null = null
  try { body = await req.json() } catch { /* handled below */ }
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
