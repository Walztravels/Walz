// Airport and service search for the Airport Services booking flow.
// mode=airports  → search airports by query string
// mode=services  → search services at an airport, filtered by service type
// Returns normalised Walz models; raw CP data and net prices never leave this route.

import { NextRequest, NextResponse } from 'next/server'
import { isEnabled }          from '@/lib/concierge/suppliers/comfortpass/config'
import { ComfortPassAdapter } from '@/lib/concierge/suppliers/comfortpass/adapter'

export const runtime = 'nodejs'

// Maps URL-friendly type slugs to CP API service type strings
const CP_TYPE_MAP: Record<string, string[]> = {
  'lounge':       ['lounge'],
  'meet-greet':   ['meet_greet', 'fast_track'],
  'transfer':     ['transfer', 'airport_transfer'],
  'sleeping-pod': ['sleeping_pod', 'pod'],
  'baggage':      ['baggage_delivery', 'baggage', 'luggage'],
}

export async function GET(req: NextRequest) {
  if (!isEnabled()) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const mode        = searchParams.get('mode') ?? 'services'
  const q           = searchParams.get('q')           ?? ''
  const airport     = searchParams.get('airport')     ?? undefined
  const serviceType = searchParams.get('serviceType') ?? undefined
  const date        = searchParams.get('date')        ?? undefined
  const pax         = searchParams.get('pax')         ? Number(searchParams.get('pax')) : undefined

  const adapter = new ComfortPassAdapter()

  try {
    if (mode === 'airports') {
      if (!q.trim()) return NextResponse.json({ airports: [] })
      const airports = await adapter.searchAirports(q)
      return NextResponse.json({ airports })
    }

    // mode === 'services'
    if (!airport) {
      return NextResponse.json({ error: 'airport is required for service search' }, { status: 400 })
    }

    const allServices = await adapter.searchServices({ airport, date, passengers: pax })

    // Filter by service type if provided
    const services = serviceType && CP_TYPE_MAP[serviceType]
      ? allServices.filter(s => CP_TYPE_MAP[serviceType].includes(s.type.toLowerCase()))
      : allServices

    return NextResponse.json({ services })
  } catch (err) {
    console.error('[/api/concierge/airport-services/search]', (err as Error).message)
    return NextResponse.json({ error: 'Search failed' }, { status: 502 })
  }
}
