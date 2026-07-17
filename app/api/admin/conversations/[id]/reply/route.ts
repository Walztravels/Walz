import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const CW_BASE    = process.env.CHATWOOT_BASE_URL    || 'https://chatwoot-production-d486.up.railway.app'
const CW_TOKEN   = process.env.CHATWOOT_ADMIN_TOKEN!
const CW_ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID  || '1'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { content: string; message_type?: string; private?: boolean }

  const res = await fetch(
    `${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations/${params.id}/messages`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', api_access_token: CW_TOKEN },
      body:    JSON.stringify({
        content:      body.content,
        message_type: 1,           // 1 = outgoing agent message (numeric, not string)
        private:      body.private ?? false,
      }),
    }
  )
  const data = await res.json()
  if (!res.ok) {
    console.error('[reply] Chatwoot error:', res.status, JSON.stringify(data))
    return NextResponse.json({ error: data?.message ?? data?.error ?? 'Chatwoot send failed', chatwoot: data }, { status: res.status })
  }
  // Detect token misconfiguration: if Chatwoot stored the message as incoming (type 0)
  // instead of outgoing (type 1), CHATWOOT_ADMIN_TOKEN is wrong (e.g. set to the website
  // widget token instead of a user API access token from Chatwoot → Profile → Access Token).
  if (data?.message_type === 0) {
    console.error(
      '[reply] ⚠️  Message stored as INCOMING (type 0) — should be OUTGOING (type 1). ' +
      'CHATWOOT_ADMIN_TOKEN is likely incorrect. ' +
      'Fix: in Vercel, set CHATWOOT_ADMIN_TOKEN to the API Access Token from ' +
      'Chatwoot → Profile Settings → Access Token (NOT the website/inbox token).'
    )
  }
  return NextResponse.json(data)
}
