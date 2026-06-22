import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const CW_BASE    = process.env.CHATWOOT_BASE_URL    || 'https://chatwoot-production-d486.up.railway.app'
const CW_TOKEN   = process.env.CHATWOOT_ADMIN_TOKEN!
const CW_ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID  || '1'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  if (session.staffRole !== 'super_admin') {
    return NextResponse.json({ error: 'Only Super Admins can delete conversations' }, { status: 403 })
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
