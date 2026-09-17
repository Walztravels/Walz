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
  })
  const data = await res.json() as unknown[]
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
  })
  const data = await res.json()
  return NextResponse.json(data)
}
