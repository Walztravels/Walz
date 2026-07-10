import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 401 })

  // Airalo account balance is managed at partners-api.airalo.com — check the
  // Airalo partner dashboard directly. There is no server-side balance API call
  // needed because purchases are pre-funded through the Airalo partner account.
  return NextResponse.json({
    balance: null,
    note: 'Account balance is visible in the Airalo partner dashboard.',
  })
}
