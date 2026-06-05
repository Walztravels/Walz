import { searchGoogleFlights } from '@/lib/sources/google-flights'
import { searchSkyscanner } from '@/lib/sources/skyscanner'
import { searchDuffel } from '@/lib/sources/duffel'
import { searchFlights as searchSabre } from '@/lib/sabre/flights'
import type { WalzFlight, FlightSearchInput } from '@/lib/types/flight'
import type { FlightResult } from '@/types/booking'

/**
 * Run Google Flights, Skyscanner, Duffel, and Sabre in parallel.
 * Merge results and deduplicate by matchKey (flight_number + date).
 * Source priority for dedup: google > skyscanner > duffel > sabre
 * Duffel results carry a duffelOfferId enabling direct booking without Sabre.
 *
 * For multi-city trips only Duffel is queried (other sources don't natively
 * support multi-city offer requests).
 */
export async function searchAllSources(params: FlightSearchInput): Promise<WalzFlight[]> {
  // Multi-city: Duffel is the only source that natively supports arbitrary slices
  if (params.tripType === 'multicity') {
    try {
      return await searchDuffel(params)
    } catch (err) {
      console.error('[Merge] Multi-city Duffel search failed:', err)
      return []
    }
  }

  // After the multi-city early-return above, origin/destination/departureDate
  // are always present. Cast to a narrowed type so other sources stay happy.
  type RoutedParams = FlightSearchInput & { origin: string; destination: string; departureDate: string }
  const rp = params as RoutedParams

  const [googleResult, skyscannerResult, duffelResult, sabreResult] = await Promise.allSettled([
    searchGoogleFlights(rp),
    searchSkyscanner(rp),
    searchDuffel(rp),
    searchSabre(rp).catch((err) => {
      console.warn('[Merge] Sabre search failed:', err)
      return [] as FlightResult[]
    }),
  ])

  const googleFlights = googleResult.status === 'fulfilled' ? googleResult.value : []
  const skyscannerFlights = skyscannerResult.status === 'fulfilled' ? skyscannerResult.value : []
  const duffelFlights = duffelResult.status === 'fulfilled' ? duffelResult.value : []
  const sabreFlights = sabreResult.status === 'fulfilled' ? sabreResult.value : []

  if (googleResult.status === 'rejected') {
    console.warn('[Merge] Google Flights failed:', googleResult.reason)
  }
  if (skyscannerResult.status === 'rejected') {
    console.warn('[Merge] Skyscanner failed:', skyscannerResult.reason)
  }
  if (duffelResult.status === 'rejected') {
    console.warn('[Merge] Duffel failed:', duffelResult.reason)
  }

  // Wrap Sabre results as WalzFlights
  const sabreWalz: WalzFlight[] = sabreFlights.map((f) => {
    const firstSeg = f.outbound[0]
    const depDate = firstSeg?.departureTime?.slice(0, 10) ?? ''
    const flightNum = firstSeg?.flightNumber?.replace(/\s+/g, '') ?? ''
    const matchKey = `${flightNum}_${depDate}`

    return {
      ...f,
      source: 'sabre' as const,
      matchKey,
      displayPrice: { ...f.price },
      sabreBookable: true,
    }
  })

  // Priority: google(4) > skyscanner(3) > duffel(2) > sabre(1)
  // Duffel beats Sabre because it carries a live bookable offer ID
  const sourcePriority = { google: 4, skyscanner: 3, duffel: 2, sabre: 1 } as const
  const seen = new Map<string, WalzFlight>()

  for (const flight of [...googleFlights, ...skyscannerFlights, ...duffelFlights, ...sabreWalz]) {
    if (!seen.has(flight.matchKey)) {
      seen.set(flight.matchKey, flight)
    } else {
      const existing = seen.get(flight.matchKey)!
      if (sourcePriority[flight.source] > sourcePriority[existing.source]) {
        seen.set(flight.matchKey, flight)
      }
    }
  }

  const merged = Array.from(seen.values())
  merged.sort((a, b) => a.price.perPerson - b.price.perPerson)
  return merged
}
