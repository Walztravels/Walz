import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { adminChatwootOrNull } from '@/lib/chatwoot/config'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { mapChatwootFailure, safeJson } from '@/lib/inbox/provider'

export const dynamic = 'force-dynamic'

// Fail closed (INBOX-0S.1): no non-null assertion on the token — when no
// Chatwoot token is configured every handler returns a controlled 503.
const cwCfg = adminChatwootOrNull()
const CW_BASE    = cwCfg?.base ?? ''
const CW_TOKEN   = cwCfg?.token ?? ''
const CW_ACCOUNT = cwCfg?.accountId ?? '1'

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!cwCfg) return NextResponse.json({ error: 'Messaging service is not configured.' }, { status: 503 })
  const authz = checkInboxPermission(session, 'inbox_view')
  if (!authz.allowed) return NextResponse.json({ error: authz.error }, { status: authz.status })
  const access = await checkConversationAccess(session, params.id)
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status })

  // Cursor pagination (conversation-history fix): `before` is the oldest
  // loaded Chatwoot message id — Chatwoot returns the previous page of
  // messages before it. Without it, only the latest page is returned,
  // which is the initial load.
  const before = new URL(req.url).searchParams.get('before')
  const qs = before && /^\d+$/.test(before) ? `?before=${before}` : ''

  const res  = await fetch(
    `${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations/${params.id}/messages${qs}`,
    { headers: { api_access_token: CW_TOKEN } }
  ).catch(() => null)
  // A failure must surface as an error, never as an empty conversation.
  if (!res) return NextResponse.json({ error: 'Could not load messages. Please try again.' }, { status: 502 })
  const data = await safeJson(res) as { data?: unknown } | null
  if (!res.ok || data === null) {
    console.error('[messages] Chatwoot error:', res.status, JSON.stringify(data)?.slice(0, 300))
    const mapped = mapChatwootFailure(res.status, 'Loading messages')
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }
  // Normalise: some Chatwoot versions wrap in { data: { payload } }, others use { payload }
  return NextResponse.json(data?.data ?? data)
}
