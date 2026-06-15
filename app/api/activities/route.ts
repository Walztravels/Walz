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
      // ── STEP A: Cache API — get portfolio (no dates needed) ──────────────
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cacheData: any = await hotelbedsRequest(
          'activities-cache',
          `/portfolio?destination=${destCode}&limit=40&offset=0`,
        )

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawItems: any[] = Array.isArray(cacheData)
          ? cacheData
          : (cacheData?.activities ?? [])

        console.log('[HB Cache API]', destCode, 'count:', rawItems.length)

        hotelbedsActivities = rawItems
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((a: any) => ({
            ...mapHBActivity(a, destination),
            modalities: a.modalities ?? [],
          }))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((a: any) => a.title)
      } catch (cacheErr: unknown) {
        const msg = cacheErr instanceof Error ? cacheErr.message : String(cacheErr)
        console.error('[HB Cache API error]', msg)
      }

      // ── STEP B: Content API MULTI — enrich with images + descriptions ────
      if (hotelbedsActivities.length > 0) {
        try {
          const codes = hotelbedsActivities
            .slice(0, 40)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((a: any) => ({
              activityCode:  a.id,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              modalityCodes: (a.modalities ?? []).slice(0, 2).map((m: any) => m.code).filter(Boolean),
            }))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((c: any) => c.activityCode && c.modalityCodes.length > 0)

          if (codes.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const contentData: any = await hotelbedsRequest(
              'activities-content',
              '/activities',
              { method: 'POST', body: { codes, language: 'en' } },
            )

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const contentItems: any[] = Array.isArray(contentData)
              ? contentData
              : (contentData?.activities ?? [])

            console.log('[HB Content API] enriched:', contentItems.length)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const contentMap: Record<string, any> = {}
            for (const item of contentItems) {
              const code = item.code ?? item.activityCode
              if (code) contentMap[code] = item
            }

            hotelbedsActivities = hotelbedsActivities.map((a: any) => {
              const c = contentMap[a.id]
              if (!c) return a

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const images: any[] = c.media?.images ?? c.images ?? []
              const urlObj =
                images[0]?.urls?.find((u: any) => u.sizeType === 'LARGE' || u.sizeType === 'LARGE2') ??
                images[0]?.urls?.[0]
              const img = urlObj?.resource ?? c.media?.[0]?.url ?? a.image

              const rawDesc =
                c.content?.description ??
                c.description ??
                c.content?.briefDescription ??
                a.description ?? ''
              const desc = rawDesc.replace(/<[^>]*>/g, '').trim()

              const durMins = c.durationInMinutes ?? c.duration
              const duration = durMins
                ? durMins >= 1440
                  ? `${Math.round(durMins / 1440)} day${Math.round(durMins / 1440) > 1 ? 's' : ''}`
                  : durMins >= 60
                    ? `${Math.round(durMins / 60)} hr${Math.round(durMins / 60) > 1 ? 's' : ''}`
                    : `${durMins} min`
                : a.duration

              return { ...a, image: img || a.image, description: desc || a.description, duration }
            })
          }
        } catch (contentErr: unknown) {
          const msg = contentErr instanceof Error ? contentErr.message : String(contentErr)
          console.error('[HB Content API error]', msg)
        }
      }

      // ── STEP C: Booking API — get live prices ────────────────────────────
      if (hotelbedsActivities.length > 0) {
        try {
          const from = dateFrom ?? new Date().toISOString().slice(0, 10)
          const to   = dateTo   ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const priceData: any = await hotelbedsRequest(
            'activities',
            '/activities',
            {
              method: 'POST',
              body: {
                filters: [{ searchFilterItems: [{ type: 'destination', value: destCode }] }],
                from,
                to,
                language:   'en',
                pagination: { itemsPerPage: 40, page: 1 },
                order:      'DEFAULT',
              },
            },
          )

          const priceMap: Record<string, number> = {}
          const currMap:  Record<string, string> = {}

          for (const item of priceData?.activities ?? []) {
            const code  = item.code
            const price = parseFloat(item.amountFrom ?? item.amountsFrom?.[0]?.amount ?? '0')
            if (code && price > 0) {
              priceMap[code] = price
              currMap[code]  = item.currency ?? 'USD'
            }
          }

          console.log('[HB Booking API] prices for:', Object.keys(priceMap).length, 'activities')

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          hotelbedsActivities = hotelbedsActivities.map((a: any) => ({
            ...a,
            price:    priceMap[a.id] ?? a.price,
            currency: currMap[a.id]  ?? a.currency,
          }))
        } catch (priceErr: unknown) {
          const msg = priceErr instanceof Error ? priceErr.message : String(priceErr)
          console.error('[HB Booking API price error]', msg)
        }
      }

      // Strip internal modalities field before returning
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hotelbedsActivities = hotelbedsActivities.map(({ modalities: _m, ...rest }: any) => rest)
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
