// Live baggage quote — applies Walz markup to the CP quote total.
// GET with query params: countryId, cityId, serviceTypeId, deliveryTypeId, bags
// Raw CP amounts are stripped; only display-safe values are returned.

import { NextRequest, NextResponse } from 'next/server'
import { getConfig }         from '@/lib/concierge/suppliers/comfortpass/config'
import { ComfortPassClient } from '@/lib/concierge/suppliers/comfortpass/client'
import { applyWalzMarkup, formatDisplayPrice } from '@/lib/concierge/pricing'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const config = getConfig()
  if (!config) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const countryId      = searchParams.get('countryId')
  const cityId         = searchParams.get('cityId')
  const serviceTypeId  = searchParams.get('serviceTypeId')
  const deliveryTypeId = searchParams.get('deliveryTypeId')
  const bagsRaw        = searchParams.get('bags')

  if (!countryId || !cityId || !serviceTypeId || !deliveryTypeId || !bagsRaw) {
    return NextResponse.json(
      { error: 'countryId, cityId, serviceTypeId, deliveryTypeId, and bags are required' },
      { status: 400 },
    )
  }

  const bags = Number(bagsRaw)
  if (!Number.isInteger(bags) || bags < 1) {
    return NextResponse.json({ error: 'bags must be a positive integer' }, { status: 400 })
  }

  const client = new ComfortPassClient(config)

  try {
    const cpQuote = await client.getBaggageQuote({
      countryId,
      cityId,
      serviceTypeId,
      deliveryTypeId,
      bags,
    })

    const { walzAmount, currency } = await applyWalzMarkup(cpQuote.total, cpQuote.currency)

    return NextResponse.json({
      quote: {
        displayTotal: formatDisplayPrice(walzAmount, currency, false),
        items: cpQuote.items.map(item => ({
          code:     item.code,
          label:    item.label,
          quantity: item.quantity,
        })),
      },
    })
  } catch (err) {
    console.error('[/api/concierge/airport-services/baggage/quote]', (err as Error).message)
    return NextResponse.json({ error: 'Quote failed' }, { status: 502 })
  }
}
