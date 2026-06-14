import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const CW_BASE    = process.env.CHATWOOT_BASE_URL    || 'https://chatwoot-production-d486.up.railway.app'
const CW_TOKEN   = process.env.CHATWOOT_ADMIN_TOKEN!
const CW_ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID  || '1'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const body = await req.json() as { name: string; email: string; role: string }

  const res = await fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/agents`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', api_access_token: CW_TOKEN },
    body:    JSON.stringify({ name: body.name, email: body.email, role: body.role }),
  })
  const data = await res.json()
  return NextResponse.json(data)
}
