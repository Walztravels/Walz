// Live baggage quote — applies Walz markup to the CP quote total.
// Raw CP amounts are stripped; only display-safe values are returned.

import { NextRequest, NextResponse } from 'next/server'
import { getConfig }         from '@/lib/concierge/suppliers/comfortpass/config'
import { ComfortPassClient } from '@/lib/concierge/suppliers/comfortpass/client'
import { applyWalzMarkup, formatDisplayPrice } from '@/lib/concierge/pricing'
import type { CPPassenger } from '@/lib/concierge/suppliers/comfortpass/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const config = getConfig()
  if (!config) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { serviceCode, passengers, baggage } = body as {
    serviceCode: string
    passengers:  CPPassenger[]
    baggage:     { code: string; quantity: number }[]
  }

  if (!serviceCode || !Array.isArray(baggage) || baggage.length === 0) {
    return NextResponse.json({ error: 'serviceCode and baggage selections are required' }, { status: 400 })
  }

  const client = new ComfortPassClient(config)

  try {
    const cpQuote = await client.getBaggageQuote({
      serviceCode,
      passengers: passengers ?? [{ type: 'adult', firstName: 'Guest', lastName: 'Traveller' }],
      baggage,
    })

    const { walzAmount, currency } = await applyWalzMarkup(cpQuote.total, cpQuote.currency)

    return NextResponse.json({
      quote: {
        displayTotal: formatDisplayPrice(walzAmount, currency, false),
        // Individual item display prices (markup applied proportionally)
        items: cpQuote.items.map(item => ({
          code:     item.code,
          label:    item.label,
          quantity: item.quantity,
          // Each item's display price is proportional — we don't show breakdown after markup
        })),
      },
    })
  } catch (err) {
    console.error('[/api/concierge/airport-services/baggage/quote]', (err as Error).message)
    return NextResponse.json({ error: 'Quote failed' }, { status: 502 })
  }
}
