import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const CW_BASE    = process.env.CHATWOOT_BASE_URL    || 'https://chatwoot-production-d486.up.railway.app'
const CW_TOKEN   = process.env.CHATWOOT_ADMIN_TOKEN!
const CW_ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID  || '1'

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Cursor pagination (conversation-history fix): `before` is the oldest
  // loaded Chatwoot message id — Chatwoot returns the previous page of
  // messages before it. Without it, only the latest page is returned,
  // which is the initial load.
  const before = new URL(req.url).searchParams.get('before')
  const qs = before && /^\d+$/.test(before) ? `?before=${before}` : ''

  const res  = await fetch(
    `${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations/${params.id}/messages${qs}`,
    { headers: { api_access_token: CW_TOKEN } }
  )
  const data = await res.json()
  // Normalise: some Chatwoot versions wrap in { data: { payload } }, others use { payload }
  return NextResponse.json(data?.data ?? data)
}
