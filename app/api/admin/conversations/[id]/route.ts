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
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!cwCfg) return NextResponse.json({ error: 'Messaging service is not configured.' }, { status: 503 })
  const authz = checkInboxPermission(session, 'inbox_view')
  if (!authz.allowed) return NextResponse.json({ error: authz.error }, { status: authz.status })
  const access = await checkConversationAccess(session, params.id)
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status })

  const res  = await fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations/${params.id}`, {
    headers: { api_access_token: CW_TOKEN },
  }).catch(() => null)
  if (!res) return NextResponse.json({ error: 'Could not load the conversation. Please try again.' }, { status: 502 })
  const data = await safeJson(res)
  if (!res.ok || data === null) {
    console.error('[conversation] Chatwoot error:', res.status, JSON.stringify(data)?.slice(0, 300))
    const mapped = mapChatwootFailure(res.status, 'Loading the conversation')
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }
  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!cwCfg) return NextResponse.json({ error: 'Messaging service is not configured.' }, { status: 503 })
  const del = checkInboxPermission(session, 'inbox_delete')
  if (!del.allowed) {
    return NextResponse.json({ error: 'Only staff with the delete-messages permission can delete conversations' }, { status: 403 })
  }

  const res = await fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations/${params.id}`, {
    method:  'DELETE',
    headers: { api_access_token: CW_TOKEN },
  })

  if (res.status === 404) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    // Log the upstream detail; the browser gets a controlled message.
    console.error('[conversation delete] Chatwoot error:', res.status, JSON.stringify(body)?.slice(0, 300))
    return NextResponse.json({ error: 'Delete failed — messaging service error. Please try again.' }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
