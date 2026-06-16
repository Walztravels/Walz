import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest }          from '@/lib/hotelbeds'

export const dynamic = 'force-dynamic'

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shapeActivity(rawCode: string, activity: any) {
  const img = extractImg(activity)

  const rawDesc: string = activity.content?.description ?? activity.description ?? ''
  const description = rawDesc.replace(/<[^>]*>/g, '').trim()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const highlights: string[] = (activity.content?.highlights ?? []).map((h: any) =>
    typeof h === 'string' ? h : (h.text ?? h.description ?? '')
  ).filter(Boolean)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inclusions: string[] = (activity.content?.inclusions ?? []).map((i: any) =>
    typeof i === 'string' ? i : (i.text ?? i.description ?? '')
  ).filter(Boolean)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exclusions: string[] = (activity.content?.exclusions ?? []).map((e: any) =>
    typeof e === 'string' ? e : (e.text ?? e.description ?? '')
  ).filter(Boolean)

  const durationMins: number | null = activity.durationInMinutes ?? activity.duration ?? null
  const duration = durationMins
    ? durationMins >= 1440
      ? `${Math.round(durationMins / 1440)} days`
      : durationMins >= 60
        ? `${Math.round(durationMins / 60)} hours`
        : `${durationMins} min`
    : ''

  const freeCancel: boolean = !!(
    activity.freeCancellationAvailable === true ||
    (Array.isArray(activity.cancellationPolicies) && activity.cancellationPolicies.length === 0)
  )

  const rawRating = activity.overallValuation ?? activity.valuations?.[0]?.average
  const rating    = rawRating ? parseFloat(String(rawRating)) || 0 : 0

  return {
    id:          rawCode,
    slug:        `hb-${rawCode}`,
    title:       activity.name ?? activity.title ?? '',
    shortDesc:   activity.content?.briefDescription?.replace(/<[^>]*>/g, '').trim() ?? description.slice(0, 150),
    description,
    image:       img,
    duration,
    location:    activity.country ?? activity.destination ?? '',
    category:    (activity.type ?? activity.activityFactsheetType ?? '').toLowerCase(),
    highlights,
    inclusions,
    exclusions,
    freeCancel,
    rating,
    price:       parseFloat(activity.amountFrom ?? activity.minRate ?? '0'),
    currency:    activity.currency ?? 'USD',
    badge:       null,
    source:      'hotelbeds',
  }
}

// Next.js 14 — params is a plain object, not a Promise
export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const rawCode  = decodeURIComponent(params.code).replace(/^hb-/, '')
  const language = new URL(req.url).searchParams.get('language') ?? 'en'

  // Strategy 1: Content API GET endpoint (no modalityCodes required)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await hotelbedsRequest(
      'activities-content',
      `/activities/${encodeURIComponent(rawCode)}?language=${language}`,
    )

    // Response might be { activity: {...} } or the object directly or [...]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activity: any = data?.activity ?? (Array.isArray(data) ? data[0] : data)

    if (activity?.name || activity?.code) {
      console.log('[Content GET] found via GET endpoint, code:', rawCode)
      return NextResponse.json({ activity: shapeActivity(rawCode, activity) })
    }
  } catch (getErr: unknown) {
    console.log('[Content GET] GET endpoint failed:', getErr instanceof Error ? getErr.message : String(getErr))
  }

  // Strategy 2: Content API POST — search Cache API first to get modalityCodes
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
    } catch { /* try next */ }
  }

  if (cacheItem) {
    // Try Content API POST with real modality codes
    const modalityCodes: string[] = (cacheItem.modalities ?? [])
      .slice(0, 3)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((m: any) => m.code)
      .filter(Boolean)

    if (modalityCodes.length > 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await hotelbedsRequest(
          'activities-content',
          '/activities',
          { method: 'POST', body: { codes: [{ activityCode: rawCode, modalityCodes }], language } },
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items: any[] = Array.isArray(data) ? data : (data?.activities ?? [])
        if (items[0]) {
          console.log('[Content GET] found via POST with modalities, code:', rawCode)
          return NextResponse.json({ activity: shapeActivity(rawCode, { ...cacheItem, ...items[0] }) })
        }
      } catch { /* fall through to Cache-only response */ }
    }

    // Last resort: return what we have from Cache API (at least name + basic fields)
    console.log('[Content GET] falling back to Cache API data for', rawCode)
    return NextResponse.json({ activity: shapeActivity(rawCode, cacheItem) })
  }

  return NextResponse.json({ error: 'Activity not found' }, { status: 404 })
}
