// Live Walz price quote for an airport service.
// Uses ComfortPassClient directly (server-side) to get the raw price,
// then applies the Walz markup. Raw CP amounts are never returned.

import { NextRequest, NextResponse } from 'next/server'
import { getConfig }          from '@/lib/concierge/suppliers/comfortpass/config'
import { ComfortPassClient }  from '@/lib/concierge/suppliers/comfortpass/client'
import { applyWalzMarkup, formatDisplayPrice } from '@/lib/concierge/pricing'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const config = getConfig()
  if (!config) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const serviceCode = searchParams.get('serviceCode')
  const pax  = searchParams.get('pax')  ? Number(searchParams.get('pax'))  : 1
  const date = searchParams.get('date') ?? undefined

  if (!serviceCode) {
    return NextResponse.json({ error: 'serviceCode is required' }, { status: 400 })
  }

  const client = new ComfortPassClient(config)

  try {
    const cpPrice = await client.getPrice(serviceCode, { passengers: pax, date })
    const { walzAmount, currency } = await applyWalzMarkup(cpPrice.amount, cpPrice.currency)

    return NextResponse.json({
      price: {
        displayPrice: formatDisplayPrice(walzAmount, currency, cpPrice.perPerson),
        perPerson:    cpPrice.perPerson,
      },
    })
  } catch (err) {
    console.error('[/api/concierge/airport-services/quote]', (err as Error).message)
    return NextResponse.json({ error: 'Price check failed' }, { status: 502 })
  }
}
