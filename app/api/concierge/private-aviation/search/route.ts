// GET /api/concierge/private-aviation/search
//
// ?mode=airports&q=<query>         — airport typeahead
// ?mode=estimate&from=&to=&pax=    — flight distance/time/price estimate
// ?mode=charters&from=&to=&date=&pax=&category= — available aircraft

import { NextRequest, NextResponse } from 'next/server'
import { getConfig }        from '@/lib/concierge/suppliers/aviapages/config'
import { AviapagesClient }  from '@/lib/concierge/suppliers/aviapages/client'
import { AviapagesAdapter } from '@/lib/concierge/suppliers/aviapages/adapter'
import type { APAircraftCategory } from '@/lib/concierge/suppliers/aviapages/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const mode = searchParams.get('mode') ?? 'airports'

  const config = getConfig()
  if (!config) {
    return NextResponse.json({ error: 'Private aviation search is not available.' }, { status: 503 })
  }

  try {
    // ── Airport typeahead ──────────────────────────────────────────────────────
    if (mode === 'airports') {
      const q = searchParams.get('q') ?? ''
      if (!q || q.length < 2) {
        return NextResponse.json({ airports: [] })
      }
      const client   = new AviapagesClient(config)
      const airports = await client.searchAirports(q)
      return NextResponse.json({
        airports: airports.map(a => ({
          code:    a.iata ?? a.icao,
          icao:    a.icao,
          iata:    a.iata,
          name:    a.name,
          city:    a.city,
          country: a.country,
        })),
      })
    }

    // ── Flight estimate ────────────────────────────────────────────────────────
    if (mode === 'estimate') {
      const from       = searchParams.get('from') ?? ''
      const to         = searchParams.get('to')   ?? ''
      const passengers = Number(searchParams.get('pax') ?? '1')
      const date       = searchParams.get('date') ?? undefined

      if (!from || !to) {
        return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
      }

      const adapter  = new AviapagesAdapter()
      const estimate = await adapter.getFlightEstimate({ from, to, passengers, date })
      return NextResponse.json({ estimate })
    }

    // ── Charter search ─────────────────────────────────────────────────────────
    if (mode === 'charters') {
      const from       = searchParams.get('from') ?? ''
      const to         = searchParams.get('to')   ?? ''
      const date       = searchParams.get('date') ?? ''
      const passengers = Number(searchParams.get('pax') ?? '1')
      const category   = (searchParams.get('category') ?? undefined) as APAircraftCategory | undefined

      if (!from || !to || !date) {
        return NextResponse.json({ error: 'from, to, and date are required' }, { status: 400 })
      }

      const adapter  = new AviapagesAdapter()
      const charters = await adapter.searchAvailableCharters({ from, to, date, passengers, category })
      return NextResponse.json({ charters })
    }

    return NextResponse.json({ error: 'Unknown mode' }, { status: 400 })
  } catch (err) {
    console.error('[PrivateAviation/search]', (err as Error).message)
    return NextResponse.json({ error: 'Search failed. Please try again.' }, { status: 502 })
  }
}
