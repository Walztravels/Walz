import { notFound }                              from 'next/navigation'
import { Suspense }                               from 'react'
import type { Metadata }                          from 'next'
import ActivityDetailClient                       from './ActivityDetailClient'
import { getActivityBySlug, STATIC_ACTIVITIES }  from '@/lib/activities-data'
import { hotelbedsRequest }                       from '@/lib/hotelbeds'
import prisma                                     from '@/lib/db'

// ── Image extraction (same shapes as main route) ──────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractImg(item: any): string {
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
  if (item.pictureList?.[0]?.numericId) {
    return `https://photos.hotelbeds.com/giata/${item.pictureList[0].numericId}.jpg`
  }
  return ''
}

// ── Resolve a live Hotelbeds hb- slug directly from HB APIs ──────────────────
async function resolveHBActivity(rawCode: string) {
  // Strategy 1: Content API GET — single activity, no modalityCodes needed
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await hotelbedsRequest(
      'activities-content',
      `/activities/${encodeURIComponent(rawCode)}?language=en`,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activity: any = data?.activity ?? (Array.isArray(data) ? data[0] : data)
    if (activity?.name || activity?.code) {
      return buildActivityShape(rawCode, activity, activity)
    }
  } catch { /* fall through */ }

  // Strategy 2: Cache API to get basic info + modalities, then Content API POST
  const DESTS = ['DXB', 'LON', 'PAR', 'NYC', 'NBO', 'JRO', 'CPT', 'BKK', 'SIN', 'IST', 'RAK', 'MLE']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cacheItem: any = null

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
      const found = items.find((a: any) => String(a.code).replace(/^hb-/, '') === rawCode)
      if (found) { cacheItem = found; break }
    } catch { /* try next dest */ }
  }

  if (!cacheItem) return null

  // Try to enrich with Content API POST using real modality codes
  const modalityCodes: string[] = (cacheItem.modalities ?? [])
    .slice(0, 3)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => m.code)
    .filter(Boolean)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let contentItem: any = null
  if (modalityCodes.length > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = await hotelbedsRequest(
        'activities-content',
        '/activities',
        { method: 'POST', body: { codes: [{ activityCode: rawCode, modalityCodes }], language: 'en' } },
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: any[] = Array.isArray(d) ? d : (d?.activities ?? [])
      contentItem = items[0] ?? null
    } catch { /* fall back to Cache data */ }
  }

  return buildActivityShape(rawCode, cacheItem, contentItem ?? cacheItem)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildActivityShape(rawCode: string, cacheItem: any, contentItem: any) {
  const img = extractImg(contentItem) || extractImg(cacheItem)

  const rawDesc: string = contentItem.content?.description ?? contentItem.description ?? ''
  const description = rawDesc.replace(/<[^>]*>/g, '').trim()

  const durationMins = cacheItem.durationInMinutes ?? contentItem.durationInMinutes ?? null
  const duration = durationMins
    ? durationMins >= 1440
      ? `${Math.round(durationMins / 1440)} days`
      : durationMins >= 60
        ? `${Math.round(durationMins / 60)} hrs`
        : `${durationMins} min`
    : ''

  return {
    id:          rawCode,
    slug:        `hb-${rawCode}`,
    title:       cacheItem.name ?? contentItem.name ?? rawCode,
    shortDesc:   contentItem.content?.briefDescription?.replace(/<[^>]*>/g, '').trim() ?? description.slice(0, 150),
    description,
    image:       img,
    price:       parseFloat(cacheItem.amountFrom ?? '0'),
    currency:    cacheItem.currency ?? 'USD',
    duration,
    location:    cacheItem.destination ?? cacheItem.country ?? '',
    category:    (cacheItem.activityFactsheetType ?? '').toLowerCase(),
    freeCancel:  false,
    rating:      0,
    highlights:  (contentItem.content?.highlights ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((h: any) => typeof h === 'string' ? h : (h.text ?? h.description ?? ''))
      .filter(Boolean),
    included:    (contentItem.content?.inclusions ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((i: any) => typeof i === 'string' ? i : (i.text ?? i.description ?? ''))
      .filter(Boolean),
    notIncluded: (contentItem.content?.exclusions ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((e: any) => typeof e === 'string' ? e : (e.text ?? e.description ?? ''))
      .filter(Boolean),
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

  // 3. Live Hotelbeds — call APIs directly (no round-trip through own routes)
  if (slug.startsWith('hb-')) {
    return resolveHBActivity(slug.replace(/^hb-/, ''))
  }

  return null
}

export async function generateStaticParams() {
  return STATIC_ACTIVITIES.map(a => ({ slug: a.slug }))
}

// Next.js 14 — params is a plain object, not a Promise
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
