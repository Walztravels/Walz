import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// ── City name → Hotelbeds destination code ────────────────────────────────────
const CITY_TO_DEST: Record<string, string> = {
  paris: 'PAR', london: 'LON', 'new york': 'NYC', nyc: 'NYC',
  dubai: 'DXB', rome: 'ROM', barcelona: 'BCN', madrid: 'MAD',
  amsterdam: 'AMS', berlin: 'BER', tokyo: 'TYO', singapore: 'SIN',
  sydney: 'SYD', toronto: 'TOR', miami: 'MIA', 'los angeles': 'LAX',
  'san francisco': 'SFO', chicago: 'CHI', bangkok: 'BKK', istanbul: 'IST',
  cairo: 'CAI', 'cape town': 'CPT', johannesburg: 'JNB', nairobi: 'NBI',
  lagos: 'LOS', accra: 'ACC', abidjan: 'ABJ', lisbon: 'LIS',
  vienna: 'VIE', zurich: 'ZRH', stockholm: 'STO', oslo: 'OSL',
  copenhagen: 'CPH', prague: 'PRG', budapest: 'BUD', athens: 'ATH',
  brussels: 'BRU', warsaw: 'WAW', doha: 'DOH', riyadh: 'RUH',
  'abu dhabi': 'AUH', muscat: 'MCT', kuwait: 'KWI', 'kuala lumpur': 'KUL',
  bali: 'DPS', 'hong kong': 'HKG', seoul: 'SEL', beijing: 'BJS',
  shanghai: 'SHA', mumbai: 'BOM', delhi: 'DEL', 'new delhi': 'DEL',
  casablanca: 'CAS', marrakech: 'RAK', 'addis ababa': 'ADD', addis: 'ADD',
  'rio de janeiro': 'RIO', 'sao paulo': 'SAO', 'mexico city': 'MEX',
  'buenos aires': 'BUE', maldives: 'MLE', male: 'MLE', zanzibar: 'ZNZ',
  mauritius: 'MRU', edinburgh: 'EDI', manchester: 'MAN', milan: 'MIL',
  venice: 'VCE', florence: 'FLR', porto: 'OPO', seville: 'SVQ',
  dakar: 'DKR', naples: 'NAP', nice: 'NCE',
  geneva: 'GVA', lyon: 'LYS', frankfurt: 'FRA', munich: 'MUC',
  hamburg: 'HAM', dusseldorf: 'DUS', cologne: 'CGN', 'koh samui': 'USM',
  phuket: 'HKT', 'chiang mai': 'CNX', jakarta: 'CGK',
  manila: 'MNL', 'ho chi minh': 'SGN', hanoi: 'HAN', taipei: 'TPE',
}

// Country-level aliases → major city (for searches like "canada", "france")
const COUNTRY_ALIAS: Record<string, string> = {
  canada: 'toronto', france: 'paris', uk: 'london', england: 'london',
  japan: 'tokyo', thailand: 'bangkok', australia: 'sydney',
  usa: 'new york', 'united states': 'new york', uae: 'dubai',
  germany: 'berlin', spain: 'barcelona', italy: 'rome',
  'south africa': 'cape town', kenya: 'nairobi', ghana: 'accra',
  nigeria: 'lagos', indonesia: 'bali', india: 'delhi',
  china: 'beijing', korea: 'seoul',
}

function resolveDestCode(destination: string): string {
  const raw = destination.toLowerCase().trim()
  const key = COUNTRY_ALIAS[raw] ?? raw
  if (CITY_TO_DEST[key]) return CITY_TO_DEST[key]
  for (const [city, code] of Object.entries(CITY_TO_DEST)) {
    if (key.startsWith(city) || key.includes(city)) return code
  }
  return destination.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'LON'
}

// Amadeus uses IATA city codes — a few differ from Hotelbeds codes
const AMADEUS_OVERRIDES: Record<string, string> = {
  TOR: 'YTO',   // Toronto: Hotelbeds=TOR, IATA city=YTO
  TYO: 'TYO',   // Tokyo: same
  SEL: 'SEL',   // Seoul: same
  STO: 'STO',   // Stockholm: same
  BJS: 'BJS',   // Beijing: same
}

function resolveAmadeusCity(destination: string): string {
  const hbCode = resolveDestCode(destination)
  return AMADEUS_OVERRIDES[hbCode] ?? hbCode
}

// ── Amadeus OAuth token cache ─────────────────────────────────────────────────
let _amadeusToken: { value: string; expiresAt: number } | null = null

async function getAmadeusToken(): Promise<string | null> {
  const key = process.env.AMADEUS_API_KEY
  const secret = process.env.AMADEUS_API_SECRET
  if (!key || !secret) return null

  // reuse if still valid (refresh 60s early)
  if (_amadeusToken && Date.now() < _amadeusToken.expiresAt - 60_000) {
    return _amadeusToken.value
  }

  const base = process.env.AMADEUS_BASE_URL ?? 'https://test.api.amadeus.com'
  try {
    const res = await fetch(`${base}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: key,
        client_secret: secret,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    _amadeusToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 1799) * 1000,
    }
    return _amadeusToken.value
  } catch {
    return null
  }
}

// ── ISO 8601 duration → human-readable string ────────────────────────────────
function formatIsoDuration(iso: string): string {
  if (!iso) return ''
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!m) return iso
  const h = parseInt(m[1] ?? '0')
  const min = parseInt(m[2] ?? '0')
  if (h && min) return `${h}h ${min}m`
  if (h) return `${h}h`
  return `${min}m`
}

// ── HotelResult type (shared) ─────────────────────────────────────────────────
interface HotelResult {
  name: string; stars: number; address: string
  price: number; currency: string; thumbnailUrl?: string
}

// ── Hotelbeds hotel search ─────────────────────────────────────────────────────
async function searchHotelsHotelbeds(
  destination: string,
  checkIn: string,
  checkOut: string,
  adults: number,
  children: number,
  childAges: number[],
  rooms: number,
): Promise<HotelResult[] | null> {
  if (!process.env.HOTELBEDS_HOTEL_API_KEY || !process.env.HOTELBEDS_HOTEL_SECRET) return null

  const destCode = resolveDestCode(destination)
  const occupancy: Record<string, unknown> = {
    rooms: Math.max(1, rooms),
    adults: Math.max(1, adults),
    children: Math.max(0, children),
  }
  if (children > 0 && childAges.length > 0) {
    occupancy.paxes = childAges.map((age) => ({ type: 'CH', age }))
  }

  try {
    const data = await Promise.race([
      hotelbedsRequest('hotel', '/hotels', {
        method: 'POST',
        body: {
          sourceMarket: 'GB',
          stay: { checkIn, checkOut },
          occupancies: [occupancy],
          destination: { code: destCode },
          filter: { maxHotels: 10, minCategory: 3, maxRatesPerRoom: 1 },
          currency: 'GBP',
          language: 'ENG',
        },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.hotels?.hotels ?? []).slice(0, 10).map((h: any) => {
      const stars = parseInt(String(h.categoryCode ?? '').replace(/\D/g, '')) || 0
      const imgPath = h.images?.[0]?.path
      return {
        name: h.name ?? 'Unknown Hotel',
        stars,
        address: h.zoneName
          ? `${h.zoneName}, ${h.destinationName ?? destination}`
          : (h.destinationName ?? destination),
        price: parseFloat(h.minRate) || 0,
        currency: h.currency ?? 'GBP',
        thumbnailUrl: imgPath ? `https://photos.hotelbeds.com/giata/small/${imgPath}` : undefined,
      }
    })
  } catch (err) {
    console.warn('[research/hotelbeds]', (err as Error).message)
    return null
  }
}

// ── Amadeus hotel search ───────────────────────────────────────────────────────
async function searchHotelsAmadeus(
  destination: string,
  checkIn: string,
  checkOut: string,
  adults: number,
  children: number,
  childAges: number[],
  rooms: number,
): Promise<HotelResult[] | null> {
  const token = await getAmadeusToken()
  if (!token) return null

  const cityCode = resolveAmadeusCity(destination)
  const base = process.env.AMADEUS_BASE_URL ?? 'https://test.api.amadeus.com'

  try {
    // Step 1 — get hotel IDs for the city
    const listRes = await fetch(
      `${base}/v1/reference-data/locations/hotels/by-city?cityCode=${cityCode}&radius=20&radiusUnit=KM&hotelSource=ALL`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) },
    )
    if (!listRes.ok) {
      console.warn('[research/amadeus] hotel list', listRes.status, await listRes.text().catch(() => ''))
      return null
    }
    const listData = await listRes.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hotelIds: string[] = (listData.data ?? []).slice(0, 25).map((h: any) => h.hotelId as string)
    if (!hotelIds.length) return []

    // Step 2 — get offers for those hotels
    const qs = new URLSearchParams({
      hotelIds: hotelIds.join(','),
      checkInDate: checkIn,
      checkOutDate: checkOut,
      adults: String(Math.max(1, adults)),
      roomQuantity: String(Math.max(1, rooms)),
      currency: 'GBP',
      bestRateOnly: 'true',
    })
    if (children > 0) qs.set('children', String(children))
    if (children > 0 && childAges.length > 0) qs.set('childAges', childAges.join(','))

    const offersRes = await fetch(
      `${base}/v3/shopping/hotel-offers?${qs}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) },
    )
    if (!offersRes.ok) {
      console.warn('[research/amadeus] hotel offers', offersRes.status, await offersRes.text().catch(() => ''))
      return null
    }
    const offersData = await offersRes.json()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (offersData.data ?? []).slice(0, 10).map((item: any) => {
      const h = item.hotel ?? {}
      const offer = item.offers?.[0]
      const stars = parseInt(h.rating ?? '0') || 0
      const addressParts: string[] = [
        ...(h.address?.lines ?? []),
        h.address?.cityName ?? destination,
      ].filter(Boolean)
      return {
        name: h.name ?? 'Unknown Hotel',
        stars,
        address: addressParts.join(', '),
        price: parseFloat(offer?.price?.total ?? '0'),
        currency: offer?.price?.currency ?? 'GBP',
      }
    })
  } catch (err) {
    console.warn('[research/amadeus]', (err as Error).message)
    return null
  }
}

// ── Orchestrated hotel search: Hotelbeds → Amadeus → fallback ─────────────────
async function searchHotels(
  destination: string,
  checkIn: string,
  checkOut: string,
  adults: number,
  children: number,
  childAges: number[],
  rooms: number,
) {
  // Try Hotelbeds first
  const hbResult = await searchHotelsHotelbeds(destination, checkIn, checkOut, adults, children, childAges, rooms)
  if (hbResult !== null) {
    return { hotels: hbResult, source: 'hotelbeds' as const, fallback: hbResult.length === 0 }
  }

  // Fallback to Amadeus
  const amResult = await searchHotelsAmadeus(destination, checkIn, checkOut, adults, children, childAges, rooms)
  if (amResult !== null) {
    return { hotels: amResult, source: 'amadeus' as const, fallback: amResult.length === 0 }
  }

  // Neither provider configured or both failed
  return { hotels: [], source: 'unavailable' as const, fallback: true }
}

// ── Flight search ─────────────────────────────────────────────────────────────
interface LegParam { from: string; to: string; date: string }

async function searchFlights(
  legs: LegParam[],
  adults: number,
  children: number,
  cabin: string,
) {
  if (!process.env.DUFFEL_ACCESS_TOKEN) {
    return { flights: [], source: 'unavailable' as const, fallback: true }
  }

  const cabinMap: Record<string, string> = {
    ECONOMY: 'economy',
    PREMIUM_ECONOMY: 'premium_economy',
    BUSINESS: 'business',
    FIRST: 'first',
  }
  const duffelCabin = cabinMap[cabin.toUpperCase()] ?? 'economy'

  const passengers: { type: 'adult' | 'child' }[] = [
    ...Array.from({ length: Math.max(1, adults) }, () => ({ type: 'adult' as const })),
    ...Array.from({ length: Math.max(0, children) }, () => ({ type: 'child' as const })),
  ]

  const slices = legs.map((l) => ({
    origin: l.from.toUpperCase().trim(),
    destination: l.to.toUpperCase().trim(),
    departure_date: l.date,
  }))

  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(
      'https://api.duffel.com/air/offer_requests?return_offers=true',
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${process.env.DUFFEL_ACCESS_TOKEN}`,
          'Duffel-Version': 'v2',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ data: { slices, passengers, cabin_class: duffelCabin } }),
      },
    )

    clearTimeout(tid)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.warn('[itinerary/research/flights] Duffel error', res.status, errText)
      return { flights: [], source: 'unavailable' as const, fallback: true }
    }

    const json = await res.json()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flights = (json.data?.offers ?? []).slice(0, 6).map((o: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sliceResults = (o.slices ?? []).map((slice: any) => {
        const firstSeg = slice?.segments?.[0]
        const lastSeg = slice?.segments?.at(-1)
        const stops = Math.max(0, (slice?.segments?.length ?? 1) - 1)
        return {
          airline:
            firstSeg?.marketing_carrier?.name ??
            firstSeg?.operating_carrier?.name ??
            'Unknown Airline',
          flightNumber: firstSeg
            ? `${firstSeg.marketing_carrier?.iata_code ?? ''}${firstSeg.marketing_carrier_flight_number ?? ''}`
            : '',
          departure: firstSeg?.departing_at ?? '',
          arrival: lastSeg?.arriving_at ?? '',
          duration: formatIsoDuration(slice?.duration ?? ''),
          stops,
        }
      })

      const first = sliceResults[0] ?? {}
      return {
        // top-level fields from first slice (backward-compat)
        airline: first.airline ?? 'Unknown Airline',
        flightNumber: first.flightNumber ?? '',
        departure: first.departure ?? '',
        arrival: first.arrival ?? '',
        duration: first.duration ?? '',
        stops: first.stops ?? 0,
        // all slices for multi-leg display
        slices: sliceResults,
        price: parseFloat(o.total_amount) || 0,
        currency: o.total_currency ?? 'GBP',
      }
    })

    return { flights, source: 'duffel' as const }
  } catch (err) {
    clearTimeout(tid)
    const isAbort = (err as Error).name === 'AbortError'
    console.warn('[itinerary/research/flights]', isAbort ? 'timeout' : err)
    return { flights: [], source: 'unavailable' as const, fallback: true }
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await params // id available on the route segment but not needed for this proxy

  const sp = new URL(req.url).searchParams
  const type = sp.get('type')

  if (type === 'hotels') {
    const destination = sp.get('destination') ?? ''
    const checkIn = sp.get('checkIn') ?? ''
    const checkOut = sp.get('checkOut') ?? ''
    const adults = Math.max(1, parseInt(sp.get('adults') ?? '2') || 2)
    const children = Math.max(0, parseInt(sp.get('children') ?? '0') || 0)
    const rooms = Math.max(1, parseInt(sp.get('rooms') ?? '1') || 1)
    const childAgesRaw = sp.get('childAges') ?? ''
    const childAges = childAgesRaw
      ? childAgesRaw.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n))
      : []

    if (!destination || !checkIn || !checkOut) {
      return NextResponse.json(
        { error: 'destination, checkIn and checkOut are required' },
        { status: 400 },
      )
    }

    const result = await searchHotels(destination, checkIn, checkOut, adults, children, childAges, rooms)
    return NextResponse.json(result)
  }

  if (type === 'flights') {
    const legsRaw = sp.get('legs') ?? ''
    const adults = Math.max(1, parseInt(sp.get('adults') ?? '1') || 1)
    const children = Math.max(0, parseInt(sp.get('children') ?? '0') || 0)
    const cabin = sp.get('cabin') ?? 'ECONOMY'

    let legs: LegParam[]
    try {
      legs = JSON.parse(legsRaw)
      if (!Array.isArray(legs) || legs.length === 0) throw new Error('empty')
      if (legs.some((l) => !l.from || !l.to || !l.date)) throw new Error('invalid')
    } catch {
      return NextResponse.json(
        { error: 'legs must be a JSON array of {from, to, date} objects' },
        { status: 400 },
      )
    }

    const result = await searchFlights(legs, adults, children, cabin)
    return NextResponse.json(result)
  }

  return NextResponse.json(
    { error: 'type must be "hotels" or "flights"' },
    { status: 400 },
  )
}
