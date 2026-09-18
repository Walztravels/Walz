import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { searchExistingClients } from '@/lib/inbox/client-identity'

export const dynamic = 'force-dynamic'

/**
 * "Find existing client" search (INBOX UX-4.1C).
 *
 * EXPLICIT staff search — never an automatic resolution. Staff types a
 * query and reviews the returned candidates; the caller must still POST
 * an explicit link_existing/{targetType,targetId} to /client-context to
 * bind one of them to this conversation (see that route's mode handling).
 * This endpoint only ever returns candidates; it links nothing itself.
 */
function parseConversationId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const authz = checkInboxPermission(session, 'inbox_view')
  if (!authz.allowed) return NextResponse.json({ error: authz.error }, { status: authz.status })
  const convId = parseConversationId(params.id)
  if (!convId) return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
  const access = await checkConversationAccess(session, params.id)
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status })

  const rl = rateLimit({ key: `client-search:${session.email}`, limit: 30, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many searches — try again shortly.' }, { status: 429 })
  }

  const q = req.nextUrl.searchParams.get('q') ?? ''
  try {
    const candidates = await searchExistingClients(q)
    return NextResponse.json({ candidates })
  } catch (e) {
    console.warn('[client-identity] search failed:', (e as Error).message)
    return NextResponse.json({ candidates: [] })
  }
}
