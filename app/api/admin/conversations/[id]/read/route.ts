import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const CW_BASE    = process.env.CHATWOOT_BASE_URL    || 'https://chatwoot-production-d486.up.railway.app'
const CW_TOKEN   = process.env.CHATWOOT_ADMIN_TOKEN!
const CW_ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID  || '1'

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Chatwoot uses GET with a side-effect to mark all messages as read
  await fetch(
    `${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations/${params.id}/read`,
    { method: 'GET', headers: { api_access_token: CW_TOKEN } }
  ).catch(() => {})

  return NextResponse.json({ ok: true })
}
