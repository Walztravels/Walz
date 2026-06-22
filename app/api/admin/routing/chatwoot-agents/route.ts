import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const base    = process.env.CHATWOOT_BASE_URL  ?? 'https://chat.walztravels.com'
  const token   = process.env.CHATWOOT_API_TOKEN ?? '1rnd6Rp9GNVKtbJ8238Vg2S1'
  const account = process.env.CHATWOOT_ACCOUNT_ID ?? '1'

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
