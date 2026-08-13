import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// ── Common city name → Hotelbeds destination code ────────────────────────────
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

function resolveDestCode(destination: string): string {
  const key = destination.toLowerCase().trim()
  if (CITY_TO_DEST[key]) return CITY_TO_DEST[key]
  // Try prefix match for city names with extra words (e.g. "Paris, France")
  for (const [city, code] of Object.entries(CITY_TO_DEST)) {
    if (key.startsWith(city)) return code
  }
  // Fall back to first 3 chars uppercased (best-effort)
  return destination.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'LON'
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

// ── Hotel search ─────────────────────────────────────────────────────────────
async function searchHotels(
  destination: string,
  checkIn: string,
  checkOut: string,
  adults: number,
  children: number,
  childAges: number[],
  rooms: number,
) {
  if (!process.env.HOTELBEDS_HOTEL_API_KEY || !process.env.HOTELBEDS_HOTEL_SECRET) {
    return { hotels: [], source: 'unavailable' as const, fallback: true }
  }

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
    // hotelbedsRequest internally uses its own fetch — we wrap in a race-condition
    // abort via a Promise.race so the timeout still applies.
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
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('HotelbedsTimeout')), 8000),
      ),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hotels = (data.hotels?.hotels ?? []).slice(0, 10).map((h: any) => {
      const starsStr = String(h.categoryCode ?? '').replace(/\D/g, '')
      const stars = parseInt(starsStr) || 0
      const minRate = parseFloat(h.minRate) || 0
      const imgPath = h.images?.[0]?.path
      const thumbnailUrl = imgPath
        ? `https://photos.hotelbeds.com/giata/small/${imgPath}`
        : undefined
      return {
        name: h.name ?? 'Unknown Hotel',
        stars,
        address: h.zoneName
          ? `${h.zoneName}, ${h.destinationName ?? destination}`
          : (h.destinationName ?? destination),
        price: minRate,
        currency: h.currency ?? 'GBP',
        thumbnailUrl,
      }
    })

    return { hotels, source: 'hotelbeds' as const }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[itinerary/research/hotels]', msg)
    return { hotels: [], source: 'unavailable' as const, fallback: true }
  }
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
