import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { createPaymentRequest, listPaymentRequests } from '@/lib/action-centre/payment-request'

export const dynamic = 'force-dynamic'

/**
 * Request Payment (INBOX UX-4.1B — Client Action Centre).
 *
 * POST — create a payment request for THIS conversation's server-resolved
 *        client. Auth: getAdminSession → inbox_view → checkConversationAccess
 *        → payments_create (same gate as the admin payment-links routes)
 *        → rate limit → service. The service re-resolves identity and
 *        enforces the hard invariant (VERIFIED/LINKED only) — the browser
 *        never names the client, and a supplied related application id is
 *        only accepted if it EQUALS the server-resolved one.
 * GET  — the conversation's recent payment requests (safe DTO only).
 *
 * Nothing in this route can mark a request paid — settlement belongs to
 * the existing verified provider webhooks / server-side verify route.
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
  const requests = await listPaymentRequests(g.convId)
  return NextResponse.json({ requests })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate(params)
  if ('fail' in g) return g.fail
  const { session, convId } = g

  // Commercial permission — byte-for-byte the admin payment-links gate.
  if (!session.permissions?.payments_create && session.role !== 'super_admin') {
    return NextResponse.json(
      { error: 'Permission denied — payments_create required', required: 'payments_create' },
      { status: 403 },
    )
  }

  const rl = rateLimit({ key: `payment-request:${session.email}`, limit: 15, windowMs: 5 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many payment requests — try again shortly.' }, { status: 429 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* validated below */ }

  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : ''
  if (!idempotencyKey || idempotencyKey.length > 128) {
    return NextResponse.json({ error: 'idempotencyKey required' }, { status: 400 })
  }

  const result = await createPaymentRequest({
    session,
    conversationId: convId,
    amountMajor: typeof body.amount === 'number' ? body.amount : NaN,
    currency: typeof body.currency === 'string' ? body.currency : '',
    purpose: typeof body.purpose === 'string' ? body.purpose : '',
    provider: typeof body.provider === 'string' ? body.provider : '',
    description: typeof body.description === 'string' ? body.description : null,
    relatedApplicationId: typeof body.relatedApplicationId === 'string' ? body.relatedApplicationId : null,
    internalNote: typeof body.internalNote === 'string' ? body.internalNote : null,
    idempotencyKey,
    allowDuplicate: body.allowDuplicate === true,
    stripeCardType: body.stripeCardType === 'non_eu' ? 'non_eu' : 'eu',
  })

  if (!result.ok) {
    const status =
      result.code === 'CLIENT_IDENTITY_REQUIRED' || result.code === 'CLIENT_CONTEXT_MISMATCH' ? 403
      : result.code === 'DUPLICATE_PENDING' || result.code === 'IDEMPOTENCY_CONFLICT' ? 409
      : result.code === 'PROVIDER_UNAVAILABLE' || result.code === 'PROVIDER_NOT_CONFIGURED'
        || result.code === 'PERSIST_FAILED' ? 502
      : 400
    return NextResponse.json(
      {
        error: result.error, code: result.code,
        ...(result.existing ? { existing: result.existing } : {}),
        ...(result.missingFields ? { missingFields: result.missingFields, availableFields: result.availableFields } : {}),
        ...(result.crossRecordConflicts && result.crossRecordConflicts.length > 0
          ? { crossRecordConflicts: result.crossRecordConflicts } : {}),
      },
      { status },
    )
  }
  return NextResponse.json({ request: result.request, deduplicated: result.deduplicated })
}
