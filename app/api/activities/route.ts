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

// ── Category mapping ─────────────────────────────────────────────────────────
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

// ── Exhaustive image extraction across all known HB response shapes ──────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractHBImage(item: any): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imgList: any[] = item.media?.images ?? item.images ?? []

  for (const img of imgList) {
    // Shape 1: Content API — urls[{sizeType, resource}]
    const urlArr = Array.isArray(img.urls) ? img.urls : []
    const pick =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      urlArr.find((u: any) => u.sizeType === 'LARGE' || u.sizeType === 'LARGE2') ??
      urlArr[0]
    const resource = (pick as { resource?: string })?.resource
    if (resource?.startsWith('http')) return resource

    // Shape 2: Cache API — images[{url: "..."}]  (direct url field, no urls array)
    if ((img as { url?: string }).url?.startsWith('http')) return (img as { url: string }).url
  }

  // Shape 3: Cache API — media as flat array [{url, resource}]
  const mediaArr: { url?: string; resource?: string }[] =
    Array.isArray(item.media) ? item.media : []
  for (const m of mediaArr) {
    if (m.url?.startsWith('http'))      return m.url
    if (m.resource?.startsWith('http')) return m.resource
  }

  // Shape 4: GIATA picture list
  if (item.pictureList?.[0]?.numericId) {
    return `https://photos.hotelbeds.com/giata/${item.pictureList[0].numericId}.jpg`
  }

  // Shape 5: content sub-object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subImages: any[] = item.content?.media?.images ?? []
  for (const img of subImages) {
    const url = img.urls?.[0]?.resource ?? img.url
    if (url?.startsWith('http')) return url
  }

  return ''
}

// ── Map a Cache API activity to our shape ────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapHBActivity(a: any, destName: string): object {
  const img = extractHBImage(a)

  const categoryCodes = [
    a.activityFactsheetType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(a.categories ?? []).map((c: any) => c.code ?? c),
  ].filter(Boolean)

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

  const freeCancel: boolean = !!(
    a.freeCancellationAvailable === true ||
    a.freeCancel === true ||
    (Array.isArray(a.cancellationPolicies) && a.cancellationPolicies.length === 0)
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRating = a.overallValuation ?? a.valuations?.[0]?.average ?? a.valuations?.[0]?.value
  const rating: number | null = rawRating ? parseFloat(String(rawRating)) || null : null

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
    freeCancel,
    rating,
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
      // ── STEP A: Cache API — get portfolio ────────────────────────────────
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
        console.error('[HB Cache API error]', {
          message: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
          stack:   cacheErr instanceof Error ? cacheErr.stack?.slice(0, 300) : undefined,
        })
      }

      // ── STEP B: Content API MULTI — enrich with images + descriptions ────
      if (hotelbedsActivities.length > 0) {
        try {
          // Content API requires non-empty modalityCodes — filter out activities
          // with no modalities (they'd return 0 results and can pollute the batch)
          const codes = hotelbedsActivities
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((a: any) => a.id && a.modalities?.length > 0)
            .slice(0, 40)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((a: any) => ({
              activityCode:  String(a.id).replace(/^hb-/, ''),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              modalityCodes: (a.modalities as any[])
                .slice(0, 3)
                .map((m: any) => m.code)
                .filter((c: unknown) => c && typeof c === 'string'),
            }))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((c: any) => c.activityCode && c.modalityCodes.length > 0)

          console.log('[HB Content API] codes to enrich:', JSON.stringify(codes.slice(0, 2)))

          if (codes.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let contentItems: any[] = []

            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const contentData: any = await hotelbedsRequest(
                'activities-content',
                '/activities',
                { method: 'POST', body: { codes, language: 'en' } },
              )

              // Log raw shape to diagnose empty-array returns
              console.log('[HB Content API] POST raw keys:', contentData ? Object.keys(contentData) : 'null')
              console.log('[HB Content API] POST raw preview:', JSON.stringify(contentData).slice(0, 300))

              contentItems = Array.isArray(contentData)
                ? contentData
                : (contentData?.activities ?? contentData?.data ?? contentData?.content ?? contentData?.results ?? [])

              console.log('[HB Content API] POST enriched:', contentItems.length, 'of', codes.length)
            } catch (postErr: unknown) {
              console.warn('[HB Content API] POST failed:', postErr instanceof Error ? postErr.message : postErr)
            }

            // Fallback to individual GET /activities/{lang}/{code}/{modality}
            // when the bulk POST returns 0 — same endpoint as [code]/route.ts
            if (contentItems.length === 0) {
              console.log('[HB Content API] POST=0 → falling back to per-activity GET')
              const BATCH = 8
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const getResults: any[] = []
              for (let bi = 0; bi < codes.length; bi += BATCH) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const batchSlice = (codes as any[]).slice(bi, bi + BATCH)
                const batchData = await Promise.all(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  batchSlice.map(async (c: any) => {
                    const firstMod = c.modalityCodes?.[0]
                    if (!c.activityCode || !firstMod) return null
                    try {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const item: any = await hotelbedsRequest(
                        'activities-content',
                        `/activities/en/${encodeURIComponent(c.activityCode)}/${encodeURIComponent(firstMod)}`,
                      )
                      return item ? { ...item, code: c.activityCode, activityCode: c.activityCode } : null
                    } catch { return null }
                  }),
                )
                getResults.push(...batchData.filter(Boolean))
              }
              contentItems = getResults
              console.log('[HB Content API] GET fallback enriched:', contentItems.length, 'of', codes.length)
              if (contentItems[0]) {
                console.log('[HB Content API] GET first item keys:', Object.keys(contentItems[0]))
                console.log('[HB Content API] GET first item images:',
                  JSON.stringify(contentItems[0]?.media?.images?.[0]?.urls?.[0]))
              }
            }

            // Key content map by RAW code (no hb- prefix)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const contentMap: Record<string, any> = {}
            for (const item of contentItems) {
              const code = String(item.code ?? item.activityCode ?? '').replace(/^hb-/, '')
              if (code) contentMap[code] = item
            }

            hotelbedsActivities = hotelbedsActivities.map((a: any) => {
              // BUG FIX: look up by raw code (strip hb- prefix from a.id)
              const rawCode = String(a.id).replace(/^hb-/, '')
              const c = contentMap[rawCode]
              if (!c) return a

              const img = extractHBImage(c) || a.image

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

              // Enrich freeCancel and rating from Content API data too
              const freeCancel: boolean = a.freeCancel || !!(
                c.freeCancellationAvailable === true ||
                (Array.isArray(c.cancellationPolicies) && c.cancellationPolicies.length === 0)
              )
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const rawRating = c.overallValuation ?? c.valuations?.[0]?.average ?? c.valuations?.[0]?.value
              const rating = rawRating ? parseFloat(String(rawRating)) || a.rating : a.rating

              return { ...a, image: img, description: desc || a.description, duration, freeCancel, rating }
            })
          }
        } catch (contentErr: unknown) {
          console.error('[HB Content API FULL ERROR]', {
            message: contentErr instanceof Error ? contentErr.message : String(contentErr),
            stack:   contentErr instanceof Error ? contentErr.stack?.slice(0, 300) : undefined,
          })
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

          // Booking API returns raw codes (no hb- prefix) — key map by raw code
          const priceMap: Record<string, number> = {}
          const currMap:  Record<string, string> = {}

          for (const item of priceData?.activities ?? []) {
            const code  = String(item.code ?? '').replace(/^hb-/, '')
            const price = parseFloat(item.amountFrom ?? item.amountsFrom?.[0]?.amount ?? '0')
            if (code && price > 0) {
              priceMap[code] = price
              currMap[code]  = item.currency ?? 'USD'
            }
          }

          console.log('[HB Booking API] prices for:', Object.keys(priceMap).length, 'activities')

          // BUG FIX: look up by raw code (strip hb- prefix from a.id)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          hotelbedsActivities = hotelbedsActivities.map((a: any) => {
            const rawCode = String(a.id).replace(/^hb-/, '')
            return {
              ...a,
              price:    priceMap[rawCode] ?? a.price,
              currency: currMap[rawCode]  ?? a.currency,
            }
          })
        } catch (priceErr: unknown) {
          console.error('[HB Booking API FULL ERROR]', {
            message: priceErr instanceof Error ? priceErr.message : String(priceErr),
            stack:   priceErr instanceof Error ? priceErr.stack?.slice(0, 300) : undefined,
          })
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
    const lower   = search.toLowerCase()
    const statics = lower
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
