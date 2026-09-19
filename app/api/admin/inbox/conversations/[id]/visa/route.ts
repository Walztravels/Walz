import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { listRecentVisaActions, createVisaCase, mintVisaFormLink, requestDocuments } from '@/lib/action-centre/visa-form'

export const dynamic = 'force-dynamic'

/**
 * Visa Form (INBOX UX-4.3 — Client Action Centre).
 *
 * GET  — recent visa actions for this conversation (safe DTO only).
 * POST — one action-mutation endpoint, discriminated by `action`
 *        (mirrors client-context's `mode` field): 'create_case' |
 *        'mint_link' | 'request_documents'. All three re-resolve identity
 *        fresh and require VERIFIED/LINKED before touching the database —
 *        see lib/action-centre/visa-form.ts for the full contract. None
 *        of them ever sends a message or email; the drawer shares the
 *        result through the existing composer send path.
 */

function parseConversationId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

async function gate(params: { id: string }) {
  const session = await getAdminSession()
  if (!session) return { fail: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const
  const authz = checkInboxPermission(session, 'inbox_view')
  if (!authz.allowed) return { fail: NextResponse.json({ error: authz.error }, { status: authz.status }) } as const
  const convId = parseConversationId(params.id)
  if (!convId) return { fail: NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 }) } as const
  const access = await checkConversationAccess(session, params.id)
  if (!access.allowed) return { fail: NextResponse.json({ error: access.error }, { status: access.status }) } as const
  return { session, convId } as const
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await gate(params)
  if ('fail' in g) return g.fail
  const actions = await listRecentVisaActions(g.convId)
  return NextResponse.json({ actions })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate(params)
  if ('fail' in g) return g.fail
  const { session, convId } = g

  // Commercial-adjacent identity mutations — same bar as manual client
  // linking (UX-4.1A/C): stronger than plain inbox_view.
  const assignAuthz = checkInboxPermission(session, 'inbox_assign')
  if (!assignAuthz.allowed) {
    return NextResponse.json({ error: assignAuthz.error }, { status: assignAuthz.status })
  }

  const rl = rateLimit({ key: `visa-form:${session.email}`, limit: 20, windowMs: 5 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many visa form actions — try again shortly.' }, { status: 429 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated per-action below */ }
  const action = typeof body.action === 'string' ? body.action : null

  let result:
    | Awaited<ReturnType<typeof createVisaCase>>
    | Awaited<ReturnType<typeof mintVisaFormLink>>
    | Awaited<ReturnType<typeof requestDocuments>>

  if (action === 'create_case') {
    result = await createVisaCase({
      session, conversationId: convId,
      destinationIso2: typeof body.destinationIso2 === 'string' ? body.destinationIso2 : '',
      visaType: typeof body.visaType === 'string' ? body.visaType : 'tourist',
      purposeOfVisit: typeof body.purposeOfVisit === 'string' ? body.purposeOfVisit : null,
      arrivalDate: typeof body.arrivalDate === 'string' ? body.arrivalDate : null,
    })
  } else if (action === 'mint_link') {
    result = await mintVisaFormLink({
      session, conversationId: convId,
      applicationId: typeof body.applicationId === 'string' ? body.applicationId : null,
    })
  } else if (action === 'request_documents') {
    result = await requestDocuments({
      session, conversationId: convId,
      applicationId: typeof body.applicationId === 'string' ? body.applicationId : null,
      requestedDocs: Array.isArray(body.requestedDocs) ? body.requestedDocs.map(String) : [],
      message: typeof body.message === 'string' ? body.message : null,
    })
  } else {
    return NextResponse.json({ error: "action must be 'create_case', 'mint_link', or 'request_documents'" }, { status: 400 })
  }

  if (!result.ok) {
    const status =
      result.code === 'CLIENT_IDENTITY_REQUIRED' || result.code === 'CLIENT_CONTEXT_MISMATCH' ? 403
      : result.code === 'CASE_ALREADY_EXISTS' || result.code === 'AMBIGUOUS_APPLICATION' ? 409
      : result.code === 'PERSIST_FAILED' ? 502
      : 400
    return NextResponse.json({ error: result.error, code: result.code }, { status })
  }
  return NextResponse.json({ result: result.data })
}
