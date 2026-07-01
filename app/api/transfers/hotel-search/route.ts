import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 3) return NextResponse.json({ hotels: [] })

  try {
    // Use OpenStreetMap Nominatim to geocode hotel/address/place names.
    // Returns lat/lng which are passed as GPS type to the Transfers API.
    // No API key required. Rate limit: 1 req/second (fine for autocomplete).
    const url = `https://nominatim.openstreetmap.org/search?` +
      new URLSearchParams({
        q,
        format:            'json',
        limit:             '8',
        addressdetails:    '1',
        'accept-language': 'en',
      })

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'WalzTravels/1.0 (walztravels.com)',  // Required by Nominatim ToS
      },
    })

    if (!res.ok) throw new Error(`Nominatim ${res.status}`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = await res.json()

    console.log('[transfer hotel-search] nominatim results:', results.length,
      results[0] ? `first: ${results[0].display_name}` : 'none')

    const hotels = results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((r: any) => r.lat && r.lon)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => {
        const lat  = parseFloat(r.lat).toFixed(6)
        const lon  = parseFloat(r.lon).toFixed(6)
        const parts = (r.display_name ?? '').split(',')
        const name  = parts.slice(0, 2).join(',').trim()
        const city  = parts[2]?.trim() ?? r.address?.city ?? r.address?.town ?? ''
        const country = r.address?.country_code?.toUpperCase() ?? ''
        return {
          code:    `${lat},${lon}`,
          type:    'GPS' as const,
          name,
          city,
          country,
        }
      })

    return NextResponse.json({ hotels })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[transfer hotel-search error]', msg)
    return NextResponse.json({ hotels: [] })
  }
}
