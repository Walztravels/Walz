import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { adminChatwootOrNull } from '@/lib/chatwoot/config'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'

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
  })
  const data = await res.json()
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
    return NextResponse.json({ error: body?.message ?? `Chatwoot error (${res.status})` }, { status: res.status })
  }

  return NextResponse.json({ success: true })
}
