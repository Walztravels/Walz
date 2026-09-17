import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { adminChatwootOrNull } from '@/lib/chatwoot/config'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { validateResolveStatus, mapChatwootFailure, safeJson } from '@/lib/inbox/provider'

export const dynamic = 'force-dynamic'

// Fail closed (INBOX-0S.1): no non-null assertion on the token — when no
// Chatwoot token is configured every handler returns a controlled 503.
const cwCfg = adminChatwootOrNull()
const CW_BASE    = cwCfg?.base ?? ''
const CW_TOKEN   = cwCfg?.token ?? ''
const CW_ACCOUNT = cwCfg?.accountId ?? '1'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!cwCfg) return NextResponse.json({ error: 'Messaging service is not configured.' }, { status: 503 })
  const authz = checkInboxPermission(session, 'inbox_reply')
  if (!authz.allowed) return NextResponse.json({ error: authz.error }, { status: authz.status })
  const access = await checkConversationAccess(session, params.id)
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = await req.json().catch(() => ({})) as { status?: unknown }
  // Allow-list (INBOX-0S.3): only 'open' | 'resolved'. 'pending' (Jade
  // takeover) and 'snoozed' are lifecycle states this endpoint must not set.
  const sv = validateResolveStatus(body.status)
  if (!sv.ok) return NextResponse.json({ error: sv.error }, { status: 400 })
  const status = sv.status

  const res = await fetch(
    `${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations/${params.id}/toggle_status`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', api_access_token: CW_TOKEN },
      body:    JSON.stringify({ status }),
    }
  ).catch(() => null)
  if (!res) return NextResponse.json({ error: 'Status change failed — messaging service unreachable. Please try again.' }, { status: 502 })
  const data = await safeJson(res)
  if (!res.ok) {
    console.error('[resolve] Chatwoot error:', res.status, JSON.stringify(data)?.slice(0, 300))
    const mapped = mapChatwootFailure(res.status, 'Status change')
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }
  return NextResponse.json(data ?? { ok: true })
}
