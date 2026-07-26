// Voucher retrieval by CP booking ID — admin only.
// Returns voucherUrl for the admin/customer to access their digital pass.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }    from '@/lib/admin-auth'
import { isEnabled }          from '@/lib/concierge/suppliers/comfortpass/config'
import { ComfortPassAdapter } from '@/lib/concierge/suppliers/comfortpass/adapter'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isEnabled()) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { id }  = await params
  const walzRef = req.nextUrl.searchParams.get('ref') ?? id
  const adapter = new ComfortPassAdapter()

  try {
    const voucher = await adapter.fetchVoucher(id, walzRef)
    return NextResponse.json({ voucher })
  } catch (err) {
    console.error('[/api/concierge/bookings/[id]/voucher]', (err as Error).message)
    return NextResponse.json({ error: 'Voucher not available' }, { status: 502 })
  }
}
