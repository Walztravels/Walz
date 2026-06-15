import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { hotelbedsRequest } from '@/lib/hotelbeds'
import { STATIC_ACTIVITIES } from '@/lib/activities-data'

// ── Destination name → Hotelbeds destination code ──────────────────────────
const DEST_MAP: Record<string, string> = {
  'dubai':           'DXB',
  'dubai uae':       'DXB',
  'uae':             'DXB',
  'abu dhabi':       'AUH',
  'london':          'LON',
  'united kingdom':  'LON',
  'uk':              'LON',
  'england':         'LON',
  'paris':           'PAR',
  'france':          'PAR',
  'new york':        'NYC',
  'usa':             'NYC',
  'united states':   'NYC',
  'lagos':           'LOS',
  'nigeria':         'LOS',
  'abuja':           'ABV',
  'accra':           'ACC',
  'ghana':           'ACC',
  'nairobi':         'NBO',
  'kenya':           'NBO',
  'tanzania':        'DAR',
  'dar es salaam':   'DAR',
  'zanzibar':        'ZNZ',
  'serengeti':       'JRO',
  'kilimanjaro':     'JRO',
  'cape town':       'CPT',
  'south africa':    'CPT',
  'johannesburg':    'JNB',
  'toronto':         'YTO',
  'canada':          'YTO',
  'vancouver':       'YVR',
  'amsterdam':       'AMS',
  'netherlands':     'AMS',
  'rome':            'ROM',
  'italy':           'ROM',
  'barcelona':       'BCN',
  'spain':           'BCN',
  'madrid':          'MAD',
  'lisbon':          'LIS',
  'portugal':        'LIS',
  'cairo':           'CAI',
  'egypt':           'CAI',
  'marrakech':       'RAK',
  'morocco':         'RAK',
  'istanbul':        'IST',
  'turkey':          'IST',
  'bangkok':         'BKK',
  'thailand':        'BKK',
  'singapore':       'SIN',
  'tokyo':           'TYO',
  'japan':           'TYO',
  'bali':            'DPS',
  'indonesia':       'DPS',
  'maldives':        'MLE',
  'mauritius':       'MRU',
  'seychelles':      'SEZ',
}

function resolveDestCode(name: string): string | null {
  const lower = name.toLowerCase().trim()
  if (DEST_MAP[lower]) return DEST_MAP[lower]
  for (const [key, code] of Object.entries(DEST_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return code
  }
  return null
}

// ── Map Hotelbeds activity → our Activity shape ─────────────────────────────
const CAT_MAP: Record<string, string> = {
  'TOUR':       'culture',
  'EXCURSION':  'adventure',
  'SAFARI':     'wildlife',
  'SPORT':      'adventure',
  'SPORTS':     'adventure',
  'CRUISE':     'beach',
  'BOAT':       'beach',
  'FOOD':       'food',
  'FOOD&DRINK': 'food',
  'CULTURE':    'culture',
  'ART':        'culture',
  'NATURE':     'wildlife',
  'OUTDOOR':    'adventure',
  'TRANSFER':   'adventure',
  'HELICOPTER': 'air',
  'AIR':        'air',
}

function mapHBCategory(codes: string[]): string {
  for (const c of codes) {
    const mapped = CAT_MAP[c?.toUpperCase()]
    if (mapped) return mapped
  }
  return 'adventure'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapHBActivity(a: any, destName: string): object {
  // Image: handle both GET (a.media[]) and POST (a.content.media.images[].urls[]) response shapes
  const contentImg = (() => {
    const imgs: { urls?: { sizeType: string; resource: string }[] }[] = a.content?.media?.images ?? []
    const urlObj = imgs[0]?.urls?.find(u => u.sizeType === 'LARGE' || u.sizeType === 'LARGE2') ?? imgs[0]?.urls?.[0]
    return urlObj?.resource ?? null
  })()

  const img =
    a.media?.find((m: { type: string; url: string }) => m.type === 'PHOTO' || m.type === 'photo')?.url ||
    a.media?.[0]?.url ||
    contentImg ||
    a.images?.[0]?.url ||
    a.content?.images?.[0]?.url ||
    ''

  const categoryCodes = [
    a.activityFactsheetType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(a.categories ?? []).map((c: any) => c.code ?? c),
  ].filter(Boolean)

  // Price: handle amountFrom (GET) and amountsFrom[0].amount (POST) shapes
  const price = parseFloat(
    a.amountFrom ??
    a.amountsFrom?.[0]?.amount ??
    a.rates?.[0]?.rateDetails?.[0]?.totalAmount ??
    a.minRate ??
    '0'
  )

  const durationMins: number | null = a.durationInMinutes ?? a.duration ?? null
  const durationStr = durationMins
    ? durationMins >= 1440
      ? `${Math.round(durationMins / 1440)} day${Math.round(durationMins / 1440) > 1 ? 's' : ''}`
      : durationMins >= 60
        ? `${Math.round(durationMins / 60)} hour${Math.round(durationMins / 60) > 1 ? 's' : ''}`
        : `${durationMins} mins`
    : ''

  const rawDesc: string = a.content?.description ?? a.content?.briefDescription ?? ''
  const cleanDesc = rawDesc.replace(/<[^>]*>/g, '').trim()

  return {
    id:          String(a.code),
    slug:        `hb-${a.code}`,
    title:       a.name ?? a.content?.name ?? 'Activity',
    shortDesc:   a.content?.briefDescription?.replace(/<[^>]*>/g, '').trim() ?? cleanDesc.slice(0, 150),
    description: cleanDesc,
    image:       img,
    price,
    currency:    a.currency ?? 'USD',
    duration:    durationStr,
    location:    destName,
    category:    mapHBCategory(categoryCodes),
    badge:       null,
    source:      'hotelbeds',
  }
}

// ── Route handler ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const featured    = searchParams.get('featured') === 'true'
  const category    = searchParams.get('category')
  const destination = searchParams.get('destination')?.trim() ?? ''
  const q           = searchParams.get('q')?.trim() ?? ''
  const dateFrom    = searchParams.get('from')
  const dateTo      = searchParams.get('to')
  const search      = q || destination

  // ── 1. DB activities (admin-curated) ──────────────────────────────────────
  const dbActivities = await prisma.activity.findMany({
    where: {
      isPublished: true,
      ...(featured ? { isFeatured: true } : {}),
      ...(category ? { category }          : {}),
      ...(search ? {
        OR: [
          { title:       { contains: search, mode: 'insensitive' } },
          { location:    { contains: search, mode: 'insensitive' } },
          { category:    { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })

  // ── 2. Hotelbeds Activities API (live results) ────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let hotelbedsActivities: any[] = []

  if (destination) {
    const destCode = resolveDestCode(destination)

    if (destCode) {
      try {
        const from = dateFrom ?? new Date().toISOString().slice(0, 10)
        const to   = dateTo   ?? new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)

        const adultsCount = parseInt(searchParams.get('adults') ?? '2')
        const paxes = Array.from({ length: Math.max(1, adultsCount) }, () => ({ age: 30 }))

        const qs = new URLSearchParams({
          destination: destCode,
          fromDate:    from,
          toDate:      to,
          language:    'en',
          limit:       '40',
          offset:      '0',
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await hotelbedsRequest('activities', `/activities?${qs}`)

        console.log('[HB Activities] GET', destCode, 'count:', data?.activities?.length ?? 0, 'error:', data?.errors?.[0]?.text ?? null)

        if (Array.isArray(data?.activities)) {
          hotelbedsActivities = data.activities
            .map((a: object) => mapHBActivity(a, destination))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((a: any) => a.title && a.price > 0)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Hotelbeds Activities error]', msg)
      }
    } else {
      console.warn('[Hotelbeds Activities] No dest code for:', destination)
    }
  }

  // ── 3. Merge: DB first, then Hotelbeds live ───────────────────────────────
  const combined = [...dbActivities, ...hotelbedsActivities]

  // ── 4. Static fallback only when completely empty ─────────────────────────
  if (combined.length === 0) {
    const lower    = search.toLowerCase()
    const statics  = lower
      ? STATIC_ACTIVITIES.filter(a =>
          a.location.toLowerCase().includes(lower) ||
          a.title.toLowerCase().includes(lower) ||
          a.description.toLowerCase().includes(lower)
        )
      : STATIC_ACTIVITIES
    return NextResponse.json({ activities: statics, source: 'static' })
  }

  return NextResponse.json({ activities: combined })
}
