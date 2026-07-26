// Baggage catalogue for a specific service code.
// Applies Walz markup to each option price before returning to the client.
// Raw CP prices are never returned.

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
  const serviceCode = searchParams.get('serviceCode')
  if (!serviceCode) {
    return NextResponse.json({ error: 'serviceCode is required' }, { status: 400 })
  }

  const client = new ComfortPassClient(config)

  try {
    const rawOptions = await client.getBaggageCatalogue(serviceCode)

    // Apply Walz markup to each option; strip raw price
    const options = await Promise.all(
      rawOptions.map(async opt => {
        const { walzAmount, currency } = await applyWalzMarkup(opt.price, opt.currency)
        return {
          code:         opt.code,
          label:        opt.label,
          description:  opt.description,
          displayPrice: formatDisplayPrice(walzAmount, currency, opt.perPerson),
          perPerson:    opt.perPerson,
        }
      }),
    )

    return NextResponse.json({ options })
  } catch (err) {
    console.error('[/api/concierge/airport-services/baggage/catalogue]', (err as Error).message)
    return NextResponse.json({ error: 'Failed to load baggage options' }, { status: 502 })
  }
}
