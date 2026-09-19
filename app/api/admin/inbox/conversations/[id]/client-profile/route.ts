import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { updateClientProfile } from '@/lib/action-centre/client-profile'

export const dynamic = 'force-dynamic'

/**
 * Complete Client Profile (Client Action Centre — shared layer).
 *
 * POST — fill in ONLY missing name/email/phone on the conversation's
 *        server-resolved, already-linked client (User/ClientAccount/Lead —
 *        whichever lib/inbox/client-profile.ts's canonical resolution
 *        names). Shared by Request Payment, Create Quote, and Visa Form's
 *        "Complete client profile" gate.
 *
 * Auth: getAdminSession → inbox_view → checkConversationAccess →
 *       inbox_assign (same bar as every other identity-adjacent mutation
 *       in this layer: manual client linking in the client-context route,
 *       and Visa Form's own POST — see those routes) → rate limit.
 *
 * conversationId comes ONLY from the URL path. The body accepts ONLY
 * {name?, email?, phone?} — no id field of any kind, by contract: identity
 * is entirely server-resolved from the conversation, never client-supplied.
 */

function parseConversationId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const authz = checkInboxPermission(session, 'inbox_view')
  if (!authz.allowed) return NextResponse.json({ error: authz.error }, { status: authz.status })
  const convId = parseConversationId(params.id)
  if (!convId) return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
  const access = await checkConversationAccess(session, params.id)
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status })

  // Commercial-adjacent identity mutation — same bar as manual client
  // linking (UX-4.1A/C) and Visa Form's own POST: stronger than plain
  // inbox_view, because this writes into a CRM record.
  const assignAuthz = checkInboxPermission(session, 'inbox_assign')
  if (!assignAuthz.allowed) {
    return NextResponse.json({ error: assignAuthz.error }, { status: assignAuthz.status })
  }

  const rl = rateLimit({ key: `client-profile:${session.email}`, limit: 20, windowMs: 5 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many profile updates — try again shortly.' }, { status: 429 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }

  // Only these three fields are ever read from the body — no id of any kind.
  const name  = typeof body.name === 'string' ? body.name : undefined
  const email = typeof body.email === 'string' ? body.email : undefined
  const phone = typeof body.phone === 'string' ? body.phone : undefined

  const result = await updateClientProfile({ session, conversationId: convId, name, email, phone })

  if (!result.ok) {
    const status =
      result.code === 'CLIENT_IDENTITY_REQUIRED' ? 403
      : result.code === 'CONTACT_CONFLICT' ? 409
      : result.code === 'NO_LINKED_RECORD' ? 409
      : result.code === 'PERSIST_FAILED' ? 500
      : 400
    return NextResponse.json(
      { error: result.error, code: result.code, ...(result.conflicts ? { conflicts: result.conflicts } : {}) },
      { status },
    )
  }
  return NextResponse.json({ fields: result.fields })
}
