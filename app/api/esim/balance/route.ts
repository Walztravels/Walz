import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { esimHeaders, ESIM_BASE } from '@/lib/esim-pricing'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 401 })

  try {
    const res  = await fetch(`${ESIM_BASE}/open/account/balance`, {
      method:  'POST',
      headers: esimHeaders(),
      body:    JSON.stringify({}),
    })
    const json = await res.json()

    if (json?.success || json?.errorCode === '0') {
      const balance = json?.obj?.balance ?? json?.obj ?? 0
      return NextResponse.json({ balance: Number(balance) })
    }

    return NextResponse.json({ error: json?.errorMsg ?? 'Balance fetch failed', balance: null }, { status: 200 })
  } catch (err) {
    console.error('[esim/balance]', err)
    return NextResponse.json({ error: 'Internal error', balance: null }, { status: 500 })
  }
}
