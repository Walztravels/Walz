import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }  from '@/lib/admin-auth'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export const dynamic     = 'force-dynamic'
export const maxDuration = 30

const ISO2_TO_DEST: Record<string, string> = {
  GB: 'LON', IE: 'DUB', FR: 'PAR', DE: 'BER', ES: 'MAD', IT: 'ROM',
  NL: 'AMS', PT: 'LIS', BE: 'BRU', AT: 'VIE', CH: 'ZRH', SE: 'STO',
  DK: 'CPH', NO: 'OSL', PL: 'WAW', GR: 'ATH', CZ: 'PRG', HU: 'BUD',
  US: 'NYC', CA: 'TOR', AU: 'SYD', NZ: 'AKL',
  AE: 'DXB', QA: 'DOH', SA: 'RUH', BH: 'BAH', KW: 'KWI', OM: 'MCT',
  TR: 'IST', EG: 'CAI', MA: 'CAS', ZA: 'JNB', KE: 'NBI', GH: 'ACC',
  NG: 'LOS', ET: 'ADD', SN: 'DKR', CI: 'ABJ',
  IN: 'BOM', SG: 'SIN', JP: 'TYO', CN: 'BJS', KR: 'SEL', TH: 'BKK',
  MY: 'KUL', PH: 'MNL', BR: 'RIO', MX: 'MEX', AR: 'BUE', CO: 'BOG',
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp      = new URL(req.url).searchParams
  const iso2    = sp.get('iso2')?.toUpperCase() ?? ''
  const checkIn = sp.get('checkIn') ?? ''
  const checkOut= sp.get('checkOut') ?? ''
  const guests  = parseInt(sp.get('guests') ?? '1') || 1

  const destCode = ISO2_TO_DEST[iso2]
  if (!destCode)          return NextResponse.json({ error: `No destination mapping for country ${iso2}` }, { status: 400 })
  if (!checkIn || !checkOut) return NextResponse.json({ error: 'checkIn and checkOut required' }, { status: 400 })

  try {
    const data = await hotelbedsRequest('hotel', '/hotels', {
      method: 'POST',
      body: {
        sourceMarket:  'GB',
        stay:          { checkIn, checkOut },
        occupancies:   [{ rooms: 1, adults: Math.max(1, guests), children: 0 }],
        destination:   { code: destCode },
        filter:        { maxHotels: 20, minCategory: 3, maxRatesPerRoom: 2 },
        currency:      'GBP',
        language:      'ENG',
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hotels = (data.hotels?.hotels ?? []).map((h: any) => ({
      code:         String(h.code),
      name:         h.name,
      stars:        h.categoryCode ? String(h.categoryCode).replace(/\D/g, '') : '',
      address:      h.zoneName ? `${h.zoneName}, ${h.destinationName}` : (h.destinationName ?? ''),
      minRate:      h.minRate  ?? null,
      currency:     h.currency ?? 'GBP',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hasFreeCanel: (h.rooms ?? []).some((r: any) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r.rates ?? []).some((rate: any) => rate.rateClass !== 'NRF')
      ),
    }))

    return NextResponse.json({ hotels, destCode, total: data.hotels?.total ?? 0 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
