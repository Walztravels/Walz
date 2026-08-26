import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { HotelbedsActivityProvider } from '@/lib/activities/providers/hotelbeds'
import { ViatorActivityProvider }    from '@/lib/activities/providers/viator'
import type { NormalizedActivity, ActivitySearchParams } from '@/lib/activities/types'
import { rankActivities, filterUnusableActivities } from '@/lib/activities/ranking'

export const dynamic = 'force-dynamic'

// Admin-only unified activity search — returns supplier net cost visible to admin
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { destination, dateFrom, dateTo, adults = 1, children = 0, currency = 'GBP' } = body

  if (!destination) return NextResponse.json({ error: 'destination is required' }, { status: 400 })

  const params: ActivitySearchParams = { destination, dateFrom, dateTo, adults, children, currency }

  const [hbResult, viatorResult] = await Promise.allSettled([
    new HotelbedsActivityProvider().search(params),
    process.env.VIATOR_ACTIVITIES_ENABLED === 'true' && process.env.VIATOR_API_KEY
      ? new ViatorActivityProvider().search(params)
      : Promise.resolve([] as NormalizedActivity[]),
  ])

  const hbActivities     = hbResult.status     === 'fulfilled' ? hbResult.value     : []
  const viatorActivities = viatorResult.status === 'fulfilled' ? viatorResult.value : []

  // Admin sees supplierNetPrice — do NOT strip it here
  // Rank: Viator before Hotelbeds, quality sort within each supplier group
  const activities = rankActivities(filterUnusableActivities([...hbActivities, ...viatorActivities]))

  return NextResponse.json({
    activities,
    meta: {
      hotelbeds: { count: hbActivities.length,     error: hbResult.status     === 'rejected' ? String(hbResult.reason)     : undefined },
      viator:    { count: viatorActivities.length, error: viatorResult.status === 'rejected' ? String(viatorResult.reason) : undefined },
    },
  })
}
