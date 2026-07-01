import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest }         from '@/lib/hotelbeds'

export const dynamic = 'force-dynamic'

const TERMINAL_MAP: Record<string, string> = {
  // UK Airports — plain IATA codes
  'heathrow':           'LHR', 'lhr': 'LHR',
  'london heathrow':    'LHR',
  'gatwick':            'LGW', 'lgw': 'LGW',
  'london gatwick':     'LGW',
  'stansted':           'STN', 'stn': 'STN',
  'london stansted':    'STN',
  'luton':              'LTN', 'ltn': 'LTN',
  'london luton':       'LTN',
  'london city':        'LCY', 'lcy': 'LCY',
  'manchester':         'MAN', 'man': 'MAN',
  'birmingham':         'BHX', 'bhx': 'BHX',
  'edinburgh':          'EDI', 'edi': 'EDI',
  'glasgow':            'GLA', 'gla': 'GLA',
  'bristol':            'BRS', 'brs': 'BRS',
  // UAE
  'dubai':               'DXB', 'dxb': 'DXB',
  'dubai international': 'DXB',
  'abu dhabi':           'AUH', 'auh': 'AUH',
  // Africa
  'lagos':          'LOS', 'los': 'LOS',
  'accra':          'ACC', 'acc': 'ACC',
  'nairobi':        'NBO', 'nbo': 'NBO',
  'johannesburg':   'JNB', 'jnb': 'JNB',
  'cape town':      'CPT', 'cpt': 'CPT',
  'dar es salaam':  'DAR', 'dar': 'DAR',
  'zanzibar':       'ZNZ', 'znz': 'ZNZ',
  'kilimanjaro':    'JRO', 'jro': 'JRO',
  // Canada
  'toronto': 'YYZ', 'yyz': 'YYZ',
  'pearson': 'YYZ',
  'vancouver':'YVR', 'yvr': 'YVR',
  // Europe
  'paris':     'CDG', 'cdg': 'CDG',
  'amsterdam': 'AMS', 'ams': 'AMS',
  'rome':      'FCO', 'fco': 'FCO',
  'barcelona': 'BCN', 'bcn': 'BCN',
  'madrid':    'MAD', 'mad': 'MAD',
  'lisbon':    'LIS', 'lis': 'LIS',
  // Asia & Africa (cont.)
  'istanbul':  'IST', 'ist': 'IST',
  'bangkok':   'BKK', 'bkk': 'BKK',
  'singapore': 'SIN', 'sin': 'SIN',
  'cairo':     'CAI', 'cai': 'CAI',
  'marrakech': 'RAK', 'rak': 'RAK',
}

function resolveTerminal(name: string): string | null {
  const lower = name.toLowerCase().trim()
  if (TERMINAL_MAP[lower]) return TERMINAL_MAP[lower]
  for (const [key, code] of Object.entries(TERMINAL_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return code
  }
  return null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from     = searchParams.get('from')     ?? ''
  const to       = searchParams.get('to')       ?? ''
  const toType   = searchParams.get('toType')   ?? 'IATA'
  const date     = searchParams.get('date')     ?? ''
  const time     = searchParams.get('time')     ?? '10:00'
  const adults   = parseInt(searchParams.get('adults')   ?? '2')
  const children = parseInt(searchParams.get('children') ?? '0')

  if (!from || !to || !date) {
    return NextResponse.json({ error: 'Missing from, to, or date' }, { status: 400 })
  }

  const fromCode  = resolveTerminal(from)
  const fromParam = fromCode ?? from
  // For ATLAS codes (hotel) pass the raw code; for IATA resolve to terminal code
  const toParam   = toType === 'ATLAS' ? to : (resolveTerminal(to) ?? to)

  try {
    const outboundDateTime = `${date}T${time}:00`
    const path = `/availability/en/from/IATA/${fromParam}/to/${toType}/${toParam}/${outboundDateTime}/${adults}/${children}/0`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await hotelbedsRequest('transfers', path)

    console.log('[HB Transfers] GET', path, 'services:', data?.services?.length ?? 0, 'error:', data?.errors?.[0]?.message ?? null)
    console.log('[HB Transfers raw first service]', JSON.stringify({
      id:                 data?.services?.[0]?.id,
      price:              data?.services?.[0]?.price,
      vehicle:            data?.services?.[0]?.vehicle,
      contentImages:      data?.services?.[0]?.content?.images?.slice(0, 1),
      transferDetailInfo: data?.services?.[0]?.content?.transferDetailInfo,
    }))

    if (data?.errors?.length) {
      return NextResponse.json({ transfers: [], error: data.errors[0].message, debug: { path } })
    }

    // Guard: Hotelbeds returns undefined (not []) when no services are found
    const services: unknown[] = Array.isArray(data?.services) ? data.services : []

    if (services.length === 0) {
      return NextResponse.json({ transfers: [] })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transfers = services.map((s: any) => {
      const detailInfo: any[] = s.content?.transferDetailInfo ?? []
      const travelMin  = detailInfo.find((d: any) => d.id === 'TRFTIME')?.value
      const maxPax     = detailInfo.find((d: any) => d.id === 'MAXPAX')?.value
      const luggage    = detailInfo.find((d: any) => d.id === 'LUGGAGE')?.value
      return {
        id:         s.id ?? s.serviceId,
        name:       s.vehicle?.name ?? s.category?.name ?? 'Transfer',
        category:   s.category?.name ?? '',
        vehicle:    s.vehicle?.code ?? '',
        passengers: maxPax ? Number(maxPax) : null,
        bags:       luggage ? Number(luggage) : null,
        image:      s.content?.images?.[0]?.url ?? null,
        price:      s.price?.totalAmount ?? 0,
        currency:   s.price?.currencyId ?? 'GBP',
        duration:   travelMin ? `${travelMin} min` : null,
        type:       s.transferType ?? 'PRIVATE',
        rateKey:    s.rateKey ?? String(s.id ?? s.serviceId),
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).filter((t: any) => t.price > 0)

    return NextResponse.json({ transfers })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Transfers search error]', msg)
    return NextResponse.json({ transfers: [], error: msg })
  }
}
