import { NextResponse }       from 'next/server'
import { getAdminSession }    from '@/lib/admin-auth'
import { hotelbedsRequest }   from '@/lib/hotelbeds'

// In-memory cache — results are good for 2 minutes
interface HealthResult { status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN'; latencyMs?: number; lastChecked: number }
const cache = new Map<string, HealthResult>()
const CACHE_TTL_MS = 2 * 60 * 1000
const PROBE_TIMEOUT_MS = 5000

function probe<T>(fn: () => Promise<T>, name: string): Promise<HealthResult> {
  const start = Date.now()
  return Promise.race([
    fn().then((): HealthResult => ({ status: 'ONLINE', latencyMs: Date.now() - start, lastChecked: Date.now() })),
    new Promise<HealthResult>(resolve =>
      setTimeout(() => resolve({ status: 'DEGRADED', lastChecked: Date.now() }), PROBE_TIMEOUT_MS)
    ),
  ]).catch((): HealthResult => ({ status: 'OFFLINE', lastChecked: Date.now() }))
}

async function duffelHealth(): Promise<HealthResult> {
  const cached = cache.get('DUFFEL')
  if (cached && Date.now() - cached.lastChecked < CACHE_TTL_MS) return cached
  if (!process.env.DUFFEL_ACCESS_TOKEN) return { status: 'UNKNOWN', lastChecked: Date.now() }
  const result = await probe(async () => {
    const res = await fetch('https://api.duffel.com/air/aircraft?limit=1', {
      headers: { Authorization: `Bearer ${process.env.DUFFEL_ACCESS_TOKEN}`, 'Duffel-Version': 'v1' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  }, 'DUFFEL')
  cache.set('DUFFEL', result)
  return result
}

async function hotelbedsHotelsHealth(): Promise<HealthResult> {
  const cached = cache.get('HB_HOTELS')
  if (cached && Date.now() - cached.lastChecked < CACHE_TTL_MS) return cached
  if (!process.env.HOTELBEDS_HOTEL_API_KEY) return { status: 'UNKNOWN', lastChecked: Date.now() }
  const result = await probe(async () => {
    await hotelbedsRequest('hotel', '/types/boards?fields=name&from=1&to=1', { method: 'GET' })
  }, 'HB_HOTELS')
  cache.set('HB_HOTELS', result)
  return result
}

async function hotelbedsTransfersHealth(): Promise<HealthResult> {
  const cached = cache.get('HB_TRANSFERS')
  if (cached && Date.now() - cached.lastChecked < CACHE_TTL_MS) return cached
  if (!process.env.HOTELBEDS_TRANSFERS_API_KEY) return { status: 'UNKNOWN', lastChecked: Date.now() }
  const result = await probe(async () => {
    await hotelbedsRequest('transfers', '/types/vehicletypes?language=en&from=1&to=1', { method: 'GET' })
  }, 'HB_TRANSFERS')
  cache.set('HB_TRANSFERS', result)
  return result
}

async function viatorHealth(): Promise<HealthResult> {
  const cached = cache.get('VIATOR')
  if (cached && Date.now() - cached.lastChecked < CACHE_TTL_MS) return cached
  if (!process.env.VIATOR_API_KEY) return { status: 'UNKNOWN', lastChecked: Date.now() }
  const result = await probe(async () => {
    const res = await fetch('https://api.viator.com/partner/v2/exchange-rates', {
      headers: { 'exp-api-key': process.env.VIATOR_API_KEY!, 'Accept-Language': 'en-US' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`)
  }, 'VIATOR')
  cache.set('VIATOR', result)
  return result
}

async function hotelbedsActivitiesHealth(): Promise<HealthResult> {
  const cached = cache.get('HB_ACTIVITIES')
  if (cached && Date.now() - cached.lastChecked < CACHE_TTL_MS) return cached
  if (!process.env.HOTELBEDS_ACTIVITIES_API_KEY) return { status: 'UNKNOWN', lastChecked: Date.now() }
  const result = await probe(async () => {
    await hotelbedsRequest('activities', '/types?language=en&from=1&to=1', { method: 'GET' })
  }, 'HB_ACTIVITIES')
  cache.set('HB_ACTIVITIES', result)
  return result
}

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [duffel, hotelbedsHotels, hotelbedsTransfers, viator, hotelbedsActivities] =
    await Promise.all([
      duffelHealth(),
      hotelbedsHotelsHealth(),
      hotelbedsTransfersHealth(),
      viatorHealth(),
      hotelbedsActivitiesHealth(),
    ])

  return NextResponse.json({
    suppliers: {
      DUFFEL:               { ...duffel,              label: 'Duffel (Flights)'        },
      HOTELBEDS_HOTELS:     { ...hotelbedsHotels,     label: 'Hotelbeds Hotels'         },
      HOTELBEDS_TRANSFERS:  { ...hotelbedsTransfers,  label: 'Hotelbeds Transfers'      },
      VIATOR:               { ...viator,              label: 'Viator'                   },
      HOTELBEDS_ACTIVITIES: { ...hotelbedsActivities, label: 'Hotelbeds Activities'     },
    },
    env: process.env.NEXT_PUBLIC_ENV ?? process.env.NODE_ENV ?? 'unknown',
    checkedAt: new Date().toISOString(),
  })
}
