import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest }         from '@/lib/hotelbeds'

export const dynamic = 'force-dynamic'

const TERMINAL_MAP: Record<string, string> = {
  // UK
  'heathrow':       'LHRTM', 'lhr': 'LHRTM',
  'gatwick':        'LGWTM', 'lgw': 'LGWTM',
  'stansted':       'STNTM', 'stn': 'STNTM',
  'luton':          'LTNTM', 'ltn': 'LTNTM',
  'london city':    'LCYTM', 'lcy': 'LCYTM',
  'manchester':     'MANTM', 'man': 'MANTM',
  'birmingham':     'BHXTM', 'bhx': 'BHXTM',
  'edinburgh':      'EDITM', 'edi': 'EDITM',
  // UAE
  'dubai':               'DXBTM', 'dxb': 'DXBTM',
  'dubai international': 'DXBTM',
  'abu dhabi':           'AUHTM', 'auh': 'AUHTM',
  // Africa
  'lagos':        'LOSTM', 'los': 'LOSTM',
  'accra':        'ACCTM', 'acc': 'ACCTM',
  'nairobi':      'NBOTM', 'nbo': 'NBOTM',
  'johannesburg': 'JNBTM', 'jnb': 'JNBTM',
  'cape town':    'CPTTM', 'cpt': 'CPTTM',
  'dar es salaam':'DARTM', 'dar': 'DARTM',
  // Americas
  'toronto': 'YTOTM', 'yto': 'YTOTM',
  'pearson': 'YTOTM',
  'vancouver':'YVRTM', 'yvr': 'YVRTM',
  // Europe
  'paris':     'CDGTM', 'cdg': 'CDGTM',
  'amsterdam': 'AMSTM', 'ams': 'AMSTM',
  'rome':      'FCOTM', 'fco': 'FCOTM',
  'barcelona': 'BCNTM', 'bcn': 'BCNTM',
  'madrid':    'MADTM', 'mad': 'MADTM',
  // Asia
  'istanbul':  'ISTTM', 'ist': 'ISTTM',
  'bangkok':   'BKKTM', 'bkk': 'BKKTM',
  'singapore': 'SINTM', 'sin': 'SINTM',
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
  const date     = searchParams.get('date')     ?? ''
  const time     = searchParams.get('time')     ?? '10:00'
  const adults   = parseInt(searchParams.get('adults')   ?? '2')
  const children = parseInt(searchParams.get('children') ?? '0')

  if (!from || !to || !date) {
    return NextResponse.json({ error: 'Missing from, to, or date' }, { status: 400 })
  }

  const fromCode = resolveTerminal(from)
  const toCode   = resolveTerminal(to)
  const fromParam = fromCode ?? from
  const toParam   = toCode   ?? to

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await hotelbedsRequest(
      'transfers',
      '/availability',
      {
        method: 'POST',
        body: {
          language: 'en',
          fromType: fromCode ? 'IATA'  : 'ATLAS',
          from:     fromParam,
          toType:   toCode   ? 'IATA'  : 'ATLAS',
          to:       toParam,
          outbound: { date, time },
          paxes: [
            ...Array.from({ length: adults   }, () => ({ type: 'ADULT', age: 30 })),
            ...Array.from({ length: children }, () => ({ type: 'CHILD', age: 8  })),
          ],
          paginationData: { itemsPerPage: 20, pageNumber: 1 },
        },
      },
    )

    console.log('[HB Transfers]', fromParam, '→', toParam, 'results:', data?.services?.length ?? 0, 'error:', data?.errors?.[0]?.text ?? null)

    if (data?.errors?.length) {
      return NextResponse.json({ transfers: [], error: data.errors[0].text, debug: { fromCode, toCode } })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transfers = (data?.services ?? []).map((s: any) => ({
      id:         s.id ?? s.code,
      name:       s.vehicle?.name ?? s.name ?? 'Transfer',
      category:   s.category?.name ?? s.category ?? '',
      vehicle:    s.vehicle?.type ?? s.vehicleType ?? '',
      passengers: s.vehicle?.maxPax ?? s.maxPassengers ?? adults,
      bags:       s.vehicle?.maxBaggage ?? null,
      image:      s.vehicle?.images?.[0]?.url ?? s.images?.[0]?.url ?? null,
      price:      parseFloat(s.price?.totalAmount ?? s.netAmount ?? '0'),
      currency:   s.price?.currency ?? s.currency ?? 'GBP',
      duration:   s.travelTime ? `${Math.round(s.travelTime / 60)} min` : null,
      type:       s.transferType ?? s.type ?? 'PRIVATE',
      rateKey:    s.rateKey ?? s.id,
      description:s.description ?? '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })).filter((t: any) => t.price > 0)

    return NextResponse.json({ transfers })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Transfers search error]', msg)
    return NextResponse.json({ transfers: [], error: msg })
  }
}
