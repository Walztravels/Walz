// Admin-only: ComfortPass account balance check.
// Balance and threshold are internal operations data — never exposed to customers.

import { NextResponse } from 'next/server'
import { getAdminSession }    from '@/lib/admin-auth'
import { isEnabled }          from '@/lib/concierge/suppliers/comfortpass/config'
import { ComfortPassAdapter } from '@/lib/concierge/suppliers/comfortpass/adapter'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isEnabled()) {
    return NextResponse.json({ enabled: false, balance: null })
  }

  const adapter = new ComfortPassAdapter()

  try {
    const balance = await adapter.getAccountBalance()
    return NextResponse.json({ enabled: true, balance })
  } catch (err) {
    console.error('[Admin/ComfortPass/balance]', (err as Error).message)
    return NextResponse.json({ error: 'Balance check failed' }, { status: 502 })
  }
}
