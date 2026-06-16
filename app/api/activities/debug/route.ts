import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export const dynamic = 'force-dynamic'

const DEST_MAP: Record<string, string> = {
  dubai: 'DXB', london: 'LON', paris: 'PAR', 'new york': 'NYC',
  nairobi: 'NBO', serengeti: 'JRO', 'cape town': 'CPT',
}

export async function GET(req: NextRequest) {
  const dest     = req.nextUrl.searchParams.get('destination') ?? 'dubai'
  const destCode = DEST_MAP[dest.toLowerCase()] ?? dest.toUpperCase()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = { destCode }

  // ── 1. Cache API ─────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let firstActivity: any = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await hotelbedsRequest(
      'activities-cache',
      `/portfolio?destination=${destCode}&limit=3&offset=0`,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Array.isArray(data) ? data : (data?.activities ?? [])
    firstActivity = items[0] ?? null
    out.cacheApi = {
      success:   true,
      count:     items.length,
      firstCode: firstActivity?.code ?? null,
      // Show the full structure of the first item to diagnose field names
      firstItemKeys:  firstActivity ? Object.keys(firstActivity) : [],
      firstItemFull:  firstActivity,
    }
  } catch (e: unknown) {
    out.cacheApi = { success: false, error: String(e) }
  }

  const rawCode = firstActivity ? String(firstActivity.code).replace(/^hb-/, '') : null
  out.rawCode = rawCode

  // ── 2. Content API — POST batch ───────────────────────────────────────────
  if (rawCode) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await hotelbedsRequest(
        'activities-content',
        '/activities',
        {
          method: 'POST',
          body:   { codes: [{ activityCode: rawCode, modalityCodes: [] }], language: 'en' },
        },
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: any[] = Array.isArray(data) ? data : (data?.activities ?? [])
      out.contentApiPost = {
        success:        true,
        topLevelKeys:   Object.keys(data ?? {}),
        count:          items.length,
        firstItemKeys:  items[0] ? Object.keys(items[0]) : [],
        firstItemFull:  items[0] ?? null,
      }
    } catch (e: unknown) {
      out.contentApiPost = { success: false, error: String(e) }
    }
  }

  // ── 3. Content API — GET single ───────────────────────────────────────────
  if (rawCode) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await hotelbedsRequest(
        'activities-content',
        `/activities/${encodeURIComponent(rawCode)}?language=en`,
      )
      out.contentApiGet = {
        success:        true,
        topLevelKeys:   Object.keys(data ?? {}),
        firstItemKeys:  data?.activity ? Object.keys(data.activity) : (data ? Object.keys(data) : []),
        firstItemFull:  data,
      }
    } catch (e: unknown) {
      out.contentApiGet = { success: false, error: String(e) }
    }
  }

  // ── 4. Booking API — current format ──────────────────────────────────────
  const from = new Date().toISOString().slice(0, 10)
  const to   = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await hotelbedsRequest(
      'activities',
      '/activities',
      {
        method: 'POST',
        body: {
          filters: [{ searchFilterItems: [{ type: 'destination', value: destCode }] }],
          from,
          to,
          language:   'en',
          pagination: { itemsPerPage: 3, page: 1 },
          order:      'DEFAULT',
        },
      },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Array.isArray(data) ? data : (data?.activities ?? [])
    out.bookingApiFilters = {
      success:        true,
      topLevelKeys:   Object.keys(data ?? {}),
      count:          items.length,
      firstItemKeys:  items[0] ? Object.keys(items[0]) : [],
      firstItemFull:  items[0] ?? null,
    }
  } catch (e: unknown) {
    out.bookingApiFilters = { success: false, error: String(e) }
  }

  // ── 5. Booking API — alternative destination format ───────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await hotelbedsRequest(
      'activities',
      `/activities?destination=${destCode}&from=${from}&to=${to}&language=en&limit=3&offset=0`,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Array.isArray(data) ? data : (data?.activities ?? [])
    out.bookingApiGet = {
      success:        true,
      topLevelKeys:   Object.keys(data ?? {}),
      count:          items.length,
      firstItemKeys:  items[0] ? Object.keys(items[0]) : [],
      firstItemFull:  items[0] ?? null,
    }
  } catch (e: unknown) {
    out.bookingApiGet = { success: false, error: String(e) }
  }

  return NextResponse.json(out, { status: 200 })
}
