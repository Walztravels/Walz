// Price verification endpoint — returns customer-safe display price only.
// Supplier net amount is never included in the response.

import { NextRequest, NextResponse } from 'next/server'
import { isEnabled }          from '@/lib/concierge/suppliers/comfortpass/config'
import { ComfortPassAdapter } from '@/lib/concierge/suppliers/comfortpass/adapter'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!isEnabled()) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const serviceCode = searchParams.get('serviceCode')
  const pax         = searchParams.get('pax') ? Number(searchParams.get('pax')) : undefined
  const date        = searchParams.get('date') ?? undefined

  if (!serviceCode) {
    return NextResponse.json({ error: 'serviceCode is required' }, { status: 400 })
  }

  const adapter = new ComfortPassAdapter()

  try {
    const price = await adapter.getServicePrice(serviceCode)
    // WalzServicePrice only contains displayPrice — no raw amount
    return NextResponse.json({ price })
  } catch (err) {
    console.error('[/api/concierge/quotes]', (err as Error).message)
    return NextResponse.json({ error: 'Price check failed' }, { status: 502 })
  }
}
