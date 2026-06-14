import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const CW_BASE    = process.env.CHATWOOT_BASE_URL    || 'https://chatwoot-production-d486.up.railway.app'
const CW_TOKEN   = process.env.CHATWOOT_ADMIN_TOKEN!
const CW_ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID  || '1'

export async function GET(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status       = searchParams.get('status')        || 'open'
  const assigneeType = searchParams.get('assignee_type') || ''
  const page         = searchParams.get('page')          || '1'

  const params = new URLSearchParams({ status, page })
  if (assigneeType) params.set('assignee_type', assigneeType)

  const res  = await fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations?${params}`, {
    headers: { api_access_token: CW_TOKEN },
  })
  const data = await res.json()
  // Unwrap Chatwoot's envelope so frontend sees { meta, payload } directly
  return NextResponse.json(data?.data ?? data)
}
