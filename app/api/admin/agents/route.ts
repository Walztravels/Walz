import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { adminChatwootOrNull } from '@/lib/chatwoot/config'
import { checkInboxPermission, isSuperAdmin } from '@/lib/inbox/authz'

export const dynamic = 'force-dynamic'

// Fail closed (INBOX-0S.1): no non-null assertion on the token — when no
// Chatwoot token is configured every handler returns a controlled 503.
const cwCfg = adminChatwootOrNull()
const CW_BASE    = cwCfg?.base ?? ''
const CW_TOKEN   = cwCfg?.token ?? ''
const CW_ACCOUNT = cwCfg?.accountId ?? '1'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!cwCfg) return NextResponse.json({ error: 'Messaging service is not configured.' }, { status: 503 })
  const authz = checkInboxPermission(session, 'inbox_view')
  if (!authz.allowed) return NextResponse.json({ error: authz.error }, { status: authz.status })

  const res  = await fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/agents`, {
    headers: { api_access_token: CW_TOKEN },
  }).catch(() => null)
  if (!res || !res.ok) {
    console.error('[agents] Chatwoot error:', res?.status ?? 'unreachable')
    return NextResponse.json({ error: 'Could not load agents. Please try again.' }, { status: 502 })
  }
  const data = await res.json().catch(() => []) as unknown[]
  // Hide Jade bot (id 5) from UI
  const agents = Array.isArray(data) ? data.filter((a: unknown) => (a as { id: number }).id !== 5) : data
  return NextResponse.json(agents)
}

export async function POST(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!cwCfg) return NextResponse.json({ error: 'Messaging service is not configured.' }, { status: 503 })
  // Creating a Chatwoot agent provisions an EXTERNAL login — super_admin
  // only, deliberately stricter than staff_create (product decision, 0S.2).
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: 'Only Super Admins can create Chatwoot agents' }, { status: 403 })
  }

  const body = await req.json() as { name: string; email: string; role: string }

  const res = await fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/agents`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', api_access_token: CW_TOKEN },
    body:    JSON.stringify({ name: body.name, email: body.email, role: body.role }),
  }).catch(() => null)
  if (!res) return NextResponse.json({ error: 'Could not create the agent — messaging service unreachable.' }, { status: 502 })
  const data = await res.json().catch(() => null)
  if (!res.ok || data === null) {
    console.error('[agents create] Chatwoot error:', res.status, JSON.stringify(data)?.slice(0, 300))
    const msg = res.status === 422
      ? 'Chatwoot rejected the agent details — the email may already be in use.'
      : 'Could not create the agent — messaging service error. Please try again.'
    return NextResponse.json({ error: msg }, { status: res.status === 422 ? 422 : 502 })
  }
  return NextResponse.json(data)
}
