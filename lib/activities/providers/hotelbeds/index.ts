import { hotelbedsRequest } from '@/lib/hotelbeds'
import { applyActivityMarkup } from '../../pricing'
import type {
  ActivityProvider,
  ActivitySearchParams,
  NormalizedActivity,
  AvailabilityParams,
  ActivityAvailability,
  ActivityBookingResult,
  BookingParams,
} from '../../types'

// ── Destination name → Hotelbeds destination code ────────────────────────────
export const HB_DEST_MAP: Record<string, string> = {
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

export function resolveHBDestCode(name: string): string | null {
  const lower = name.toLowerCase().trim()
  if (HB_DEST_MAP[lower]) return HB_DEST_MAP[lower]
  for (const [key, code] of Object.entries(HB_DEST_MAP)) {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapHBCategory(codes: any[]): string {
  for (const c of codes) {
    const mapped = CAT_MAP[c?.toUpperCase?.()]
    if (mapped) return mapped
  }
  return 'adventure'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractHBImages(item: any): string[] {
  const seen = new Set<string>()
  const add = (url: string | undefined | null) => {
    if (url?.startsWith('https')) seen.add(url)
  }

  // item.media?.images or item.images — array of { urls: [{ sizeType, resource }], url? }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imgList: any[] = item.media?.images ?? item.images ?? []
  for (const img of imgList) {
    const urlArr = Array.isArray(img.urls) ? img.urls : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of urlArr) {
      add((u as { resource?: string }).resource)
    }
    add((img as { url?: string }).url)
  }

  // item.pictureList — [{ numericId }] → https://photos.hotelbeds.com/giata/{numericId}.jpg
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pictureList: any[] = item.pictureList ?? []
  for (const p of pictureList) {
    if (p.numericId) add(`https://photos.hotelbeds.com/giata/${p.numericId}.jpg`)
  }

  // item.content?.media?.images
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subImages: any[] = item.content?.media?.images ?? []
  for (const img of subImages) {
    const urlArr = Array.isArray(img.urls) ? img.urls : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of urlArr) {
      add((u as { resource?: string }).resource)
    }
    add((img as { url?: string }).url)
  }

  // item.multimedia — array of { url?, resource?, path? }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const multimedia: any[] = Array.isArray(item.multimedia) ? item.multimedia : []
  for (const m of multimedia) {
    add(m.url ?? m.resource ?? m.path)
  }

  // flat item.media array
  if (Array.isArray(item.media)) {
    for (const m of item.media as { url?: string; resource?: string }[]) {
      add(m.url ?? m.resource)
    }
  }

  // item.media object (not array)
  if (typeof item.media === 'object' && !Array.isArray(item.media) && item.media !== null) {
    const m = item.media as { url?: string; resource?: string }
    add(m.url ?? m.resource)
  }

  return Array.from(seen)
}

function durationText(minutes: number | null | undefined): string {
  if (!minutes) return ''
  if (minutes >= 1440) {
    const d = Math.round(minutes / 1440)
    return `${d} day${d > 1 ? 's' : ''}`
  }
  if (minutes >= 60) {
    const h = Math.round(minutes / 60)
    return `${h} hr${h > 1 ? 's' : ''}`
  }
  return `${minutes} min`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapHBToNormalized(a: any, destName: string): NormalizedActivity {
  const imgs = extractHBImages(a)
  const categoryCodes = [
    a.activityFactsheetType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(a.categories ?? []).map((c: any) => c.code ?? c),
  ].filter(Boolean)

  const supplierNetPrice = parseFloat(
    a.amountFrom ??
    a.amountsFrom?.[0]?.amount ??
    a.rates?.[0]?.rateDetails?.[0]?.totalAmount ??
    a.minRate ??
    '0'
  )

  const { sellingPrice } = applyActivityMarkup(supplierNetPrice, 'HOTELBEDS', a.currency ?? 'USD')

  const rawDesc: string = a.content?.description ?? a.content?.briefDescription ?? ''
  const description = rawDesc.replace(/<[^>]*>/g, '').trim()

  const freeCancellation: boolean = !!(
    a.freeCancellationAvailable === true ||
    a.freeCancel === true ||
    (Array.isArray(a.cancellationPolicies) && a.cancellationPolicies.length === 0)
  )

  const rawRating = a.overallValuation ?? a.valuations?.[0]?.average ?? a.valuations?.[0]?.value
  const rating = rawRating ? parseFloat(String(rawRating)) || undefined : undefined

  const code = String(a.code)
  const durationMins: number | null = a.durationInMinutes ?? a.duration ?? null

  return {
    id:                `HOTELBEDS-${code}`,
    supplier:          'HOTELBEDS',
    supplierProductId: code,
    slug:              `hb-${code}`,

    title:            a.name ?? a.content?.name ?? 'Activity',
    shortDescription: (a.content?.briefDescription?.replace(/<[^>]*>/g, '').trim() ?? description.slice(0, 150)) || undefined,
    description:      description || undefined,

    destination: { name: destName, code: resolveHBDestCode(destName) ?? undefined },

    images: imgs.map((url, idx) => ({ url, isCover: idx === 0 })),

    rating,
    duration: { text: durationText(durationMins), minMinutes: durationMins ?? undefined },

    categories:      mapHBCategory(categoryCodes) ? [mapHBCategory(categoryCodes)] : [],
    freeCancellation,
    currency:         a.currency ?? 'USD',
    sellingPrice,
    supplierNetPrice,
    source:           'hotelbeds',
  }
}

// ── HotelbedsActivityProvider ─────────────────────────────────────────────────

export class HotelbedsActivityProvider implements ActivityProvider {
  readonly name = 'HOTELBEDS' as const

  async search(params: ActivitySearchParams): Promise<NormalizedActivity[]> {
    const destCode = resolveHBDestCode(params.destination)
    if (!destCode) {
      console.warn('[HotelbedsActivityProvider] No dest code for:', params.destination)
      return []
    }

    // STEP A: Cache API portfolio
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let activities: any[] = []
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cacheData: any = await hotelbedsRequest(
        'activities-cache',
        `/portfolio?destination=${destCode}&limit=100&offset=0`,
      )
      const rawItems = Array.isArray(cacheData) ? cacheData : (cacheData?.activities ?? [])
      activities = rawItems
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((a: any) => ({ ...mapHBToNormalized(a, params.destination), _modalities: a.modalities ?? [] }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((a: any) => a.title)
    } catch (err) {
      console.error('[HotelbedsActivityProvider] Cache API error:', err instanceof Error ? err.message : err)
      return []
    }

    if (activities.length === 0) return []

    // STEP B: Content API enrichment
    try {
      const codes = activities
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((a: any) => a.supplierProductId && a._modalities?.length > 0)
        .slice(0, 100)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((a: any) => ({
          activityCode:  a.supplierProductId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          modalityCodes: (a._modalities as any[]).slice(0, 3).map((m: any) => m.code).filter(Boolean),
        }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((c: any) => c.activityCode && c.modalityCodes.length > 0)

      if (codes.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let contentItems: any[] = []
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const contentData: any = await hotelbedsRequest(
            'activities-content', '/activities', { method: 'POST', body: { codes, language: 'en' } },
          )
          contentItems = Array.isArray(contentData)
            ? contentData
            : (contentData?.activitiesContent ?? contentData?.activities ?? [])
        } catch { /* fall through to GET fallback */ }

        if (contentItems.length === 0) {
          const BATCH = 8
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const getResults: any[] = []
          for (let bi = 0; bi < codes.length; bi += BATCH) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const slice = (codes as any[]).slice(bi, bi + BATCH)
            const batchData = await Promise.all(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              slice.map(async (c: any) => {
                const firstMod = c.modalityCodes?.[0]
                if (!c.activityCode || !firstMod) return null
                try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const raw: any = await hotelbedsRequest(
                    'activities-content',
                    `/activities/en/${encodeURIComponent(c.activityCode)}/${encodeURIComponent(firstMod)}`,
                  )
                  const inner = raw?.activitiesContent?.[0] ?? raw
                  return inner ? { ...inner, code: c.activityCode, activityCode: c.activityCode } : null
                } catch { return null }
              }),
            )
            getResults.push(...batchData.filter(Boolean))
          }
          contentItems = getResults
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contentMap: Record<string, any> = {}
        for (const item of contentItems) {
          const code = String(item.code ?? item.activityCode ?? '')
          if (code) contentMap[code] = item
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activities = activities.map((a: any) => {
          const c = contentMap[a.supplierProductId]
          if (!c) return a

          const contentImgs = extractHBImages(c)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const existingUrls = new Set((a.images ?? []).map((i: any) => i.url as string))
          const mergedImages = [
            ...(a.images ?? []),
            ...contentImgs.filter(u => !existingUrls.has(u)).map(url => ({ url })),
          ]
          const rawDesc = c.content?.description ?? c.description ?? c.content?.briefDescription ?? a.description ?? ''
          const description = rawDesc.replace(/<[^>]*>/g, '').trim()

          const durationMins = c.durationInMinutes ?? c.duration
          const freeCancellation: boolean = a.freeCancellation || !!(
            c.freeCancellationAvailable === true ||
            (Array.isArray(c.cancellationPolicies) && c.cancellationPolicies.length === 0)
          )
          const rawRating = c.overallValuation ?? c.valuations?.[0]?.average
          const rating = rawRating ? parseFloat(String(rawRating)) || a.rating : a.rating

          return {
            ...a,
            images: mergedImages.length > 0 ? mergedImages : a.images,
            description:     description || a.description,
            duration:        durationMins ? { text: durationText(durationMins), minMinutes: durationMins } : a.duration,
            freeCancellation,
            rating,
          }
        })
      }
    } catch (err) {
      console.error('[HotelbedsActivityProvider] Content API error:', err instanceof Error ? err.message : err)
    }

    // STEP C: Booking API live prices
    try {
      const from = params.dateFrom ?? new Date().toISOString().slice(0, 10)
      const to   = params.dateTo   ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const priceData: any = await hotelbedsRequest('activities', '/activities', {
        method: 'POST',
        body: {
          filters: [{ searchFilterItems: [{ type: 'destination', value: destCode }] }],
          from, to, language: 'en',
          pagination: { itemsPerPage: 100, page: 1 },
          order: 'DEFAULT',
        },
      })

      const priceMap: Record<string, number> = {}
      const currMap:  Record<string, string>  = {}
      for (const item of priceData?.activities ?? []) {
        const code  = String(item.code ?? '')
        const price = parseFloat(item.amountFrom ?? item.amountsFrom?.[0]?.amount ?? '0')
        if (code && price > 0) {
          priceMap[code] = price
          currMap[code]  = item.currency ?? 'USD'
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activities = activities.map((a: any) => {
        const liveCost = priceMap[a.supplierProductId]
        if (!liveCost) return a
        const { sellingPrice } = applyActivityMarkup(liveCost, 'HOTELBEDS', currMap[a.supplierProductId] ?? a.currency)
        return { ...a, supplierNetPrice: liveCost, sellingPrice, currency: currMap[a.supplierProductId] ?? a.currency }
      })
    } catch (err) {
      console.error('[HotelbedsActivityProvider] Booking API price error:', err instanceof Error ? err.message : err)
    }

    // Drop internal _modalities field
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return activities.map(({ _modalities: _m, ...rest }: any) => rest as NormalizedActivity)
  }

  async getProduct(supplierProductId: string): Promise<NormalizedActivity> {
    const code = supplierProductId.replace(/^hb-/, '')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = await hotelbedsRequest(
      'activities-content',
      `/activities/en/${encodeURIComponent(code)}`,
    )
    const item = raw?.activitiesContent?.[0] ?? raw
    return mapHBToNormalized({ ...item, code }, item.destinations?.[0]?.name ?? '')
  }

  async checkAvailability(params: AvailabilityParams): Promise<ActivityAvailability> {
    const destCode = resolveHBDestCode(params.destination ?? '')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await hotelbedsRequest('activities', '/activities', {
      method: 'POST',
      body: {
        filters: destCode
          ? [{ searchFilterItems: [{ type: 'destination', value: destCode }] }]
          : [],
        from: params.date,
        to:   params.date,
        language: 'en',
        pagination: { itemsPerPage: 1, page: 1 },
        order: 'DEFAULT',
      },
    })

    const activity = data?.activities?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any) => String(a.code) === params.supplierProductId,
    )

    if (!activity) return { available: false, options: [], currency: params.currency ?? 'USD' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options = (activity.modalities ?? []).map((m: any) => {
      const supplierNetPrice = parseFloat(m.amountsFrom?.[0]?.amount ?? '0')
      const { sellingPrice } = applyActivityMarkup(supplierNetPrice, 'HOTELBEDS', activity.currency ?? 'USD')
      return {
        code:             m.code,
        name:             m.name,
        sellingPrice,
        supplierNetPrice,
        currency:         activity.currency ?? 'USD',
        duration:         m.duration ?? undefined,
        freeCancellation: !!(m.freeCancellationAvailable),
      }
    })

    return { available: options.length > 0, options, currency: activity.currency ?? 'USD' }
  }

  async book(params: BookingParams): Promise<ActivityBookingResult> {
    const apiKey = process.env.HOTELBEDS_ACTIVITIES_API_KEY
    const secret = process.env.HOTELBEDS_ACTIVITIES_SECRET
    if (!apiKey || !secret) throw new Error('HOTELBEDS_ACTIVITIES_API_KEY/SECRET not set')

    const { createHash } = await import('crypto')
    const ts   = Math.floor(Date.now() / 1000)
    const sig  = createHash('sha256').update(apiKey + secret + ts).digest('hex')
    const env  = process.env.HOTELBEDS_ENV === 'production' ? 'api.hotelbeds.com' : 'api.test.hotelbeds.com'
    const url  = `https://${env}/activity-api/3.0/bookings`

    const adults   = params.adults ?? 1
    const children = params.children ?? 0
    const paxes = [
      ...Array.from({ length: adults },   () => ({ age: 30, paxType: 'ADULT' })),
      ...Array.from({ length: children }, () => ({ age: 10, paxType: 'CHILD' })),
    ]

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Api-key':       apiKey,
        'X-Signature':   sig,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify({
        language: 'en',
        holder: {
          name:       params.holderName.split(' ')[0] ?? params.holderName,
          surname:    params.holderName.split(' ').slice(1).join(' ') || params.holderName,
          email:      params.holderEmail,
          telephones: params.holderPhone ? [params.holderPhone] : [],
        },
        activities: [{
          activityCode: params.supplierProductId,
          modality:     { code: params.modalityCode ?? '' },
          serviceDate:  params.date,
          paxes,
          questions:    [],
        }],
        clientReference: params.walzReference,
        remark: `Walz Travels · ${params.holderEmail} · ${params.paymentGateway ?? 'stripe'} · ${params.paymentReference ?? ''}`,
      }),
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bd: any = await res.json()
    const supplierReference = bd.booking?.reference ?? bd.reference

    if (!res.ok || !supplierReference) {
      return { success: false, walzReference: params.walzReference, status: 'FAILED', error: bd.message ?? 'HB booking failed' }
    }

    return {
      success: true,
      walzReference: params.walzReference,
      supplierReference,
      status: 'CONFIRMED',
    }
  }
}
