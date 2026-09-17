import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { botChatwootOrNull } from '@/lib/chatwoot/config'
import { hasAnyInboxPermission } from '@/lib/inbox/authz'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasAnyInboxPermission(session, ['inbox_assign', 'settings_integrations'])) {
    return NextResponse.json({ error: 'You do not have permission to do this.' }, { status: 403 })
  }
  const cw = botChatwootOrNull()
  if (!cw) return NextResponse.json({ error: 'Messaging service is not configured.' }, { status: 503 })
  const base    = process.env.CHATWOOT_BASE_URL  ?? 'https://chat.walztravels.com'
  const token   = cw.token
  const account = cw.accountId

  try {
    const res = await fetch(`${base}/api/v1/accounts/${account}/agents`, {
      headers: { api_access_token: token },
    })
    if (!res.ok) return NextResponse.json({ agents: [] })

    const data = await res.json() as Array<{ id: number; name: string; email: string; role: string }>
    return NextResponse.json({
      agents: data.map((a) => ({ id: a.id, name: a.name, email: a.email, role: a.role })),
    })
  } catch {
    return NextResponse.json({ agents: [] })
  }
}
