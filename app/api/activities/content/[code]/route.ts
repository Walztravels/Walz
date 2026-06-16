import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest }          from '@/lib/hotelbeds'

export const dynamic = 'force-dynamic'

// Common destinations to search when we don't know the destination for a slug
const DEST_CODES = ['DXB', 'LON', 'PAR', 'NYC', 'NBO', 'JRO', 'CPT', 'BKK', 'SIN', 'IST']

// Fetch the real modality codes for a given activity code from the Cache API.
// Tries each destination until the activity is found (or returns [] as fallback).
async function getModalitiesForCode(
  hbCode: string,
  hintDest?: string,
): Promise<string[]> {
  const destsToTry = hintDest
    ? [hintDest, ...DEST_CODES.filter(d => d !== hintDest)]
    : DEST_CODES

  for (const dest of destsToTry) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cacheData: any = await hotelbedsRequest(
        'activities-cache',
        `/portfolio?destination=${dest}&limit=100&offset=0`,
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: any[] = Array.isArray(cacheData)
        ? cacheData
        : (cacheData?.activities ?? [])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = items.find((a: any) => String(a.code).replace(/^hb-/, '') === hbCode)
      if (found?.modalities?.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return found.modalities.map((m: any) => m.code).filter(Boolean).slice(0, 3)
      }
    } catch {
      // try next destination
    }
  }
  return []
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractImg(item: any): string {
  const images: { urls?: { sizeType: string; resource: string }[] }[] =
    item.media?.images ?? item.images ?? []
  for (const img of images) {
    const urlArr = Array.isArray(img.urls) ? img.urls : []
    const pick =
      urlArr.find((u: { sizeType: string }) => u.sizeType === 'LARGE' || u.sizeType === 'LARGE2') ??
      urlArr[0]
    const res = (pick as { resource?: string })?.resource
    if (res?.startsWith('http')) return res
  }
  if (item.pictureList?.[0]?.numericId) {
    return `https://photos.hotelbeds.com/giata/${item.pictureList[0].numericId}.jpg`
  }
  return ''
}

// Next.js 14 — params is a plain object, not a Promise
export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const rawCode    = decodeURIComponent(params.code).replace(/^hb-/, '')
  const language   = new URL(req.url).searchParams.get('language') ?? 'en'
  const hintDest   = new URL(req.url).searchParams.get('destination') ?? undefined

  // Get real modality codes so Content API returns results
  const modalityCodes = await getModalitiesForCode(rawCode, hintDest)
  console.log('[Content /[code]] modalityCodes for', rawCode, ':', modalityCodes)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await hotelbedsRequest(
      'activities-content',
      '/activities',
      {
        method: 'POST',
        body: {
          codes: [{
            activityCode:  rawCode,
            modalityCodes,
          }],
          language,
        },
      },
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Array.isArray(data) ? data : (data?.activities ?? [])
    const activity = items[0]

    if (!activity) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 })
    }

    const img = extractImg(activity)

    const rawDesc: string = activity.content?.description ?? activity.description ?? ''
    const description = rawDesc.replace(/<[^>]*>/g, '').trim()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const highlights: string[] = (activity.content?.highlights ?? []).map((h: any) =>
      typeof h === 'string' ? h : h.text ?? h.description ?? ''
    ).filter(Boolean)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inclusions: string[] = (activity.content?.inclusions ?? []).map((i: any) =>
      typeof i === 'string' ? i : i.text ?? i.description ?? ''
    ).filter(Boolean)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exclusions: string[] = (activity.content?.exclusions ?? []).map((e: any) =>
      typeof e === 'string' ? e : e.text ?? e.description ?? ''
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

    return NextResponse.json({
      activity: {
        id:          rawCode,
        slug:        `hb-${rawCode}`,
        title:       activity.name ?? activity.title ?? '',
        shortDesc:   activity.content?.briefDescription?.replace(/<[^>]*>/g, '').trim() ?? description.slice(0, 150),
        description,
        image:       img,
        duration,
        location:    activity.country ?? '',
        category:    activity.type ?? activity.activityFactsheetType ?? '',
        highlights,
        inclusions,
        exclusions,
        freeCancel,
        rating,
        price:       0,
        currency:    'USD',
        badge:       null,
        source:      'hotelbeds',
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Activity Content API]', rawCode, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
