// Baggage delivery catalogue — returns the full lookup tree for building a quote.
// GET /baggage/catalog has no serviceCode param; returns countries/cities/serviceTypes/deliveryTypes.

import { NextResponse } from 'next/server'
import { getConfig }         from '@/lib/concierge/suppliers/comfortpass/config'
import { ComfortPassClient } from '@/lib/concierge/suppliers/comfortpass/client'

export const runtime = 'nodejs'

export async function GET() {
  const config = getConfig()
  if (!config) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const client = new ComfortPassClient(config)

  try {
    const catalogue = await client.getBaggageCatalogue()
    return NextResponse.json({ catalogue })
  } catch (err) {
    console.error('[/api/concierge/airport-services/baggage/catalogue]', (err as Error).message)
    return NextResponse.json({ error: 'Failed to load baggage catalogue' }, { status: 502 })
  }
}
