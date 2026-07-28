// GET /api/concierge/private-aviation/empty-legs
// ?from=GB,AE,FR   — departure country codes (ISO alpha-2, comma-separated)
// ?to=NG,GH        — arrival country codes
// ?days=60         — look-ahead window in days (default 60, max 180)
//
// Caches 15 minutes at the CDN layer — empty legs are browsable inventory,
// not live quotes. The monthly Aviapages API cap is real.

import { NextRequest, NextResponse }        from 'next/server'
import { getConfig }                         from '@/lib/concierge/suppliers/aviapages/config'
import { AviapagesClient }                   from '@/lib/concierge/suppliers/aviapages/client'
import { applyWalzMarkup, formatDisplayPrice } from '@/lib/concierge/pricing'
import type { APEmptyLeg }                   from '@/lib/concierge/suppliers/aviapages/types'

export const dynamic = 'force-dynamic'

interface EmptyLegResult {
  id:          string
  depAirport:  { code: string; name: string; city?: string }
  arrAirport:  { code: string; name: string; city?: string }
  aircraftType: string
  fromDate:    string
  toDate:      string
  displayPrice: string
}

function airportCode(ap: APEmptyLeg['dep_airport']): string {
  return ap?.icao ?? ap?.iata ?? ''
}

function cityStr(city: string | { name?: string } | undefined): string | undefined {
  if (!city) return undefined
  if (typeof city === 'string') return city
  return city.name ?? undefined
}

function padDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  const config = getConfig()
  if (!config) {
    return NextResponse.json({ emptyLegs: [], disabled: true })
  }

  const fromCountries = searchParams.get('from') ?? ''
  const toCountries   = searchParams.get('to')   ?? 'NG,GH'
  const days          = Math.min(180, Math.max(1, Number(searchParams.get('days') ?? '60')))

  const today   = new Date()
  const horizon = new Date(today.getTime() + days * 24 * 60 * 60 * 1000)

  try {
    const client  = new AviapagesClient(config)
    const rawLegs = await client.getEmptyLegs({
      ...(fromCountries ? { depCountries: fromCountries } : {}),
      arrCountries: toCountries,
      fromDate:     padDate(today),
      toDate:       padDate(horizon),
    })

    if (!rawLegs.length) {
      return NextResponse.json({ emptyLegs: [] }, {
        headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=60' },
      })
    }

    // Derive markup factor from pricing rules with a single DB call
    const { walzAmount: sample } = await applyWalzMarkup(1000, 'USD', 'private-aviation')
    const markupFactor = sample / 1000

    const emptyLegs: EmptyLegResult[] = rawLegs.map(leg => {
      const depCode   = airportCode(leg.dep_airport)
      const arrCode   = airportCode(leg.arr_airport)
      const walzPrice = Math.round(leg.price * markupFactor)
      const currency  = leg.currency_code ?? 'USD'
      const displayPrice = `From ${formatDisplayPrice(walzPrice, currency, false)}`

      return {
        id:          `${depCode}-${arrCode}-${leg.from_date_utc}`,
        depAirport:  { code: depCode, name: leg.dep_airport?.name ?? depCode, city: cityStr(leg.dep_airport?.city) },
        arrAirport:  { code: arrCode, name: leg.arr_airport?.name ?? arrCode, city: cityStr(leg.arr_airport?.city) },
        aircraftType: leg.aircraft_type ?? 'Private Jet',
        fromDate:    leg.from_date_utc,
        toDate:      leg.to_date_utc,
        displayPrice,
      }
    })

    return NextResponse.json({ emptyLegs }, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=60' },
    })
  } catch (err) {
    console.error('[empty-legs]', (err as Error).message)
    // Return empty rather than 502 — this section is optional enhancement
    return NextResponse.json({ emptyLegs: [] })
  }
}
