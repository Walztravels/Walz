import { notFound }                              from 'next/navigation'
import { Suspense }                               from 'react'
import type { Metadata }                          from 'next'
import ActivityDetailClient                       from './ActivityDetailClient'
import { getActivityBySlug, STATIC_ACTIVITIES }  from '@/lib/activities-data'
import { hotelbedsRequest }                       from '@/lib/hotelbeds'
import prisma                                     from '@/lib/db'

// ── Destination code → readable city name ─────────────────────────────────────
const DEST_CODE_TO_NAME: Record<string, string> = {
  LON: 'London',    DXB: 'Dubai',       PAR: 'Paris',       NYC: 'New York',
  AUH: 'Abu Dhabi', NBO: 'Nairobi',    JRO: 'Kilimanjaro', CPT: 'Cape Town',
  JNB: 'Johannesburg', BKK: 'Bangkok', SIN: 'Singapore',   IST: 'Istanbul',
  RAK: 'Marrakech', MLE: 'Maldives',   MRU: 'Mauritius',   SEZ: 'Seychelles',
  BCN: 'Barcelona', MAD: 'Madrid',     LIS: 'Lisbon',       ROM: 'Rome',
  AMS: 'Amsterdam', CAI: 'Cairo',      LOS: 'Lagos',        ABV: 'Abuja',
  ACC: 'Accra',     DAR: 'Dar es Salaam', ZNZ: 'Zanzibar', DPS: 'Bali',
  TYO: 'Tokyo',     YTO: 'Toronto',    YVR: 'Vancouver',
}

// ── Image extraction — mirrors all shapes from app/api/activities/route.ts ────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractImg(item: any): string {
  if (!item) return ''

  // Shape 1: media.images[{urls:[{sizeType,resource}]}] — Hotel/content API
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imgList: any[] = item.media?.images ?? item.images ?? []
  for (const img of imgList) {
    const urlArr = Array.isArray(img.urls) ? img.urls : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pick = urlArr.find((u: any) => u.sizeType === 'LARGE' || u.sizeType === 'LARGE2') ?? urlArr[0]
    const res = (pick as { resource?: string })?.resource
    if (res?.startsWith('http')) return res
    if ((img as { url?: string }).url?.startsWith('http')) return (img as { url: string }).url
  }

  // Shape 2: GIATA picture list
  if (item.pictureList?.[0]?.numericId) {
    return `https://photos.hotelbeds.com/giata/${item.pictureList[0].numericId}.jpg`
  }

  // Shape 3: content sub-object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subImages: any[] = item.content?.media?.images ?? []
  for (const img of subImages) {
    const url = img.urls?.[0]?.resource ?? img.url
    if (url?.startsWith('http')) return url
  }

  // Shape 4: Activity Content API v3 — multimedia [{type, url}]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const multimedia: any[] = Array.isArray(item.multimedia) ? item.multimedia : []
  for (const m of multimedia) {
    const url: string | undefined = m.url ?? m.resource ?? m.path
    if (url?.startsWith('http')) return url
  }

  // Shape 5: media as flat array
  const mediaArr: { url?: string; resource?: string }[] = Array.isArray(item.media) ? item.media : []
  for (const m of mediaArr) {
    if (m.url?.startsWith('http')) return m.url
    if (m.resource?.startsWith('http')) return m.resource
  }

  // Shape 6: media as object with direct url
  if (item.media && typeof item.media === 'object' && !Array.isArray(item.media)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const url = (item.media as any).url ?? (item.media as any).resource
    if (typeof url === 'string' && url.startsWith('http')) return url
  }

  return ''
}

// ── Pull text from Activity Content API v3 featureGroups ──────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromFeatureGroups(groups: any[], ...codes: string[]): string {
  for (const code of codes) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const group = groups.find((g: any) => g.groupCode === code)
    if (!group) continue
    const texts: string[] = (group.included ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((i: any) => (i.des ?? i.description ?? '').trim())
      .filter(Boolean)
    if (texts.length > 0) return texts.join('\n')
  }
  return ''
}

// ── Resolve a live hb-* activity via Hotelbeds APIs ───────────────────────────
async function resolveHBActivity(rawCode: string) {
  const DESTS = [
    'LON','DXB','PAR','NYC','NBO','BKK','SIN','IST','CPT','RAK',
    'MLE','JRO','AUH','BCN','ROM','AMS','TYO','DPS','LOS','ABV','ACC',
    'DAR','ZNZ','YTO','YVR','MAD','LIS','CAI','MRU','SEZ','JNB',
  ]

  // Content API and Cache scan run in parallel — fastest combined result
  const [contentResult, cacheResult] = await Promise.allSettled([
    // Content API POST (no modalityCodes needed for single-activity detail)
    hotelbedsRequest('activities-content', '/activities', {
      method: 'POST',
      body: { codes: [{ activityCode: rawCode }], language: 'en' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).then((d: any) => d?.activitiesContent?.[0] ?? null).catch(() => null),

    // Cache API — sequential dest scan for price, modalities, destination name
    (async () => {
      for (const dest of DESTS) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d: any = await hotelbedsRequest(
            'activities-cache',
            `/portfolio?destination=${dest}&limit=100&offset=0`,
          )
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const items: any[] = Array.isArray(d) ? d : (d?.activities ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const found = items.find((a: any) =>
            String(a.code ?? a.id).replace(/^hb-/, '') === rawCode
          )
          if (found) return { item: found, dest }
        } catch { /* try next */ }
      }
      return null
    })(),
  ])

  const contentItem = contentResult.status === 'fulfilled' ? contentResult.value : null
  const cacheFound  = cacheResult.status  === 'fulfilled' ? cacheResult.value  : null
  const cacheItem   = cacheFound?.item ?? null
  const destCode    = cacheFound?.dest ?? ''

  if (!cacheItem && !contentItem) return null

  // If POST returned no content, fall back to GET /activities/en/{code}/{modality}
  let enrichedContent = contentItem
  if (!enrichedContent && cacheItem) {
    const firstMod: string | undefined = (cacheItem.modalities ?? [])[0]?.code
    if (firstMod) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw: any = await hotelbedsRequest(
          'activities-content',
          `/activities/en/${encodeURIComponent(rawCode)}/${encodeURIComponent(firstMod)}`,
        )
        enrichedContent = raw?.activitiesContent?.[0] ?? null
      } catch { /* use cache data only */ }
    }
  }

  return buildActivityShape(rawCode, cacheItem, enrichedContent, destCode)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildActivityShape(rawCode: string, cacheItem: any, contentItem: any, destCode = '') {
  const cache   = cacheItem   ?? {}
  const content = contentItem ?? {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: any[] = content.featureGroups ?? []

  // Image — try content item first, then cache item
  const img = extractImg(content) || extractImg(cache)

  // Description — Activity Content API v3 puts it in featureGroups
  const rawDesc =
    fromFeatureGroups(groups, 'DESCRIPTION', 'OVERVIEW', 'ABOUT', 'BRIEFDESCRIPTION') ||
    content.description         ||
    content.shortDescription    ||
    content.content?.description ||
    cache.content?.description  ||
    cache.description           ||
    ''
  const description = rawDesc.replace(/<[^>]*>/g, '').trim()

  // Duration
  const durMins: number | null = cache.durationInMinutes ?? content.durationInMinutes ?? null
  const duration = durMins
    ? durMins >= 1440
      ? `${Math.round(durMins / 1440)} day${Math.round(durMins / 1440) !== 1 ? 's' : ''}`
      : durMins >= 60
        ? `${Math.round(durMins / 60)} hr${Math.round(durMins / 60) !== 1 ? 's' : ''}`
        : `${durMins} min`
    : ''

  // Location — map raw dest code (e.g. "LON") to readable city name
  const rawDest = destCode || cache.destination || cache.country || ''
  const location = DEST_CODE_TO_NAME[rawDest] ?? rawDest

  // Price — from cache portfolio (amountFrom); content API doesn't carry pricing
  const price = parseFloat(cache.amountFrom ?? cache.minAmount ?? '0')

  // Highlights
  const highlightGroup = groups.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (g: any) => g.groupCode === 'HIGHLIGHTS' || g.groupCode === 'HIGHLIGHT_LIST'
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const highlights: string[] = (highlightGroup?.included ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((i: any) => (i.des ?? i.description ?? '').trim())
    .filter(Boolean)

  // Included
  const includesGroup = groups.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (g: any) => ['INCLUDES', 'INCLUDED', 'INCLUSIONS'].includes(g.groupCode)
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const included: string[] = (includesGroup?.included ?? content.content?.inclusions ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((i: any) => typeof i === 'string' ? i : (i.des ?? i.text ?? i.description ?? ''))
    .filter(Boolean)

  // Not included
  const excludesGroup = groups.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (g: any) => ['EXCLUDES', 'EXCLUDED', 'EXCLUSIONS'].includes(g.groupCode)
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notIncluded: string[] = (excludesGroup?.included ?? content.content?.exclusions ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any) => typeof e === 'string' ? e : (e.des ?? e.text ?? e.description ?? ''))
    .filter(Boolean)

  return {
    id:          rawCode,
    slug:        `hb-${rawCode}`,
    title:       cache.name ?? content.name ?? rawCode,
    shortDesc:   description.slice(0, 150),
    description,
    image:       img,
    price,
    currency:    cache.currency ?? 'USD',
    duration,
    location,
    category:    (cache.activityFactsheetType ?? content.category ?? '').toLowerCase(),
    freeCancel:  false,
    rating:      0,
    highlights,
    included,
    notIncluded,
    source:      'hotelbeds',
  }
}

// ── Main data resolver ────────────────────────────────────────────────────────
async function getActivityData(slug: string) {
  // 1. DB (admin-curated)
  try {
    const db = await prisma.activity.findUnique({ where: { slug, isPublished: true } })
    if (db) return db
  } catch {}

  // 2. Static activities
  const staticAct = getActivityBySlug(slug)
  if (staticAct) return staticAct

  // 3. Live Hotelbeds
  if (slug.startsWith('hb-')) {
    return resolveHBActivity(slug.replace(/^hb-/, ''))
  }

  return null
}

export async function generateStaticParams() {
  return STATIC_ACTIVITIES.map(a => ({ slug: a.slug }))
}

export async function generateMetadata(
  { params }: { params: { slug: string } }
): Promise<Metadata> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a: any = await getActivityData(params.slug)
  if (!a) return { title: 'Activity' }
  return {
    title:       a.title,
    description: (a.shortDesc ?? a.description ?? '').slice(0, 160),
  }
}

export default async function ActivityDetailPage(
  { params }: { params: { slug: string } }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activity: any = await getActivityData(params.slug)
  if (!activity) return notFound()

  return (
    <Suspense>
      <ActivityDetailClient activity={activity} />
    </Suspense>
  )
}
