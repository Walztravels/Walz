// Airport and service search — forwards to ComfortPass via the adapter.
// Returns normalised Walz models only; supplier keys and net prices never returned.

import { NextRequest, NextResponse } from 'next/server'
import { isEnabled }          from '@/lib/concierge/suppliers/comfortpass/config'
import { ComfortPassAdapter } from '@/lib/concierge/suppliers/comfortpass/adapter'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!isEnabled()) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const type    = searchParams.get('type')   ?? 'service'   // 'airport' | 'service'
  const q       = searchParams.get('q')      ?? ''
  const airport = searchParams.get('airport') ?? undefined
  const date    = searchParams.get('date')    ?? undefined
  const pax     = searchParams.get('pax')     ? Number(searchParams.get('pax')) : undefined

  if (!q.trim()) {
    return NextResponse.json({ error: 'q parameter is required' }, { status: 400 })
  }

  const adapter = new ComfortPassAdapter()

  try {
    if (type === 'airport') {
      const airports = await adapter.searchAirports(q)
      return NextResponse.json({ airports })
    }

    const services = await adapter.searchServices({ q, airport, date, passengers: pax })
    return NextResponse.json({ services })
  } catch (err) {
    console.error('[/api/concierge/search]', (err as Error).message)
    return NextResponse.json({ error: 'Search failed' }, { status: 502 })
  }
}
