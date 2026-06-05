import { NextRequest, NextResponse } from 'next/server'
import { duffelGet } from '@/lib/duffel/client'

interface DuffelPlace {
  id: string
  type: string
  name: string
  iata_code?: string
  city_name?: string
  iata_country_code?: string
  latitude?: number
  longitude?: number
}

interface DuffelPlacesResponse {
  data: DuffelPlace[]
}

export interface AirportSuggestion {
  code: string
  name: string
  city: string
  country: string
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json({ data: [] })
  }

  try {
    const result = await duffelGet<DuffelPlacesResponse>('/places/suggestions', { query: q })

    const airports: AirportSuggestion[] = result.data
      .filter((p) => p.type === 'airport' && p.iata_code)
      .slice(0, 8)
      .map((p) => ({
        code: p.iata_code!,
        name: p.name,
        city: p.city_name ?? p.name,
        country: p.iata_country_code ?? '',
      }))

    return NextResponse.json({ data: airports })
  } catch (err) {
    console.error('[Places] Duffel error:', err)
    // Graceful degradation — return empty so UI falls back to static list
    return NextResponse.json({ data: [] })
  }
}
